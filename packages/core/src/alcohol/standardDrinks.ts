import { assertInRange, roundTo } from '../util/round';

/** Density of ethanol, grams per millilitre. */
export const ETHANOL_DENSITY_G_PER_ML = 0.789;

/** One New Zealand standard drink contains 10 g of pure alcohol (HEALTH_SAFETY.md section 5). */
export const NZ_STANDARD_DRINK_GRAMS = 10;

/** Largest single serve the app accepts (a 3 L cask or keg jug is already generous). */
export const MAX_SERVE_ML = 3000;

/** Kilocalories in a gram of alcohol, used only to sanity-check a label figure, never to fill one in. */
export const KCAL_PER_GRAM_ALCOHOL = 7;

/** Largest standard-drinks figure accepted from a label. */
export const MAX_LABEL_STANDARD_DRINKS = 100;

/** Largest kilocalorie figure accepted from a label. */
export const MAX_LABEL_KCAL = 5000;

/** The measure of one serve. */
export interface DrinkMeasure {
  volumeMl: number;
  /** Alcohol by volume as a percentage: 5 means 5%, never 0.05. */
  abvPercent: number;
}

/**
 * Figures printed on a label, tied to the measure they were read for. They describe that
 * measure only: once the serve's volume or ABV is edited they no longer apply.
 */
export interface DrinkLabel extends DrinkMeasure {
  /** Standard drinks printed on the label. When it applies it wins over the calculation (AL-02). */
  standardDrinks?: number | null | undefined;
  /** Kilocalories per serve printed on the label (the only source of drink energy; NN-01). */
  kcal?: number | null | undefined;
}

/** A drink as logged or kept as a preset: its measure, and the label it was read from, if any. */
export interface Beverage extends DrinkMeasure {
  label?: DrinkLabel | null | undefined;
}

export interface StandardDrinks {
  /** For display: `exact` rounded to 2 decimal places. */
  value: number;
  /** Unrounded. Store and sum this one (totalStandardDrinks) so totals are rounded only once. */
  exact: number;
  source: 'label' | 'calculated';
  /**
   * True when a label figure was present but read for a different volume or ABV, so the
   * calculation was used instead.
   */
  labelIgnored: boolean;
  /**
   * True when the label figure that was used differs from the calculation by more than 0.1
   * standard drinks or 10% of the calculation, whichever is larger, so the screen can ask the
   * owner to check what they typed. Always false when no label figure was used.
   */
  labelDisagrees: boolean;
}

/** Grams of pure alcohol in a serve. */
export function alcoholGrams(volumeMl: number, abvPercent: number): number {
  assertInRange('volumeMl', volumeMl, 0, MAX_SERVE_ML);
  assertInRange('abvPercent', abvPercent, 0, 100);
  return volumeMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML;
}

/** Largest calculated standard-drinks figure for one serve (3 L of pure alcohol). */
export const MAX_SERVE_STANDARD_DRINKS =
  (MAX_SERVE_ML * ETHANOL_DENSITY_G_PER_ML) / NZ_STANDARD_DRINK_GRAMS;

/** The label, if any, and whether it was read for exactly this volume and ABV. */
function readLabel(beverage: Beverage): { label: DrinkLabel | undefined; applies: boolean } {
  const label = beverage.label ?? undefined;
  if (label === undefined) return { label, applies: false };
  assertInRange('label volumeMl', label.volumeMl, 0, MAX_SERVE_ML);
  assertInRange('label abvPercent', label.abvPercent, 0, 100);
  const applies = label.volumeMl === beverage.volumeMl && label.abvPercent === beverage.abvPercent;
  return { label, applies };
}

/**
 * NZ standard drinks: mL × ABV% × 0.789 ÷ 1000, which is grams of alcohol ÷ 10
 * (DATA_MODEL.md shared rules; HS-04, AL-01). 330 mL at 5% is 1.30.
 *
 * A label figure wins (AL-02) only while the serve still has the volume and ABV the label was
 * read for; after either is edited the calculation is used and `labelIgnored` is set. A null
 * label figure (a cleared form field) is treated as absent.
 */
export function standardDrinks(beverage: Beverage): StandardDrinks {
  const calculated = alcoholGrams(beverage.volumeMl, beverage.abvPercent) / NZ_STANDARD_DRINK_GRAMS;
  const { label, applies } = readLabel(beverage);
  const printed = label?.standardDrinks ?? undefined;
  if (printed !== undefined) {
    assertInRange('label standardDrinks', printed, 0, MAX_LABEL_STANDARD_DRINKS);
  }
  if (printed === undefined || !applies) {
    return {
      value: roundTo(calculated, 2),
      exact: calculated,
      source: 'calculated',
      labelIgnored: printed !== undefined,
      labelDisagrees: false,
    };
  }
  const labelDisagrees = Math.abs(printed - calculated) > Math.max(0.1, 0.1 * calculated);
  return {
    value: roundTo(printed, 2),
    exact: printed,
    source: 'label',
    labelIgnored: false,
    labelDisagrees,
  };
}

export type DrinkEnergy =
  | { kcal: number; source: 'label'; labelIgnored: false; labelImplausible: boolean }
  | { kcal: null; source: 'unknown'; labelIgnored: boolean; labelImplausible: false };

/**
 * Energy of a drink comes only from its label. It is never inferred from alcohol content or
 * copied from another drink (NN-01): with no label value, or a label read for a different volume
 * or ABV (`labelIgnored`), the energy is unknown.
 *
 * `labelImplausible` is set when the label figure is below 90% of the energy in the alcohol alone
 * (grams × 7 kcal), for example 0 kcal from an empty form field, so the screen can ask the owner
 * to check it. The label figure is still the one returned; no inferred figure is ever shown.
 */
export function drinkEnergy(beverage: Beverage): DrinkEnergy {
  const grams = alcoholGrams(beverage.volumeMl, beverage.abvPercent);
  const { label, applies } = readLabel(beverage);
  const printed = label?.kcal ?? undefined;
  if (printed !== undefined) assertInRange('label kcal', printed, 0, MAX_LABEL_KCAL);
  if (printed === undefined || !applies) {
    return {
      kcal: null,
      source: 'unknown',
      labelIgnored: printed !== undefined,
      labelImplausible: false,
    };
  }
  const labelImplausible = kcalImplausiblyLow(printed, grams);
  return { kcal: printed, source: 'label', labelIgnored: false, labelImplausible };
}

/** A label energy below 90% of the energy in the alcohol alone (grams × 7 kcal; A40). */
function kcalImplausiblyLow(kcal: number, alcoholGramsPerServe: number): boolean {
  return kcal < 0.9 * alcoholGramsPerServe * KCAL_PER_GRAM_ALCOHOL;
}

/**
 * The energy per serve a total counts (NN-01, C11, A40; HS-36): the label figure, unless it is
 * implausibly low for the alcohol in the serve. Null means unknown: counted as unknown, never as 0
 * and never filled in. The one rule for every alcohol energy figure: the Drinks screen and Today's
 * Drinks card (alcohol/totals.ts), the preset summaries (alcohol/presets.ts), and through
 * totalDrinkEnergy the day's total on the Nutrition card and Diet and targets (targets/intake.ts).
 */
export function countedKcalPerServe(
  kcal: number | null | undefined,
  measure: DrinkMeasure,
): number | null {
  if (kcal === null || kcal === undefined) return null;
  return kcalImplausiblyLow(kcal, alcoholGrams(measure.volumeMl, measure.abvPercent)) ? null : kcal;
}

/** One line of a day's or week's drinks: the unrounded standard drinks of one serve, and how many. */
export interface StandardDrinksEntry {
  exact: number;
  count: number;
}

/** Most serves of one drink in one log entry. */
export const MAX_ENTRY_COUNT = 100;

/**
 * Total standard drinks: the unrounded figures are summed and the total is rounded once, to
 * 2 decimal places. Summing per-drink rounded figures can land just under a guidance figure or the
 * "talk to someone" threshold (HS-05, HS-06) that the true total reaches: 34 serves of 30 mL at
 * 37.3% are 30.02, while 34 × 0.88 is 29.92. Compare thresholds against this total, which is
 * also the figure shown.
 */
export function totalStandardDrinks(entries: readonly StandardDrinksEntry[]): number {
  let total = 0;
  for (const { exact, count } of entries) {
    assertInRange('exact', exact, 0, MAX_SERVE_STANDARD_DRINKS);
    assertInRange('count', count, 0, MAX_ENTRY_COUNT);
    total += exact * count;
  }
  return roundTo(total, 2);
}

/**
 * One line of a day's drinks: label kilocalories per serve (null or undefined when unknown), and
 * the serve's measure, which countedKcalPerServe checks the figure against.
 */
export interface DrinkEnergyEntry {
  kcal: number | null | undefined;
  count: number;
  measure: DrinkMeasure;
}

export interface DrinkEnergyTotal {
  /** Sum of the label kilocalories that are known. */
  knownKcal: number;
  /** How many drinks have unknown energy and are not in knownKcal. */
  unknownCount: number;
}

/**
 * Energy of a set of drinks, as a fact for the day's total (HEALTH_SAFETY.md section 5). Unknown
 * energy, and a label figure too low for the alcohol in the serve (countedKcalPerServe), is
 * counted as unknown, never filled in and never 0, so the total can say how many drinks it leaves
 * out (NN-01, A40).
 */
export function totalDrinkEnergy(entries: readonly DrinkEnergyEntry[]): DrinkEnergyTotal {
  let knownKcal = 0;
  let unknownCount = 0;
  for (const { kcal, count, measure } of entries) {
    assertInRange('count', count, 0, MAX_ENTRY_COUNT);
    if (kcal !== null && kcal !== undefined) assertInRange('kcal', kcal, 0, MAX_LABEL_KCAL);
    const counted = countedKcalPerServe(kcal, measure);
    if (counted === null) unknownCount += count;
    else knownKcal += counted * count;
  }
  return { knownKcal, unknownCount };
}
