/**
 * The forms' drafts: where each starts from the stored records, and what Continue or Save would
 * store (item 13 design sections 3.3, 3.8, 3.9 and 3.11). A draft lives in flow memory, so typing
 * survives every detour and Back, but not a reload (E28, E60). A draft follows the answers it was
 * started under: a schedule draft started under other gates is set aside, and the Kickstart switch
 * of a profile draft goes back to its default when answer 3 or its confirmation changes.
 */
import {
  checkEatingWindowForm,
  type EatingWindow,
  type GardenCropDraft,
  type GateInput,
  kickstartChoice,
  type ProfileDraft,
  presetWindow,
  type ReadinessGates,
  type ScheduleChoice,
  scheduleChosenBy,
  scheduleDefaultFor,
  scheduleStart,
  storedSchedule,
  type TargetsRecord,
} from '@diet/core';
import type { ScheduleSave } from './actions';
import type { OnboardingState } from './state';

const text = (n: number | null): string => (n === null ? '' : String(n));

/** The profile form's starting values from the stored records (section 3.8, Prefill). */
export function profileDraftFrom(
  state: OnboardingState,
  gates: ReadinessGates,
  input: GateInput,
): ProfileDraft {
  const { profile, settings } = state;
  return {
    heightCm: text(profile.heightCm),
    weightKg: text(state.latestWeightKg),
    birthYear: text(profile.birthYear),
    goalKg: text(profile.goalKg),
    sex: profile.sex,
    activityLevel: profile.activityLevel,
    equipmentBands: profile.equipmentBands,
    equipmentDumbbells: profile.equipmentDumbbells,
    householdSize: profile.householdSize,
    allergens: profile.allergens,
    dislikeTerms: profile.dislikeTerms,
    glutenFreeHousehold: profile.glutenFreeHousehold,
    kickstartOptIn: kickstartChoice(
      gates,
      input.answers.q3,
      profile.kickstartOptIn,
      settings.profileConfirmedAt !== null,
    ).value,
  };
}

/** The gates a schedule form starts from: answer 4 (nothing chosen) and the Kickstart choice. */
export interface ScheduleBasis {
  readonly pharmacistReminder: boolean;
  readonly kickstartChosen: boolean;
}

/** The schedule form while it is being filled in. */
export interface ScheduleDraft {
  /** null: nothing chosen yet (answer 4, E49). */
  readonly choice: ScheduleChoice | null;
  readonly start: string;
  readonly end: string;
  readonly reflux: boolean;
  /** The gates it was started under; a draft started under others is set aside (C07, C55). */
  readonly basis: ScheduleBasis;
}

/** The draft still fits the gates: answer 4 and the Kickstart choice are as when it started. */
export function scheduleDraftFits(draft: ScheduleDraft, basis: ScheduleBasis): boolean {
  return (
    draft.basis.pharmacistReminder === basis.pharmacistReminder &&
    draft.basis.kickstartChosen === basis.kickstartChosen
  );
}

const FALLBACK_WINDOW: EatingWindow = presetWindow('22:2');

/** Where the schedule form starts without a draft (scheduleStart; section 3.9). */
export function scheduleDraftFrom(
  args: {
    readonly targets: TargetsRecord;
    readonly scheduleConfirmed: boolean;
  } & ScheduleBasis,
): ScheduleDraft {
  const start = scheduleStart({
    stored: args.targets,
    scheduleConfirmed: args.scheduleConfirmed,
    pharmacistReminder: args.pharmacistReminder,
    kickstartChosen: args.kickstartChosen,
  });
  const window = start.window ?? FALLBACK_WINDOW;
  return {
    choice: start.choice,
    start: window.start,
    end: window.end,
    reflux: args.targets.refluxPreferEarlier || args.targets.refluxPreferSplit,
    basis: { pharmacistReminder: args.pharmacistReminder, kickstartChosen: args.kickstartChosen },
  };
}

export type ScheduleCheck =
  | { readonly ok: true; readonly save: ScheduleSave }
  | {
      readonly ok: false;
      readonly problem: 'choose-pattern' | 'invalid-time' | 'same-time' | 'too-short';
    };

/** What Continue or Save would store, or why it cannot. */
export function checkScheduleDraft(draft: ScheduleDraft): ScheduleCheck {
  if (draft.choice === null) return { ok: false, problem: 'choose-pattern' };
  if (draft.choice === 'none') {
    return { ok: true, save: { choice: 'none', window: null, reflux: draft.reflux } };
  }
  const window = checkEatingWindowForm(draft.start, draft.end);
  if (!window.ok) return { ok: false, problem: window.problem };
  return { ok: true, save: { choice: draft.choice, window: window.window, reflux: draft.reflux } };
}

/**
 * Who a saved draft would be recorded as chosen by (scheduleChosenBy, as saveSchedule records it),
 * or null for "No fasting plan" or a draft that cannot be saved yet. The form shows the Kickstart
 * note only for the untouched Kickstart default.
 */
export function scheduleDraftSavedAs(
  draft: ScheduleDraft,
  targets: TargetsRecord,
): 'kickstart-default' | 'default' | 'user' | null {
  const checked = checkScheduleDraft(draft);
  if (!checked.ok || checked.save.choice === 'none' || checked.save.window === null) return null;
  return scheduleChosenBy(
    { preset: checked.save.choice, window: checked.save.window },
    scheduleDefaultFor(draft.basis),
    storedSchedule(targets),
  );
}

/**
 * An empty "Add a crop" form (UX 1f). Not ready by default, as on the garden screen (item 19, G16):
 * a crop counts only once the owner says it is ready to use, so a seedling listed at setup never
 * stops it being bought.
 */
export const EMPTY_CROP: GardenCropDraft = {
  name: '',
  amount: '',
  unit: null,
  harvestReady: false,
  keepsDays: '',
};
