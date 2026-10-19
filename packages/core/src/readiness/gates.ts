/**
 * The single gate function (storage spec section 13.3 as edited at item 13; C54; DECISIONS
 * C06/C07/C41 and D30 rows; HEALTH_SAFETY.md section 1). Every feature that a readiness answer can
 * switch off reads it, through gateInputFromRecords or the app hook useReadinessGates; nothing
 * else restates the rule.
 *
 * gated(q) is "anything but exactly 'no'", so an unanswered question, or any unexpected value,
 * counts as yes (C41). The answers only ever switch features off. A current weight below BMI 18.5
 * for the stored height counts as a yes to question 5 (HS-35; E47): it is a required input, so a
 * caller that forgets the weight does not compile.
 */
import { type DietMode, type ReadinessRecord, type TargetsRecord } from '../storage/records';
import type { Instant, YesNo } from '../storage/primitives';
import {
  READINESS_REASON_IDS,
  type ReadinessGates,
  type ReadinessInput,
  readinessInputFromRows,
  type ReadinessReasonId,
} from '../storage/readiness';
import { setupScheduleReset } from '../fasting/schedule';
import type { LocalDate } from '../util/time';
import { isLowWeight } from '../weight/bmi';

export { READINESS_REASON_IDS, type ReadinessReasonId } from '../storage/readiness';

/** Every feature a readiness answer can switch off. The weight log and its trend are never gated (RD-04). */
export const GATED_FEATURES = Object.freeze([
  'fasting',
  'kickstart',
  'deficit',
  'ketoCeiling',
  'carbCeilingBelow50',
  'projectionBand',
  'goalSetting',
  'energyEstimate',
  'alcoholLogging',
  'exercisePlans',
] as const);
export type GatedFeature = (typeof GATED_FEATURES)[number];

/** ReadinessInput (storage spec 13.2) plus the one derived input that is not an answer (E47). */
export interface GateInput extends ReadinessInput {
  /** isLowWeight(current weight, stored height). Anything but exactly false gates. */
  readonly lowWeight: boolean;
}

/**
 * The only way to build a GateInput from records. Items 14, 15, 21, 22 and 28 use it (or the app
 * hook useReadinessGates), never readinessInputFromRows on its own.
 */
export function gateInputFromRecords(args: {
  readonly rows: readonly ReadinessRecord[];
  readonly birthYear: number | null;
  readonly heightCm: number | null;
  readonly currentWeightKg: number | null;
  readonly today: LocalDate;
}): GateInput {
  return {
    ...readinessInputFromRows(args.rows, args.birthYear, args.today),
    lowWeight: isLowWeight(args.currentWeightKg, args.heightCm),
  };
}

/** True for anything that is not exactly 'no' (C41: unanswered, or any unexpected value, gates). */
export function isGated(answer: unknown): boolean {
  return answer !== 'no';
}

/** The gate outputs (section 13.3). The object and its reasons are frozen. */
export function readinessGates(input: GateInput): ReadinessGates {
  const { answers, confirmations, minimumAgeYears } = input;
  const under18Answer = isGated(answers.q1);
  const under18Year = minimumAgeYears !== null && minimumAgeYears < 18;
  const under18 = under18Answer || under18Year;
  const pregnant = isGated(answers.q2);
  const edOrLow = isGated(answers.q5);
  // Compared as unknown: a value from storage or a cast that is not exactly false (or true for a
  // confirmation) must gate, so nothing but the exact value opens a feature (C41).
  const lowWeight = (input.lowWeight as unknown) !== false;
  const q3Open = isGated(answers.q3) && (confirmations.prescriberAgreed as unknown) !== true;
  const q6Open = isGated(answers.q6) && (confirmations.gpExerciseDiscussed as unknown) !== true;
  const noDeficitGroup = under18 || pregnant || edOrLow || lowWeight;

  const closed: Readonly<Record<ReadinessReasonId, boolean>> = {
    'under-18': under18Answer,
    'under-18-birth-year': under18Year,
    'pregnant-or-breastfeeding': pregnant,
    'diabetes-medication': q3Open,
    'eating-disorder-or-low-weight': edOrLow,
    'low-current-weight': lowWeight,
    'exercise-warning': q6Open,
  };
  const ketoCeilingAvailable = !noDeficitGroup;
  return Object.freeze({
    under18,
    fastingGated: noDeficitGroup || q3Open,
    kickstartAvailable: !noDeficitGroup && !q3Open,
    deficitAllowed: !noDeficitGroup,
    ketoCeilingAvailable,
    carbCeilingBelow50Allowed: ketoCeilingAvailable && !q3Open,
    projectionBandAvailable: !noDeficitGroup,
    goalSettingAvailable: !noDeficitGroup,
    energyEstimateAvailable: !under18,
    alcoholLoggingAvailable: !under18,
    exercisePlansAvailable: !q6Open,
    pharmacistReminder: isGated(answers.q4),
    bloodPressureSaltWording: isGated(answers.q4),
    alcoholHelpCardFromDayOne: isGated(answers.q7),
    reasons: Object.freeze(READINESS_REASON_IDS.filter((id) => closed[id])),
  });
}

/** The reasons that can close the energy deficit and everything tied to it. */
const DEFICIT_GROUP: readonly ReadinessReasonId[] = [
  'under-18',
  'under-18-birth-year',
  'pregnant-or-breastfeeding',
  'eating-disorder-or-low-weight',
  'low-current-weight',
];
const UNDER_18: readonly ReadinessReasonId[] = ['under-18', 'under-18-birth-year'];

/** Which reasons close each feature (item 13 design section 4.1, the featureGate table). */
const CLOSED_BY: Readonly<Record<GatedFeature, readonly ReadinessReasonId[]>> = {
  fasting: [...DEFICIT_GROUP, 'diabetes-medication'],
  kickstart: [...DEFICIT_GROUP, 'diabetes-medication'],
  deficit: DEFICIT_GROUP,
  ketoCeiling: DEFICIT_GROUP,
  carbCeilingBelow50: [...DEFICIT_GROUP, 'diabetes-medication'],
  projectionBand: DEFICIT_GROUP,
  goalSetting: DEFICIT_GROUP,
  energyEstimate: UNDER_18,
  alcoholLogging: UNDER_18,
  exercisePlans: ['exercise-warning'],
};

/**
 * One feature's gate with the reasons that close it, in READINESS_REASON_IDS order, for "hidden
 * with reason" displays (RD-01 to RD-05). `available` always equals the matching readinessGates
 * output (U12).
 */
export function featureGate(
  input: GateInput,
  feature: GatedFeature,
): { available: boolean; reasons: ReadinessReasonId[] } {
  return featureGateOf(readinessGates(input), feature);
}

/** featureGate from gates already computed (a form's own gates, for example). */
export function featureGateOf(
  gates: ReadinessGates,
  feature: GatedFeature,
): { available: boolean; reasons: ReadinessReasonId[] } {
  const closers = CLOSED_BY[feature];
  const reasons = gates.reasons.filter((r) => closers.includes(r));
  return { available: reasons.length === 0, reasons };
}

/** How answer 1 and the birth year agree (C24 point 3). The stricter result always applies through readinessGates. */
export type AgeCrossCheck =
  'consistent' | 'birth-year-under-18' | 'answered-under-18-adult-birth-year';

export function ageCrossCheck(q1: YesNo | null, minimumAgeYears: number | null): AgeCrossCheck {
  if (minimumAgeYears === null) return 'consistent';
  if (q1 === 'no' && minimumAgeYears < 18) return 'birth-year-under-18';
  if (q1 === 'yes' && minimumAgeYears >= 18) return 'answered-under-18-adult-birth-year';
  return 'consistent';
}

/** The first year in which minimumAgeFromBirthYear reaches 18: born 1982 → 2001. */
export function under18LiftYear(birthYear: number): number {
  if (!Number.isInteger(birthYear)) {
    throw new RangeError(`birthYear must be a whole year, got ${birthYear}`);
  }
  return birthYear + 19;
}

/** What a readiness change (or a profile save) runs against (section 6.2). */
export interface GateEffectsContext {
  readonly onboardingCompleted: boolean;
  readonly dietMode: DietMode;
  readonly firstLowCarbAt: Instant | null;
  /** This change wrote a Q3 'yes' row (a changed answer or reanswerAfterChange). */
  readonly q3YesWritten: boolean;
  /** profile.kickstartOptIn as stored when the effects run (after saveProfile's own profile write). */
  readonly kickstartOptIn: boolean;
  readonly targets: Pick<TargetsRecord, 'fastingPreset' | 'presetChosenBy'>;
}

/**
 * The profile and schedule writes a gate change calls for. Ending a Kickstart is not one of them:
 * the one rule for that is item 14's kickstartEndNeeded (weight/phase.ts), which the app's
 * endKickstartIfConditionsFail writes in the same action, after every readiness, profile or
 * weigh-in write (C56).
 */
export interface GateEffects {
  /** profile.carbCeilingStartedAt = now (C72; it drives only the electrolyte reminder, E65). */
  readonly restartCarbCeilingClock: boolean;
  /** profile.firstLowCarbAt = now (C109). */
  readonly setFirstLowCarb: boolean;
  /** profile.kickstartOptIn = false (C06, D31, E52). */
  readonly clearKickstartOptIn: boolean;
  /** Targets preset fields and settings.scheduleConfirmedAt = null (C07, C55, E52). */
  readonly resetSetupSchedule: boolean;
}

/**
 * The writes a gate change calls for (E17; RD-06). Each flag compares before and after, so running
 * the effects again changes nothing more.
 */
export function gateChangeEffects(
  before: ReadinessGates,
  after: ReadinessGates,
  ctx: GateEffectsContext,
): GateEffects {
  const clearKickstartOptIn = ctx.q3YesWritten && ctx.kickstartOptIn;
  return {
    restartCarbCeilingClock:
      ctx.onboardingCompleted &&
      ctx.dietMode === 'keto' &&
      !before.ketoCeilingAvailable &&
      after.ketoCeilingAvailable,
    setFirstLowCarb:
      ctx.onboardingCompleted &&
      ctx.firstLowCarbAt === null &&
      ctx.dietMode !== 'balanced' &&
      after.ketoCeilingAvailable,
    clearKickstartOptIn,
    resetSetupSchedule: setupScheduleReset(ctx.targets, {
      onboardingCompleted: ctx.onboardingCompleted,
      fastingGated: after.fastingGated,
      kickstartChosen: ctx.kickstartOptIn && !clearKickstartOptIn && after.kickstartAvailable,
    }),
  };
}
