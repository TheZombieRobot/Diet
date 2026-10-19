/**
 * The only writers of the first-run flow and the readiness, profile and schedule settings (item 13
 * design section 6.2; E62, E63). Every write goes through the repositories, so it is prepared and
 * validated; nothing here writes an audit row (ordinary owner edits) or starts a Kickstart (E15).
 *
 * - Fresh state first: each action reads the records again and recomputes the gates from them,
 *   not from the rendered form, so a second tab or a stale screen cannot write past a gate.
 * - Marker last: within a step, the settings "step done" marker is written last and every earlier
 *   write can be repeated, so an interruption only shows the step again.
 * - Each repository call is its own transaction; the order and idempotence above are what make an
 *   interruption safe (section 6.2, Concurrency).
 */
import {
  canCompleteOnboarding,
  defaultSchedule,
  type EatingWindow,
  extensionsOf,
  type FastingPresetId,
  gateChangeEffects,
  type GardenCropValue,
  type GardenRecord,
  type GateInput,
  gateInputFromRecords,
  kickstartPeriodState,
  localDateOf,
  onboardingCompletionPatch,
  type ProfileFormValue,
  type ProfileRecord,
  type ReadinessConfirmationId,
  type ReadinessGates,
  readinessGates,
  type ReadinessQuestionId,
  type ReadinessRecord,
  scheduleChosenBy,
  type ScheduleChoice,
  type SettingsRecord,
  setupScheduleReset,
  type TargetsRecord,
  type YesNo,
} from '@diet/core';
import type { UpdatePatch } from '../db/repos';
import type { AppStorage } from '../db/runtime';
import { latestWeightKg } from './state';

/** The records changed under the screen, so nothing was written; the view follows the live gates. */
export class FlowStaleError extends Error {
  readonly reason: 'fasting-gated' | 'not-ready';

  constructor(reason: 'fasting-gated' | 'not-ready') {
    super(`The setup step no longer applies: ${reason}`);
    this.reason = reason;
  }
}
FlowStaleError.prototype.name = 'FlowStaleError';

interface Fresh {
  readonly settings: SettingsRecord;
  readonly rows: readonly ReadinessRecord[];
  readonly profile: ProfileRecord;
  readonly latestWeightKg: number | null;
  readonly targets: TargetsRecord;
  readonly input: GateInput;
  readonly gates: ReadinessGates;
}

async function readFresh(storage: AppStorage): Promise<Fresh> {
  const { repos, env } = storage;
  const [settings, rows, profile, weights, targets] = await Promise.all([
    repos.settings.get(),
    repos.readiness.list(),
    repos.profile.get(),
    repos.weights.list(),
    repos.targets.get(),
  ]);
  const latest = latestWeightKg(weights);
  const input = gateInputFromRecords({
    rows,
    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    currentWeightKg: latest,
    today: localDateOf(env.now(), env.timeZone()),
  });
  return {
    settings,
    rows,
    profile,
    latestWeightKg: latest,
    targets,
    input,
    gates: readinessGates(input),
  };
}

/**
 * Whether the latest Kickstart period can still be ended (kickstartPeriodState; section 0): it is
 * running, or not yet started because its start is dated ahead (the clock was ahead when it
 * started). kickstart.endPeriod ends either, so a gate that closes also stops a period dated ahead
 * from beginning once its day 1 arrives.
 */
async function kickstartNotOver(storage: AppStorage, home: string): Promise<boolean> {
  const [periods, checks] = await Promise.all([
    storage.repos.kickstart.listPeriods(),
    storage.repos.kickstart.listChecks(),
  ]);
  const latest = [...periods].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)).at(-1);
  if (latest === undefined) return false;
  const { env } = storage;
  const state = kickstartPeriodState(
    latest,
    extensionsOf(latest.id, checks),
    env.now(),
    env.timeZone(),
    home,
  );
  return state === 'running' || state === 'not-started';
}

/** Clears a schedule saved earlier in this setup: the marker first, so it is never left confirmed. */
async function clearSetupSchedule(storage: AppStorage): Promise<void> {
  await storage.repos.settings.update({ scheduleConfirmedAt: null });
  await storage.repos.targets.update({
    fastingPreset: null,
    eatingWindow: null,
    presetChosenBy: null,
  });
}

/**
 * The writes a gate change calls for (section 4.1, gateChangeEffects; E17, E52), from the gates
 * before the change and the fresh records after it.
 */
async function runGateEffects(
  storage: AppStorage,
  before: ReadinessGates,
  q3YesWritten: boolean,
): Promise<Fresh> {
  const after = await readFresh(storage);
  const effects = gateChangeEffects(before, after.gates, {
    onboardingCompleted: after.settings.onboardingCompletedAt !== null,
    dietMode: after.profile.dietMode,
    firstLowCarbAt: after.profile.firstLowCarbAt,
    kickstartRunning: await kickstartNotOver(storage, after.settings.homeTimeZone),
    q3YesWritten,
    kickstartOptIn: after.profile.kickstartOptIn,
    targets: after.targets,
  });
  const now = storage.env.now();
  if (effects.endKickstart) await storage.repos.kickstart.endPeriod('readiness-gated');
  const patch: UpdatePatch<'profile'> = {
    ...(effects.restartCarbCeilingClock ? { carbCeilingStartedAt: now } : {}),
    ...(effects.setFirstLowCarb ? { firstLowCarbAt: now } : {}),
    ...(effects.clearKickstartOptIn ? { kickstartOptIn: false } : {}),
  };
  if (Object.keys(patch).length > 0) await storage.repos.profile.update(patch);
  if (effects.resetSetupSchedule) await clearSetupSchedule(storage);
  return after;
}

/** "I understand" (HS-20): the acknowledgement, set once and never overwritten. */
export async function acknowledgeNotice(storage: AppStorage): Promise<void> {
  const settings = await storage.repos.settings.get();
  if (settings.alcoholNoticeAckAt !== null) return;
  await storage.repos.settings.update({ alcoholNoticeAckAt: storage.env.now() });
}

/**
 * A Yes or No tap (section 3.6). The answer already stored under the current wording writes
 * nothing, so a confirmation never lapses through an accidental tap (E6); a different answer is
 * written (lapsing the Q3 or Q6 confirmation in the same transaction, D29) and the gate effects run.
 */
export async function answerReadiness(
  storage: AppStorage,
  id: ReadinessQuestionId,
  answer: YesNo,
): Promise<{ readonly written: boolean }> {
  const before = await readFresh(storage);
  if (before.input.answers[id] === answer) return { written: false };
  await storage.repos.readiness.answer(id, answer);
  await runGateEffects(storage, before.gates, id === 'q3' && answer === 'yes');
  return { written: true };
}

/** The prescriber or GP confirmation switch (D29). The repository refuses it without a current answer. */
export async function setConfirmation(
  storage: AppStorage,
  id: ReadinessConfirmationId,
  answer: YesNo,
): Promise<void> {
  const before = await readFresh(storage);
  await storage.repos.readiness.answer(id, answer);
  await runGateEffects(storage, before.gates, false);
}

/**
 * "My medication or dose has changed" / "My symptoms have changed" (E53): a fresh yes, which
 * lapses the confirmation, ends a running Kickstart and turns the Kickstart choice off.
 */
export async function reanswerAfterChange(storage: AppStorage, q: 'q3' | 'q6'): Promise<void> {
  const before = await readFresh(storage);
  await storage.repos.readiness.answer(q, 'yes');
  await runGateEffects(storage, before.gates, q === 'q3');
}

/** The onboarding weigh-in: one row, updated in place, removed when cleared while optional (E36). */
async function saveOnboardingWeight(storage: AppStorage, kg: number | null): Promise<void> {
  const { repos, env } = storage;
  const existing = (await repos.weights.list()).find((w) => w.source === 'onboarding');
  if (kg === null) {
    if (existing !== undefined) await repos.weights.remove(existing.id);
    return;
  }
  if (existing === undefined) {
    await repos.weights.addOnboardingWeight({
      kg,
      at: env.now(),
      timeZone: env.timeZone(),
      note: null,
    });
  } else if (existing.kg !== kg) {
    await repos.weights.update(existing.id, { kg });
  }
}

/**
 * The profile step or the Settings profile screen (section 6.2). Returns the gates after the save,
 * for the step that follows (the schedule is skipped while fasting is gated).
 */
export async function saveProfile(
  storage: AppStorage,
  value: ProfileFormValue,
  mode: 'onboarding' | 'settings',
): Promise<{ readonly gates: ReadinessGates }> {
  const { repos, env } = storage;
  const before = await readFresh(storage);
  const common: UpdatePatch<'profile'> = {
    heightCm: value.heightCm,
    birthYear: value.birthYear,
    sex: value.sex,
    activityLevel: value.activityLevel,
    equipmentBands: value.equipmentBands,
    equipmentDumbbells: value.equipmentDumbbells,
    householdSize: value.householdSize,
    allergens: [...value.allergens],
    dislikeTerms: [...value.dislikeTerms],
    glutenFreeHousehold: value.glutenFreeHousehold,
  };
  if (mode === 'settings') {
    await repos.profile.update(common);
    const after = await runGateEffects(storage, before.gates, false);
    return { gates: after.gates };
  }
  const now = env.now();
  await saveOnboardingWeight(storage, value.weightKg);
  // Kickstart is stored on only if the fresh records, with this save's birth year, height and
  // weight, leave it available (E14, E63).
  const withValue = gateInputFromRecords({
    rows: before.rows,
    birthYear: value.birthYear,
    heightCm: value.heightCm,
    currentWeightKg: latestWeightKg(await repos.weights.list()),
    today: localDateOf(now, env.timeZone()),
  });
  const kickstartOptIn = value.kickstartOptIn && readinessGates(withValue).kickstartAvailable;
  await repos.profile.update({
    ...common,
    kickstartOptIn,
    ...goalPatch(before.profile, value, now),
  });
  const after = await runGateEffects(storage, before.gates, false);
  if (after.settings.profileConfirmedAt === null) {
    await repos.settings.update({ profileConfirmedAt: now });
  }
  return { gates: after.gates };
}

/**
 * The goal fields (C42): all three null for no goal; a new set time and reference weight when the
 * goal or the weight changed or no goal was stored; otherwise as stored. Nothing when the goal
 * field was not shown (a stored goal is never deleted that way).
 */
function goalPatch(
  stored: ProfileRecord,
  value: ProfileFormValue,
  now: string,
): UpdatePatch<'profile'> {
  if (!value.goal.write) return {};
  const { goalKg } = value.goal;
  if (goalKg === null) return { goalKg: null, goalSetAt: null, goalReferenceKg: null };
  const unchanged =
    stored.goalKg === goalKg &&
    stored.goalReferenceKg === value.weightKg &&
    stored.goalSetAt !== null;
  if (unchanged) return {};
  return { goalKg, goalSetAt: now, goalReferenceKg: value.weightKg };
}

/** A schedule as the form saves it: a pattern with its window, or no fasting plan. */
export interface ScheduleSave {
  readonly choice: ScheduleChoice;
  /** Null exactly for 'none'. */
  readonly window: EatingWindow | null;
  readonly reflux: boolean;
}

/**
 * The eating schedule (section 3.9). Refused, writing nothing, when the fresh records gate fasting
 * (C07, E63). presetChosenBy keeps a default only while the saved schedule equals it (E19).
 */
export async function saveSchedule(
  storage: AppStorage,
  save: ScheduleSave,
  mode: 'onboarding' | 'settings',
): Promise<void> {
  const fresh = await readFresh(storage);
  if (fresh.gates.fastingGated) throw new FlowStaleError('fasting-gated');
  const { targets, profile } = fresh;
  const reflux = { refluxPreferEarlier: save.reflux, refluxPreferSplit: save.reflux };
  if (save.choice === 'none' || save.window === null) {
    await storage.repos.targets.update({
      fastingPreset: null,
      eatingWindow: null,
      presetChosenBy: null,
      ...reflux,
    });
  } else {
    const preset: FastingPresetId | 'custom' = save.choice;
    const stored =
      targets.fastingPreset === null ||
      targets.eatingWindow === null ||
      targets.presetChosenBy === null
        ? null
        : {
            preset: targets.fastingPreset,
            window: targets.eatingWindow,
            chosenBy: targets.presetChosenBy,
          };
    const defaults = defaultSchedule(profile.kickstartOptIn && fresh.gates.kickstartAvailable);
    await storage.repos.targets.update({
      fastingPreset: preset,
      eatingWindow: { start: save.window.start, end: save.window.end },
      presetChosenBy: scheduleChosenBy({ preset, window: save.window }, defaults, stored),
      ...reflux,
    });
  }
  if (mode === 'onboarding' && fresh.settings.scheduleConfirmedAt === null) {
    await storage.repos.settings.update({ scheduleConfirmedAt: storage.env.now() });
  }
}

/** Adds a crop at setup; it is written at once, so a reload keeps it. Nothing is invented (E23). */
export function addCrop(storage: AppStorage, value: GardenCropValue): Promise<GardenRecord> {
  return storage.repos.garden.create({
    ingredientId: null,
    name: value.name,
    amount: value.amount,
    unit: value.unit,
    gramsPerUnit: null,
    harvestReady: value.harvestReady,
    harvestedAt: null,
    perishabilityDays: value.perishabilityDays,
  });
}

export function removeCrop(storage: AppStorage, id: string): Promise<void> {
  return storage.repos.garden.remove(id);
}

/**
 * Steps (0) and (1) of finishing (section 6.2): a schedule left stored while fasting is gated (an
 * interruption) is cleared, and, when setup can complete, the profile clocks are filled (C72,
 * C109). Returns the progress and whether setup can complete.
 */
async function prepareCompletion(
  storage: AppStorage,
): Promise<{ readonly canComplete: boolean; readonly settings: SettingsRecord }> {
  const fresh = await readFresh(storage);
  let settings = fresh.settings;
  const reset = setupScheduleReset(fresh.targets, {
    onboardingCompleted: settings.onboardingCompletedAt !== null,
    fastingGated: fresh.gates.fastingGated,
    kickstartChosen: fresh.profile.kickstartOptIn && fresh.gates.kickstartAvailable,
  });
  if (reset) {
    await clearSetupSchedule(storage);
    settings = { ...settings, scheduleConfirmedAt: null };
  }
  const canComplete = canCompleteOnboarding(settings, fresh.input, fresh.profile);
  if (canComplete) {
    const patch = onboardingCompletionPatch(fresh.profile, fresh.gates, storage.env.now());
    if (Object.keys(patch).length > 0) await storage.repos.profile.update(patch);
  }
  return { canComplete, settings };
}

/**
 * Continue or "Skip for now" on the garden step (E24): the garden marker and, when every earlier
 * step is done, the completion time, in one settings write. The settings repository then asks
 * again for persistent storage (PWA-06).
 */
export async function finishGarden(storage: AppStorage): Promise<{ readonly completed: boolean }> {
  const { canComplete, settings } = await prepareCompletion(storage);
  const now = storage.env.now();
  await storage.repos.settings.update({
    gardenConfirmedAt: settings.gardenConfirmedAt ?? now,
    ...(canComplete ? { onboardingCompletedAt: now } : {}),
  });
  return { completed: canComplete };
}

/** "Go to Today" on the defensive finish view (E44). */
export async function completeOnboarding(storage: AppStorage): Promise<void> {
  const { canComplete } = await prepareCompletion(storage);
  if (!canComplete) throw new FlowStaleError('not-ready');
  await storage.repos.settings.update({ onboardingCompletedAt: storage.env.now() });
}
