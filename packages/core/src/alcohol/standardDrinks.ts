import { assertInRange, roundTo } from '../util/round';

/** Density of ethanol, grams per millilitre. */
export const ETHANOL_DENSITY_G_PER_ML = 0.789;

/** One New Zealand standard drink contains 10 g of pure alcohol (HEALTH_SAFETY.md section 5). */
export const NZ_STANDARD_DRINK_GRAMS = 10;

/** Largest single serve the app accepts (a 3 L cask or keg jug is already generous). */
export const MAX_SERVE_ML = 3000;

export interface DrinkMeasure {
  volumeMl: number;
  /** Alcohol by volume as a percentage: 5 means 5%, never 0.05. */
  abvPercent: number;
  /** Standard drinks printed on the label. When present it wins over the calculation (AL-02). */
  labelStandardDrinks?: number | undefined;
}

export interface StandardDrinks {
  /** Rounded to 2 decimal places. */
  value: number;
  source: 'label' | 'calculated';
}

/** Grams of pure alcohol in a serve. */
export function alcoholGrams(volumeMl: number, abvPercent: number): number {
  assertInRange('volumeMl', volumeMl, 0, MAX_SERVE_ML);
  assertInRange('abvPercent', abvPercent, 0, 100);
  return volumeMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML;
}

/**
 * NZ standard drinks: mL × ABV% × 0.789 ÷ 1000, which is grams of alcohol ÷ 10
 * (DATA_MODEL.md shared rules; HS-04, AL-01). 330 mL at 5% is 1.30.
 * A label value, when given, is used as printed (rounded to 2 decimals).
 */
export function standardDrinks(drink: DrinkMeasure): StandardDrinks {
  const calculated = alcoholGrams(drink.volumeMl, drink.abvPercent) / NZ_STANDARD_DRINK_GRAMS;
  if (drink.labelStandardDrinks !== undefined) {
    assertInRange('labelStandardDrinks', drink.labelStandardDrinks, 0, 100);
    return { value: roundTo(drink.labelStandardDrinks, 2), source: 'label' };
  }
  return { value: roundTo(calculated, 2), source: 'calculated' };
}

export interface LabelEnergy {
  /** Kilocalories per serve as printed on the label, if the owner entered it. */
  labelKcal?: number | undefined;
}

export type DrinkEnergy = { kcal: number; source: 'label' } | { kcal: null; source: 'unknown' };

/**
 * Energy of a drink comes only from its label. It is never inferred from alcohol content or
 * copied from another drink (NN-01): with no label value the energy is unknown.
 */
export function drinkEnergy(beverage: LabelEnergy): DrinkEnergy {
  if (beverage.labelKcal === undefined) return { kcal: null, source: 'unknown' };
  assertInRange('labelKcal', beverage.labelKcal, 0, 5000);
  return { kcal: beverage.labelKcal, source: 'label' };
}
