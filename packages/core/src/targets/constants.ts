/**
 * The targets engine's own constants (item 21 design section 3.1; T17, T21). They live here, never
 * in storage/limits.ts: every export there is part of the version-1 schema fingerprint
 * (VALIDATOR_CONSTANTS spreads that module), so adding one would need a new schema version. The
 * option lists are built from the stored limits, so a screen offers only values the validators
 * accept.
 */
import { SAT_FAT_BUDGET_PCT, STEADY_DEFICIT_PCT } from '../storage/limits';

/** Every whole number from min to max. */
const wholeNumbers = (min: number, max: number): readonly number[] =>
  Object.freeze(Array.from({ length: max - min + 1 }, (_, i) => min + i));

/** Energy per gram of fat (FSANZ Food Standards Code, Standard 1.2.8 and Schedule 11: 37 kJ/g). C71. */
export const FAT_KJ_PER_G = 37;

/** NRV adequate intake for dietary fibre (Nutrient Reference Values for Australia and New Zealand), g a day. C70. */
export const FIBRE_GUIDE_NRV_G = Object.freeze({ male: 30, female: 25 });

/** NRV adequate intake for fluids as drinks, mL a day. C70. */
export const WATER_GUIDE_NRV_ML = Object.freeze({ male: 2600, female: 2100 });

/** The Kickstart deficit options shown in Settings: 0–30% in steps of 5 (T17). */
export const KICKSTART_DEFICIT_OPTIONS_PCT: readonly number[] = Object.freeze([
  0, 5, 10, 15, 20, 25, 30,
]);

/** The Steady deficit options: every whole number in STEADY_DEFICIT_PCT (T17). */
export const STEADY_DEFICIT_OPTIONS_PCT = wholeNumbers(
  STEADY_DEFICIT_PCT.min,
  STEADY_DEFICIT_PCT.max,
);

/** The saturated-fat budget options: every whole number in SAT_FAT_BUDGET_PCT (T17). */
export const SAT_FAT_BUDGET_OPTIONS_PCT = wholeNumbers(
  SAT_FAT_BUDGET_PCT.min,
  SAT_FAT_BUDGET_PCT.max,
);

/** A last weigh-in older than this, used as the estimate's weight, gets the "log a weight" note (T4). */
export const ESTIMATE_WEIGHT_STALE_DAYS = 14;

/**
 * The Mifflin-St Jeor limits that energy/energyEstimate.ts enforces, restated so that a missing or
 * out-of-range input is reported as a reason, never thrown (T3). A test probes both sides of each.
 */
export const ESTIMATE_LIMITS = Object.freeze({
  weightKg: Object.freeze([30, 350] as const),
  heightCm: Object.freeze([120, 230] as const),
  ageYears: Object.freeze([18, 110] as const),
});
