/**
 * The day's weight basis, rough guide, deficit and energy figure, and the figures the floor check,
 * the meal checks and the planner use (HS-10, HS-25, C10, C24, C25, C50, C61, C108; WT-06, WT-07,
 * WT-08; item 21 design section 3.4). Item 14 built the deficit and the energy figure early; item
 * 21 adds the rest here.
 *
 * - The deficit is never above 30% and the Steady deficit always lies in 15–20%, whatever is stored.
 * - The Kickstart deficit applies only while Kickstart may run: keto mode and every Kickstart gate
 *   open (kickstartConditionsHold). A caller that passes Kickstart figures on time alone, with a
 *   gate closed, gets the Steady deficit (item 14 design section 3.8).
 * - The target never goes below the energy floor, and there is no protein input: protein is never
 *   traded for energy (WT-06).
 * - With no rough guide there is no energy figure at all: the floor only refuses or warns, and is
 *   never an aim or the figure a meal is checked against (T3; DECISIONS C10 row).
 */
import { minimumAgeFromBirthYear, EARLIEST_BIRTH_YEAR } from '../energy/age';
import {
  type ActivityLevel,
  estimatedDailyEnergy,
  type EstimateSex,
} from '../energy/energyEstimate';
import type { Instant, TimeZone } from '../storage/primitives';
import type { DietMode, ProfileSex } from '../storage/records';
import { KICKSTART_MAX_DEFICIT_PCT } from '../storage/limits';
import { assertInRange } from '../util/round';
import { addDays, daysBetween, type LocalDate, localDateOf, parseInstant } from '../util/time';
import { kickstartConditionsHold, type PhaseGates } from '../weight/phase';
import { rollingAverageKg, type WeighIn, WEIGHT_LIMITS_KG } from '../weight/trend';
import { ESTIMATE_LIMITS, ESTIMATE_WEIGHT_STALE_DAYS } from './constants';
import type { TargetFigures } from './protein';
import {
  clampNumber,
  safeActivityLevel,
  safeFloorKj,
  safeKickstartDeficitPct,
  safeSteadyDeficitPct,
} from './sanitize';

// ---- Which weight (3.4.1; C24, T4) ----

export interface WeightBasis {
  /** Unrounded. */
  readonly kg: number;
  readonly basis: 'seven-day-average' | 'highest-recent' | 'latest-older';
  /** Today for an average; the weigh-in's local date otherwise. */
  readonly date: LocalDate;
  /** The weigh-in's instant; null for an average. */
  readonly at: Instant | null;
  /** Its resolved zone; null for an average. */
  readonly timeZone: TimeZone | null;
}

const plausible = (w: WeighIn): boolean =>
  Number.isFinite(w.kg) && w.kg >= WEIGHT_LIMITS_KG.min && w.kg <= WEIGHT_LIMITS_KG.max;

interface DatedWeighIn {
  readonly w: WeighIn;
  readonly date: LocalDate;
  readonly ms: number;
}

/** The best of `pool` by `better`, or null when it is empty. */
function best(
  pool: readonly DatedWeighIn[],
  better: (a: DatedWeighIn, b: DatedWeighIn) => boolean,
): DatedWeighIn | null {
  let found: DatedWeighIn | null = null;
  for (const x of pool) if (found === null || better(x, found)) found = x;
  return found;
}

/**
 * The weight the rough guide uses (T4): the 7-day average (3 of 7 days, the existing rule);
 * otherwise the highest weigh-in of the last 7 local days, the onboarding weight included, so one
 * low or mistyped entry never lowers the target on its own (a tie takes the later one); otherwise
 * the latest weigh-in (a tie on time takes the heavier). Weigh-ins dated after today are ignored.
 * `weighIns` must carry zones already resolved for reading (the records adapter does this).
 */
export function weightForEstimate(
  weighIns: readonly WeighIn[],
  today: LocalDate,
): WeightBasis | null {
  const dated: DatedWeighIn[] = weighIns
    .filter(plausible)
    .map((w) => ({ w, date: localDateOf(w.at, w.timeZone), ms: parseInstant(w.at) }))
    .filter((x) => x.date <= today);
  const average = rollingAverageKg(
    dated.map((x) => x.w),
    today,
    7,
  );
  if (average !== null) {
    return { kg: average, basis: 'seven-day-average', date: today, at: null, timeZone: null };
  }
  const weekStart = addDays(today, -6);
  const highest = best(
    dated.filter((x) => x.date >= weekStart),
    (a, b) => a.w.kg > b.w.kg || (a.w.kg === b.w.kg && a.ms > b.ms),
  );
  const chosen =
    highest ?? best(dated, (a, b) => a.ms > b.ms || (a.ms === b.ms && a.w.kg > b.w.kg));
  if (chosen === null) return null;
  return {
    kg: chosen.w.kg,
    basis: highest === null ? 'latest-older' : 'highest-recent',
    date: chosen.date,
    at: chosen.w.at,
    timeZone: chosen.w.timeZone,
  };
}

/** The estimate's weight is an older last weigh-in, more than 14 days before today (T4). */
export function weightIsStale(w: WeightBasis | null, today: LocalDate): boolean {
  return w?.basis === 'latest-older' && daysBetween(w.date, today) > ESTIMATE_WEIGHT_STALE_DAYS;
}

// ---- The rough guide (3.4.2; C24, C25, T2, T3) ----

/** Why there is no rough guide to plan from. */
export type EstimateUnavailable =
  | 'not-estimated'
  | 'missing-height'
  | 'missing-birth-year'
  | 'missing-weight'
  | 'age-out-of-range'
  | 'height-out-of-range'
  | 'weight-out-of-range';

export type EnergyEstimateResult =
  | {
      readonly available: true;
      readonly kcal: number;
      readonly kj: number;
      readonly label: 'rough guide';
      readonly weight: WeightBasis;
      readonly ageYears: number;
      readonly sex: EstimateSex;
      readonly activity: ActivityLevel;
    }
  | { readonly available: false; readonly reason: EstimateUnavailable };

const inRange = (x: number, [min, max]: readonly [number, number]): boolean =>
  Number.isFinite(x) && x >= min && x <= max;

/**
 * The rough guide, or why there is none, checked in a fixed order so a missing or out-of-range
 * input is reported, never thrown (T3). The age is the minimum age from the birth year (T2): the
 * higher estimate keeps the real deficit within its cap, and agrees with the under-18 gate. With
 * no sex entered the midpoint constant is used (C25).
 */
export function energyEstimateFor(input: {
  /** gates.energyEstimateAvailable. */
  readonly energyEstimateAvailable: boolean;
  readonly heightCm: number | null;
  readonly birthYear: number | null;
  readonly sex: ProfileSex | null;
  readonly activity: string;
  readonly weight: WeightBasis | null;
  readonly today: LocalDate;
}): EnergyEstimateResult {
  const no = (reason: EstimateUnavailable): EnergyEstimateResult => ({ available: false, reason });
  if (!input.energyEstimateAvailable) return no('not-estimated');
  const { birthYear, heightCm, weight } = input;
  if (birthYear === null) return no('missing-birth-year');
  if (birthYear > Number(input.today.slice(0, 4))) return no('not-estimated');
  if (!Number.isInteger(birthYear) || birthYear < EARLIEST_BIRTH_YEAR) {
    return no('age-out-of-range');
  }
  const ageYears = minimumAgeFromBirthYear(birthYear, input.today);
  if (ageYears < ESTIMATE_LIMITS.ageYears[0]) return no('not-estimated');
  if (ageYears > ESTIMATE_LIMITS.ageYears[1]) return no('age-out-of-range');
  if (heightCm === null) return no('missing-height');
  if (!inRange(heightCm, ESTIMATE_LIMITS.heightCm)) return no('height-out-of-range');
  if (weight === null) return no('missing-weight');
  if (!inRange(weight.kg, ESTIMATE_LIMITS.weightKg)) return no('weight-out-of-range');
  const sex: EstimateSex = input.sex ?? 'unspecified';
  const activity = safeActivityLevel(input.activity);
  // Every input is inside its limits now, so a RangeError here is a programming error.
  const estimate = estimatedDailyEnergy({
    weightKg: weight.kg,
    heightCm,
    ageYears,
    sex,
    activity,
  });
  return { available: true, ...estimate, weight, ageYears, sex, activity };
}

// ---- The deficit (3.4.3) ----

export interface DeficitChoice {
  readonly pct: number;
  readonly basis: 'kickstart' | 'steady' | 'none-readiness' | 'none-stop-sign';
}

/**
 * The deficit for the day. First match: no deficit when readiness closes it (C06, C56, C61); none
 * while a stop-sign pauses Kickstart (item 21 T27); the stored Kickstart deficit, capped at 30%,
 * only with Kickstart figures while kickstartConditionsHold; otherwise the Steady deficit, 15–20%.
 */
export function effectiveDeficit(input: {
  readonly figures: TargetFigures;
  readonly dietMode: DietMode;
  readonly gates: PhaseGates;
  readonly stopSignPause: boolean;
  readonly kickstartDeficitPct: number;
  readonly steadyDeficitPct: number;
}): DeficitChoice {
  if (!input.gates.deficitAllowed) return { pct: 0, basis: 'none-readiness' };
  if (input.stopSignPause) return { pct: 0, basis: 'none-stop-sign' };
  if (input.figures === 'kickstart' && kickstartConditionsHold(input.dietMode, input.gates)) {
    return { pct: safeKickstartDeficitPct(input.kickstartDeficitPct), basis: 'kickstart' };
  }
  return { pct: safeSteadyDeficitPct(input.steadyDeficitPct), basis: 'steady' };
}

// ---- The day's energy (3.4.4) ----

export type DayEnergy =
  | {
      readonly kind: 'target';
      readonly targetKj: number;
      readonly estimateKj: number;
      readonly deficit: DeficitChoice;
      readonly floorKj: number;
      readonly clampedToFloor: boolean;
      readonly estimateBelowFloor: boolean;
    }
  | {
      readonly kind: 'no-estimate';
      readonly reason: EstimateUnavailable;
      /** Kept only so refusals and warnings can name it; never an aim (3.4.6). */
      readonly floorKj: number;
    };

/**
 * The day's energy figure from the rough guide: the estimate less the deficit, rounded up to a
 * whole kJ so the real deficit is never more than its percentage, and never below the floor. The
 * percentage is capped at 30% again here, so a hand-built DeficitChoice cannot pass the cap.
 */
export function dayEnergyFor(
  estimateKj: number,
  deficit: DeficitChoice,
  storedFloorKj: number,
): DayEnergy {
  assertInRange('estimateKj', estimateKj, 1, 100_000);
  const floorKj = safeFloorKj(storedFloorKj);
  const pct = clampNumber(deficit.pct, 0, KICKSTART_MAX_DEFICIT_PCT, 0);
  const raw = Math.ceil((estimateKj * (100 - pct)) / 100);
  return {
    kind: 'target',
    targetKj: Math.max(floorKj, raw),
    estimateKj,
    deficit,
    floorKj,
    clampedToFloor: raw < floorKj,
    estimateBelowFloor: estimateKj < floorKj,
  };
}

/** No rough guide: no energy figure, only the floor for refusals and warnings to name (T3). */
export function noEstimateEnergy(reason: EstimateUnavailable, storedFloorKj: number): DayEnergy {
  return { kind: 'no-estimate', reason, floorKj: safeFloorKj(storedFloorKj) };
}

// ---- The floor check for planned days (3.4.5; HS-10, NU-06, C108, T28) ----

/** What wrote, or is about to write, the planned day. Only 'owner-meal' may go below the floor. */
export type PlanWriteKind =
  /** The owner adds, edits or removes one meal, picking the recipe or typing the entry themselves. */
  | 'owner-meal'
  /** The planner fills one or more slots. */
  | 'auto-fill'
  /** Copy a day or a week (a copy of the owner's own day stays a copy). */
  | 'copy'
  /** Apply a saved template. */
  | 'template'
  /** Repeat a day. */
  | 'repeat'
  /** Accept a swap or suggestion the app offered. */
  | 'suggested-swap';

export type FloorCheck =
  | { readonly ok: true; readonly belowFloor: false; readonly floorKj: number }
  /** owner-meal: allowed, with targets.plannerFloor.manualBelow. */
  | { readonly ok: true; readonly belowFloor: true; readonly floorKj: number }
  /** Anything else: refused, with targets.plannerFloor.refused. */
  | { readonly ok: false; readonly reason: 'below-floor'; readonly floorKj: number };

/**
 * The floor rule for a planned day's food energy (HS-10, NU-06): every plan the app writes below
 * the floor (5,000 kJ, or the owner's higher floor) is refused; only the owner's own single-meal
 * edit may leave a day below it, with a calm note (C108). The kind is closed and defaults to
 * refusal, and so does any unknown kind at run time. Pass food energy only (foodEnergyKj or
 * plannedFoodEnergyKj): alcohol never counts toward the floor (C11).
 */
export function floorCheck(
  foodKj: number,
  storedFloorKj: number,
  kind: PlanWriteKind = 'auto-fill',
): FloorCheck {
  assertInRange('foodKj', foodKj, 0, Number.MAX_SAFE_INTEGER);
  const floorKj = safeFloorKj(storedFloorKj);
  if (foodKj >= floorKj) return { ok: true, belowFloor: false, floorKj };
  switch (kind) {
    case 'owner-meal':
      return { ok: true, belowFloor: true, floorKj };
    default:
      return { ok: false, reason: 'below-floor', floorKj };
  }
}

// ---- The figures the meal checks and the planner use (3.4.6; C10, C29, C62, C64, T3) ----

/**
 * The energy a planned or projected day is compared with by the single-meal check and the
 * widen-window prompt. null when there is no rough guide: the check MUST treat energy as "not
 * shown to be met" (offer the snack and the widen-window line; never pass). The floor is never
 * used here (DECISIONS C10 row; cross-item ruling 3).
 */
export function energyForMealChecks(energy: DayEnergy): number | null {
  return energy.kind === 'target' ? energy.targetKj : null;
}

export type PlannerEnergyAim =
  | { readonly kind: 'aim'; readonly kj: number }
  | { readonly kind: 'none'; readonly reason: 'needs-guide' | 'not-estimated' };

/**
 * What item 22's auto-fill aims at: the day's energy target, never the floor. With no rough guide
 * under 18 ('not-estimated') the planner plans ordinary portions with no energy aim; otherwise
 * ('needs-guide') it does not fill days by itself. floorCheck still refuses either below the floor.
 */
export function plannerEnergyAim(energy: DayEnergy): PlannerEnergyAim {
  if (energy.kind === 'target') return { kind: 'aim', kj: energy.targetKj };
  return {
    kind: 'none',
    reason: energy.reason === 'not-estimated' ? 'not-estimated' : 'needs-guide',
  };
}
