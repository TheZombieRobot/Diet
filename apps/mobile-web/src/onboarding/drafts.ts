/**
 * The forms' drafts: where each starts from the stored records, and what Continue or Save would
 * store (item 13 design sections 3.3, 3.8, 3.9 and 3.11). A draft lives in flow memory, so typing
 * survives every detour and Back, but not a reload (E28, E60).
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
  scheduleStart,
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

/** The schedule form while it is being filled in. */
export interface ScheduleDraft {
  /** null: nothing chosen yet (answer 4, E49). */
  readonly choice: ScheduleChoice | null;
  readonly start: string;
  readonly end: string;
  readonly reflux: boolean;
}

const FALLBACK_WINDOW: EatingWindow = presetWindow('22:2');

/** Where the schedule form starts without a draft (scheduleStart; section 3.9). */
export function scheduleDraftFrom(args: {
  readonly targets: TargetsRecord;
  readonly scheduleConfirmed: boolean;
  readonly pharmacistReminder: boolean;
  readonly kickstartChosen: boolean;
}): ScheduleDraft {
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

/** An empty "Add a crop" form: ready to harvest by default (UX 1f). */
export const EMPTY_CROP: GardenCropDraft = {
  name: '',
  amount: '',
  unit: null,
  harvestReady: true,
  keepsDays: '',
};
