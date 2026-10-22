/**
 * The only writers of the first-run flow and the readiness, profile and schedule settings (item 13
 * design section 6.2; E62, E63). Every write goes through the repositories, so it is prepared and
 * validated; nothing here writes an audit row (ordinary owner edits) or starts a Kickstart (E15).
 *
 * - Fresh state first: each action reads the records again and recomputes the gates from them,
 *   not from the rendered form, so a second tab or a stale screen cannot write past a gate.
 * - Marker last: within a step, the settings "step done" marker is written last and every earlier
 *   write can be repeated, so an interruption only shows the step again.
 * - Each repository call is its own transaction (a scope holds only Dexie requests, section
 *   8.5); the order and idempotence here are what make an interruption safe (section 6.2,
 *   Concurrency). For a readiness answer or a profile save, the effects that compare the gates
 *   before and after the change (the Kickstart choice off for a yes to answer 3, the carb-ceiling
 *   clock restarted) are written first, from the gates the change will give; the change itself
 *   next; then the effects that follow from the records as they stand, which run again on every
 *   tap. So a failure at any point leaves nothing that a second tap does not finish.
 * - One rule for the gates' current weight (item 13 section 9.1 rule 2; HS-35): core
 *   weightGateInput, the lowest of the 7-day average, the latest day's mean and the latest
 *   weigh-in, as on the weight screens. One rule for ending a Kickstart (C56): item 14's
 *   endKickstartIfConditionsFail, run in the same action after every readiness, profile or
 *   weigh-in write.
 */
import {
  canCompleteOnboarding,
  type EatingWindow,
  type FastingPresetId,
  gateChangeEffects,
  type GateEffectsContext,
  type GardenCropValue,
  type GardenRecord,
  type GateInput,
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
  scheduleDefaultFor,
  type SettingsRecord,
  setupScheduleReset,
  storedSchedule,
  type TargetsRecord,
  weightGateInput,
  type WeightRecord,
  type YesNo,
} from '@diet/core';
import type { UpdatePatch } from '../db/repos';
import type { AppStorage } from '../db/runtime';
import { clearStaleDayWindows } from '../screens/fasting/dayWindows';
import {
  endKickstartIfConditionsFail,
  kickstartEndsWith,
} from '../screens/weight/kickstartActions';

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
  readonly weights: readonly WeightRecord[];
  readonly targets: TargetsRecord;
  readonly input: GateInput;
  readonly gates: ReadinessGates;
}

async function readFresh(storage: AppStorage): Promise<Fresh> {
  const { repos } = storage;
  const [settings, rows, profile, weights, targets] = await Promise.all([
    repos.settings.get(),
    repos.readiness.list(),
    repos.profile.get(),
    repos.weights.list(),
    repos.targets.get(),
  ]);
  const now = storage.env.now();
  const input = weightGateInput(
    { readiness: rows, profile, weights, homeTimeZone: settings.homeTimeZone },
    localDateOf(now, storage.env.timeZone()),
    now,
  );
  return { settings, rows, profile, weights, targets, input, gates: readinessGates(input) };
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

/** The context gateChangeEffects reads, from fresh records. */
const effectsContext = (fresh: Fresh, q3YesWritten: boolean): GateEffectsContext => ({
  onboardingCompleted: fresh.settings.onboardingCompletedAt !== null,
  dietMode: fresh.profile.dietMode,
  firstLowCarbAt: fresh.profile.firstLowCarbAt,
  q3YesWritten,
  kickstartOptIn: fresh.profile.kickstartOptIn,
  targets: fresh.targets,
});

/**
 * The profile fields a gate change sets that compare the gates before and after it (C72, D31,
 * E52): the carb-ceiling clock restarted when the keto ceiling reopens, and the Kickstart choice
 * off for a yes to answer 3. Written before the change itself (in its own write, or with it), from
 * the gates the change will give, so a failure after them never loses them: the next tap's change
 * finds them done, or writes them again (a later restart only moves a clock that drives the
 * electrolyte reminder).
 */
function transitionPatch(
  before: Fresh,
  after: ReadinessGates,
  q3YesWritten: boolean,
  now: string,
): UpdatePatch<'profile'> {
  const effects = gateChangeEffects(before.gates, after, effectsContext(before, q3YesWritten));
  return {
    ...(effects.restartCarbCeilingClock ? { carbCeilingStartedAt: now } : {}),
    ...(effects.clearKickstartOptIn ? { kickstartOptIn: false } : {}),
  };
}

/**
 * The gates a readiness answer will give. The confirmation an answer to 3 or 6 lapses (D29) is left
 * as stored: neither transitionPatch effect reads it.
 */
const gatesWithAnswer = (input: GateInput, id: ReadinessQuestionId, answer: YesNo) =>
  readinessGates({ ...input, answers: { ...input.answers, [id]: answer } });

/**
 * The writes that follow from the records as they stand (section 4.1, gateChangeEffects; E17,
 * E52), so running them again changes nothing more; every readiness and profile action runs them,
 * also when its own write was already stored (a failure part-way through an earlier tap). First a
 * Kickstart whose conditions no longer hold is ended (running, or not started yet because its
 * start is dated ahead) by item 14's one rule, endKickstartIfConditionsFail: it latches the end, so
 * a failed write never lets Kickstart resume, and the app's reconciler retries it every minute.
 * Then firstLowCarbAt is set once (C109) and a schedule saved earlier in this setup that no longer
 * applies is cleared (C07, C55). Returns the fresh records.
 */
async function settleGateEffects(storage: AppStorage): Promise<Fresh> {
  await endKickstartIfConditionsFail(storage);
  const fresh = await readFresh(storage);
  const effects = gateChangeEffects(fresh.gates, fresh.gates, effectsContext(fresh, false));
  if (effects.setFirstLowCarb) {
    await storage.repos.profile.update({ firstLowCarbAt: storage.env.now() });
  }
  if (effects.resetSetupSchedule) await clearSetupSchedule(storage);
  return fresh;
}

/** Writes the transition fields first, when there are any. */
async function writeTransition(storage: AppStorage, patch: UpdatePatch<'profile'>): Promise<void> {
  if (Object.keys(patch).length > 0) await storage.repos.profile.update(patch);
}

/** "I understand" (HS-20): the acknowledgement, set once and never overwritten. */
export async function acknowledgeNotice(storage: AppStorage): Promise<void> {
  const settings = await storage.repos.settings.get();
  if (settings.alcoholNoticeAckAt !== null) return;
  await storage.repos.settings.update({ alcoholNoticeAckAt: storage.env.now() });
}

/** Ask before saving a change that would end a running Kickstart (Settings; F23, F32). */
export interface KickstartEndAsk {
  readonly askBeforeEndingKickstart?: boolean;
}

/**
 * A Yes or No tap (section 3.6). The answer already stored under the current wording writes
 * nothing, so a confirmation never lapses through an accidental tap (E6), but its gate effects are
 * settled again; a different answer is written (lapsing the Q3 or Q6 confirmation in the same
 * transaction, D29) between its transition fields and the settled effects. With
 * askBeforeEndingKickstart (Settings), a different answer that would end a running Kickstart
 * writes nothing and reports kickstartEndNeedsConfirm, so the screen can say so and ask first.
 */
export async function answerReadiness(
  storage: AppStorage,
  id: ReadinessQuestionId,
  answer: YesNo,
  options: KickstartEndAsk = {},
): Promise<{ readonly written: boolean; readonly kickstartEndNeedsConfirm: boolean }> {
  const before = await readFresh(storage);
  const written = before.input.answers[id] !== answer;
  if (written) {
    const after = gatesWithAnswer(before.input, id, answer);
    if (options.askBeforeEndingKickstart === true && (await kickstartEndsWith(storage, after))) {
      return { written: false, kickstartEndNeedsConfirm: true };
    }
    const q3Yes = id === 'q3' && answer === 'yes';
    await writeTransition(storage, transitionPatch(before, after, q3Yes, storage.env.now()));
    await storage.repos.readiness.answer(id, answer);
  }
  await settleGateEffects(storage);
  return { written, kickstartEndNeedsConfirm: false };
}

/** The prescriber or GP confirmation switch (D29). The repository refuses it without a current answer. */
export async function setConfirmation(
  storage: AppStorage,
  id: ReadinessConfirmationId,
  answer: YesNo,
): Promise<void> {
  await storage.repos.readiness.answer(id, answer);
  await settleGateEffects(storage);
}

/**
 * "My medication or dose has changed" / "My symptoms have changed" (E53): a fresh yes, which
 * lapses the confirmation, ends a running Kickstart and turns the Kickstart choice off.
 */
export async function reanswerAfterChange(storage: AppStorage, q: 'q3' | 'q6'): Promise<void> {
  const before = await readFresh(storage);
  const after = gatesWithAnswer(before.input, q, 'yes');
  await writeTransition(storage, transitionPatch(before, after, q === 'q3', storage.env.now()));
  await storage.repos.readiness.answer(q, 'yes');
  await settleGateEffects(storage);
}

/**
 * A weigh-in written, edited or removed after setup (item 14's Log weight and Weigh-ins; item 13
 * section 9.1 rule 2; HS-35). The gates' current weight can cross BMI 18.5, so the gate effects
 * run in the same action, after the write: a running Kickstart ends at once when the weight turns
 * low, and the carb-ceiling clocks restart when it no longer is. The weigh-in stands even if an
 * effect cannot be written (the Kickstart end is latched and retried by the reconciler), so its
 * own result is what the caller reports.
 */
export async function writeWeighIn<T>(storage: AppStorage, write: () => Promise<T>): Promise<T> {
  const before = await readFresh(storage);
  const result = await write();
  await (async () => {
    const fresh = await settleGateEffects(storage);
    await writeTransition(storage, transitionPatch(before, fresh.gates, false, storage.env.now()));
  })().catch(() => undefined);
  return result;
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
 * for the step that follows (the schedule is skipped while fasting is gated). In Settings, with
 * askBeforeEndingKickstart, a birth year or height that would end a running Kickstart writes
 * nothing and reports kickstartEndNeedsConfirm (F23).
 */
export async function saveProfile(
  storage: AppStorage,
  value: ProfileFormValue,
  mode: 'onboarding' | 'settings',
  options: KickstartEndAsk = {},
): Promise<{ readonly gates: ReadinessGates; readonly kickstartEndNeedsConfirm: boolean }> {
  const { repos, env } = storage;
  const now = env.now();
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
  const before = await readFresh(storage);
  if (mode === 'settings') {
    // The new height and birth year can move the gates (HS-32, HS-35): the transition fields are
    // written with the profile, in the same write.
    const after = readinessGates(
      weightGateInput(
        {
          readiness: before.rows,
          profile: { birthYear: value.birthYear, heightCm: value.heightCm },
          weights: before.weights,
          homeTimeZone: before.settings.homeTimeZone,
        },
        localDateOf(now, env.timeZone()),
        now,
      ),
    );
    if (options.askBeforeEndingKickstart === true && (await kickstartEndsWith(storage, after))) {
      return { gates: before.gates, kickstartEndNeedsConfirm: true };
    }
    await repos.profile.update({ ...common, ...transitionPatch(before, after, false, now) });
    return { gates: (await settleGateEffects(storage)).gates, kickstartEndNeedsConfirm: false };
  }
  await saveOnboardingWeight(storage, value.weightKg);
  // Kickstart is stored on only if the fresh records, with this save's birth year, height and
  // weight, leave it available (E14, E63).
  const withValue = weightGateInput(
    {
      readiness: before.rows,
      profile: { birthYear: value.birthYear, heightCm: value.heightCm },
      weights: await repos.weights.list(),
      homeTimeZone: before.settings.homeTimeZone,
    },
    localDateOf(now, env.timeZone()),
    now,
  );
  const kickstartOptIn = value.kickstartOptIn && readinessGates(withValue).kickstartAvailable;
  await repos.profile.update({
    ...common,
    kickstartOptIn,
    ...goalPatch(before.profile, value, now),
  });
  const after = await settleGateEffects(storage);
  if (after.settings.profileConfirmedAt === null) {
    await repos.settings.update({ profileConfirmedAt: now });
  }
  return { gates: after.gates, kickstartEndNeedsConfirm: false };
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
  /**
   * The setup step's one reflux switch, which sets both preferences. Null in Settings, where they
   * are the Reflux card's two switches (item 15, F8) and a pattern save leaves them alone.
   */
  readonly reflux: boolean | null;
}

/**
 * The preset fields a schedule save writes. presetChosenBy keeps a default only while the saved
 * schedule equals it (E19), and with answer 4 is always the owner's (E49). Item 15's form shows,
 * before Save, what this would clear.
 */
export function scheduleTargetsPatch(
  save: ScheduleSave,
  targets: Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'>,
  basis: { readonly pharmacistReminder: boolean; readonly kickstartChosen: boolean },
): Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'> {
  if (save.choice === 'none' || save.window === null) {
    return { fastingPreset: null, eatingWindow: null, presetChosenBy: null };
  }
  const preset: FastingPresetId | 'custom' = save.choice;
  return {
    fastingPreset: preset,
    eatingWindow: { start: save.window.start, end: save.window.end },
    presetChosenBy: scheduleChosenBy(
      { preset, window: save.window },
      scheduleDefaultFor(basis),
      storedSchedule(targets),
    ),
  };
}

/**
 * The eating schedule (section 3.9). Refused, writing nothing, when the fresh records gate fasting
 * (C07, E63). The reflux preferences are written only from the setup step's switch (item 15, F8).
 * After the targets write, the per-day windows the new pattern no longer fits are removed (item
 * 15; C30). The step's marker is set the first time a schedule is saved, in Settings too (a setup
 * that skipped the step), so "nothing saved yet" then stops.
 */
export async function saveSchedule(storage: AppStorage, save: ScheduleSave): Promise<void> {
  const fresh = await readFresh(storage);
  if (fresh.gates.fastingGated) throw new FlowStaleError('fasting-gated');
  await storage.repos.targets.update({
    ...scheduleTargetsPatch(save, fresh.targets, {
      pharmacistReminder: fresh.gates.pharmacistReminder,
      kickstartChosen: fresh.profile.kickstartOptIn && fresh.gates.kickstartAvailable,
    }),
    ...(save.reflux === null
      ? {}
      : { refluxPreferEarlier: save.reflux, refluxPreferSplit: save.reflux }),
  });
  await clearStaleDayWindows(storage);
  if (fresh.settings.scheduleConfirmedAt === null) {
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
    pharmacistReminder: fresh.gates.pharmacistReminder,
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
