/**
 * The profile form at setup and in Settings (UX 1d; C04, C24, C25, C42, C43; HS-01 floor part,
 * HS-35; item 13 design section 4.6). Pure: the screen keeps the typed text as a draft and asks
 * this module, on every change, which fields to show and, on Continue, what is wrong.
 *
 * The gates are computed from the draft as well as the stored answers, so typing a birth year that
 * may be under 18, or a weight low for the height, hides the goal and Kickstart at once. The
 * long-term goal is limited only by the BMI 18.5 floor here; the 20% rule applies to the derived
 * milestone at item 14 (DECISIONS C04 row).
 */
import { EARLIEST_BIRTH_YEAR, minimumAgeFromBirthYear } from '../energy/age';
import type { ActivityLevel } from '../energy/energyEstimate';
import { type AgeCrossCheck, ageCrossCheck, isGated, readinessGates } from '../readiness/gates';
import { USER_ALLERGENS, type UserAllergen } from '../storage/allergens';
import { normalizeText, type YesNo } from '../storage/primitives';
import type { ReadinessGates, ReadinessInput } from '../storage/readiness';
import type { ProfileSex } from '../storage/records';
import { parseOptionalNumber } from '../util/parse';
import { type LocalDate, parseLocalDate } from '../util/time';
import { isLowWeight, meetsBmiFloor } from '../weight/bmi';
import { goalVisible } from '../weight/goal';
import { WEIGHT_LIMITS_KG } from '../weight/trend';

/** What the form holds while typing: number fields stay text until they are checked. */
export interface ProfileDraft {
  readonly heightCm: string;
  readonly weightKg: string;
  readonly birthYear: string;
  readonly goalKg: string;
  readonly sex: ProfileSex | null;
  readonly activityLevel: ActivityLevel;
  readonly equipmentBands: boolean;
  readonly equipmentDumbbells: boolean;
  readonly householdSize: number;
  readonly allergens: readonly UserAllergen[];
  readonly dislikeTerms: readonly string[];
  readonly glutenFreeHousehold: boolean;
  readonly kickstartOptIn: boolean;
}

export interface ProfileFormContext {
  readonly mode: 'onboarding' | 'settings';
  /** minimumAgeYears is replaced from the draft's birth year when it parses. */
  readonly readiness: ReadinessInput;
  /**
   * Settings mode: the current weight the gates read (item 14's gateCurrentWeightKg: the lower of
   * the 7-day average and the latest weigh-in), for the low-weight check.
   */
  readonly storedWeightKg: number | null;
  readonly today: LocalDate;
  /** Settings mode: for goalHiddenByHeight. */
  readonly storedGoalKg: number | null;
}

/** The fields that can have a problem, in form order (focus goes to the first). */
export const PROFILE_FIELD_IDS = Object.freeze([
  'heightCm',
  'weightKg',
  'birthYear',
  'sex',
  'goalKg',
  'householdSize',
] as const);
export type ProfileFieldId = (typeof PROFILE_FIELD_IDS)[number];

export type ProfileProblem =
  | 'required'
  | 'not-a-number'
  | 'one-decimal'
  | 'range'
  | 'future-year'
  | 'goal-needs-height'
  | 'goal-needs-weight'
  | 'goal-not-below-weight'
  | 'goal-below-bmi-floor';

export interface ProfileFormValue {
  readonly heightCm: number;
  readonly birthYear: number;
  readonly sex: ProfileSex;
  /** Onboarding only; null = not entered (only when optional). */
  readonly weightKg: number | null;
  /** write false: the stored goal is kept, never deleted (C42). */
  readonly goal:
    { readonly write: false } | { readonly write: true; readonly goalKg: number | null };
  /** Onboarding only; false when the switch is not shown (E14). */
  readonly kickstartOptIn: boolean;
  readonly activityLevel: ActivityLevel;
  readonly equipmentBands: boolean;
  readonly equipmentDumbbells: boolean;
  readonly householdSize: number;
  readonly allergens: readonly UserAllergen[];
  readonly dislikeTerms: readonly string[];
  readonly glutenFreeHousehold: boolean;
}

export interface ProfileFormCheck {
  /** From the draft's birth year, height and weight when valid. */
  readonly gates: ReadinessGates;
  readonly ageCheck: AgeCrossCheck;
  /**
   * The typed birth year when it is valid, else null. The under-18 notice names the year its
   * settings lift from this, never from a year the form refuses (the gates then use the stored one).
   */
  readonly validBirthYear: number | null;
  readonly weightCheck: 'consistent' | 'low-weight-answered-no';
  readonly show: {
    readonly weight: boolean;
    readonly weightRequired: boolean;
    readonly goal: boolean;
    readonly kickstart: boolean;
  };
  /** Settings mode: the stored goal is below the floor for the new height (shown, never refused; E41). */
  readonly goalHiddenByHeight: boolean;
  readonly problems: Readonly<Partial<Record<ProfileFieldId, ProfileProblem>>>;
  /** null iff problems is not empty. */
  readonly value: ProfileFormValue | null;
}

const HEIGHT_CM = { min: 120, max: 230 } as const;
const HOUSEHOLD = { min: 1, max: 20 } as const;

const ONE_DECIMAL_AT_MOST = /^\s*\d+(?:\.\d)?\s*$/;

/**
 * parseOptionalNumber, plus a RangeError('one-decimal') for more than one decimal place: kg and cm
 * take at most one (E12).
 */
export function parseTenths(input: string): number | undefined {
  const value = parseOptionalNumber(input);
  if (value !== undefined && !ONE_DECIMAL_AT_MOST.test(input)) throw new RangeError('one-decimal');
  return value;
}

type Read = { readonly value?: number; readonly problem?: ProfileProblem };

/** A tenths field: empty, a value, or its problem. */
function readTenths(raw: string): Read {
  try {
    const value = parseTenths(raw);
    return value === undefined ? {} : { value };
  } catch (error) {
    return {
      problem:
        error instanceof RangeError && error.message === 'one-decimal'
          ? 'one-decimal'
          : 'not-a-number',
    };
  }
}

const inRange = (value: number, range: { readonly min: number; readonly max: number }): boolean =>
  value >= range.min && value <= range.max;

export function checkProfileForm(draft: ProfileDraft, ctx: ProfileFormContext): ProfileFormCheck {
  const problems: Partial<Record<ProfileFieldId, ProfileProblem>> = {};
  const onboarding = ctx.mode === 'onboarding';
  const thisYear = new Date(parseLocalDate(ctx.today)).getUTCFullYear();

  // Height: required, 120–230 cm.
  const height = readTenths(draft.heightCm);
  if (height.problem !== undefined) problems.heightCm = height.problem;
  else if (height.value === undefined) problems.heightCm = 'required';
  else if (!inRange(height.value, HEIGHT_CM)) problems.heightCm = 'range';
  const validHeight = problems.heightCm === undefined ? (height.value ?? null) : null;

  // Birth year: required, a whole year from 1900 to this year (E42).
  let validYear: number | null = null;
  const yearText = draft.birthYear.trim();
  if (yearText === '') problems.birthYear = 'required';
  else {
    let year: number | undefined;
    try {
      year = parseOptionalNumber(yearText);
    } catch {
      year = undefined;
    }
    if (year === undefined || !Number.isInteger(year)) problems.birthYear = 'not-a-number';
    else if (year < EARLIEST_BIRTH_YEAR) problems.birthYear = 'range';
    else if (year > thisYear) problems.birthYear = 'future-year';
    else validYear = year;
  }

  // Sex: required (C25).
  if (draft.sex === null) problems.sex = 'required';

  // Weight, read before the gates: a valid typed weight feeds the low-weight check.
  const weight = onboarding ? readTenths(draft.weightKg) : {};
  const typedWeight =
    weight.problem === undefined &&
    weight.value !== undefined &&
    inRange(weight.value, WEIGHT_LIMITS_KG)
      ? weight.value
      : null;

  // The form's own gates (section 4.6).
  const minimumAgeYears =
    validYear === null
      ? ctx.readiness.minimumAgeYears
      : minimumAgeFromBirthYear(validYear, ctx.today);
  const lowWeight = isLowWeight(onboarding ? typedWeight : ctx.storedWeightKg, validHeight);
  const gates = readinessGates({ ...ctx.readiness, minimumAgeYears, lowWeight });
  const gatesWithoutLowWeight = readinessGates({
    ...ctx.readiness,
    minimumAgeYears,
    lowWeight: false,
  });

  const show = {
    weight: onboarding,
    // A low weight is a weight that was entered, so it cannot make the field optional (E11).
    weightRequired: onboarding && gatesWithoutLowWeight.goalSettingAvailable,
    // One visibility rule with the weight screens (item 14's goalVisible).
    goal: onboarding && goalVisible(gates),
    kickstart: onboarding && gates.kickstartAvailable,
  };

  if (show.weight) {
    if (weight.problem !== undefined) problems.weightKg = weight.problem;
    else if (weight.value === undefined) {
      if (show.weightRequired) problems.weightKg = 'required';
    } else if (!inRange(weight.value, WEIGHT_LIMITS_KG)) problems.weightKg = 'range';
  }

  // Goal: only when goal setting is available; optional; BMI floor only, no 20% check (C04).
  let goal: ProfileFormValue['goal'] = { write: false };
  if (show.goal) {
    const typed = readTenths(draft.goalKg);
    if (typed.problem !== undefined) problems.goalKg = typed.problem;
    else if (typed.value === undefined) goal = { write: true, goalKg: null };
    else if (!inRange(typed.value, WEIGHT_LIMITS_KG)) problems.goalKg = 'range';
    else if (validHeight === null) problems.goalKg = 'goal-needs-height';
    else if (typedWeight === null) problems.goalKg = 'goal-needs-weight';
    else if (!(typed.value < typedWeight)) problems.goalKg = 'goal-not-below-weight';
    else if (!meetsBmiFloor(typed.value, validHeight)) problems.goalKg = 'goal-below-bmi-floor';
    else goal = { write: true, goalKg: typed.value };
  }

  if (!(Number.isInteger(draft.householdSize) && inRange(draft.householdSize, HOUSEHOLD))) {
    problems.householdSize = 'range';
  }

  const goalHiddenByHeight =
    ctx.mode === 'settings' &&
    ctx.storedGoalKg !== null &&
    validHeight !== null &&
    !meetsBmiFloor(ctx.storedGoalKg, validHeight);

  const present = new Set(draft.allergens);
  const value: ProfileFormValue | null =
    Object.keys(problems).length > 0 ||
    validHeight === null ||
    validYear === null ||
    draft.sex === null
      ? null
      : {
          heightCm: validHeight,
          birthYear: validYear,
          sex: draft.sex,
          weightKg: show.weight ? typedWeight : null,
          goal,
          kickstartOptIn: show.kickstart ? draft.kickstartOptIn : false,
          activityLevel: draft.activityLevel,
          equipmentBands: draft.equipmentBands,
          equipmentDumbbells: draft.equipmentDumbbells,
          householdSize: draft.householdSize,
          allergens: USER_ALLERGENS.filter((a) => present.has(a)),
          dislikeTerms: [...draft.dislikeTerms],
          glutenFreeHousehold: draft.glutenFreeHousehold,
        };

  return {
    gates,
    ageCheck: ageCrossCheck(ctx.readiness.answers.q1, minimumAgeYears),
    validBirthYear: validYear,
    weightCheck:
      lowWeight && ctx.readiness.answers.q5 === 'no' ? 'low-weight-answered-no' : 'consistent',
    show,
    goalHiddenByHeight,
    problems,
    value,
  };
}

/**
 * The Kickstart switch's first state (C06, D31; E14): shown only while Kickstart is available; on
 * by default from the seeded true, but off while answer 3 is yes, even with the prescriber's
 * agreement, until the profile is first confirmed; afterwards the stored choice.
 */
export function kickstartChoice(
  gates: ReadinessGates,
  q3: YesNo | null,
  storedOptIn: boolean,
  profileConfirmed: boolean,
): { shown: boolean; value: boolean } {
  if (!gates.kickstartAvailable) return { shown: false, value: false };
  if (profileConfirmed) return { shown: true, value: storedOptIn };
  return { shown: true, value: isGated(q3) ? false : storedOptIn };
}

const DISLIKE_MAX_LENGTH = 40;
const DISLIKES_MAX = 50;

/** Adds a disliked food term with the profile validator's rules (text 1–40, at most 50, unique ignoring case). */
export function addDislikeTerm(
  list: readonly string[],
  raw: string,
):
  | { ok: true; list: string[] }
  | { ok: false; problem: 'empty' | 'too-long' | 'duplicate' | 'too-many' } {
  const term = normalizeText(raw) as string;
  if (term === '') return { ok: false, problem: 'empty' };
  if (term.length > DISLIKE_MAX_LENGTH) return { ok: false, problem: 'too-long' };
  if (list.some((t) => t.toLowerCase() === term.toLowerCase())) {
    return { ok: false, problem: 'duplicate' };
  }
  if (list.length >= DISLIKES_MAX) return { ok: false, problem: 'too-many' };
  return { ok: true, list: [...list, term] };
}
