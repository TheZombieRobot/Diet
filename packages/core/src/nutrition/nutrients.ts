import { assertInRange } from '../util/round';

/**
 * The eight nutrient fields every food carries (DATA_MODEL.md ingredients; NU-01). Amounts are
 * for whatever basis the caller states: per 100 g, per serve, or per logged portion.
 */
export interface Nutrients {
  energyKj: number;
  proteinG: number;
  fatG: number;
  saturatedFatG: number;
  /**
   * ALWAYS available carbohydrate: fibre excluded, as NZ labels and the NZ Food Composition
   * Database report it. A figure that includes fibre (USDA "carbohydrate, by difference",
   * US-style labels) is converted with toAvailableCarbsG when the ingredient or label record is
   * created, so sums and scaled portions never mix the two, and net carbs of any Nutrients is
   * simply this field (netCarbsOf).
   */
  carbsG: number;
  sugarsG: number;
  fibreG: number;
  sodiumMg: number;
}

export const NUTRIENT_KEYS = [
  'energyKj',
  'proteinG',
  'fatG',
  'saturatedFatG',
  'carbsG',
  'sugarsG',
  'fibreG',
  'sodiumMg',
] as const satisfies readonly (keyof Nutrients)[];

/**
 * What a carbohydrate figure includes.
 * - 'available': fibre is NOT included. New Zealand and Australian labels, and the NZ Food
 *   Composition Database, report carbohydrate this way (Food Standards Code, Standard 1.2.8 and
 *   Schedule 11: available carbohydrate by difference subtracts dietary fibre).
 * - 'total': fibre IS included, as in USDA FoodData Central "carbohydrate, by difference" and
 *   US-style labels.
 */
export type CarbBasis = 'available' | 'total';

/** Every CarbBasis. Storage validators read this list (storage spec 4.3). */
export const CARB_BASES = Object.freeze([
  'available',
  'total',
] as const satisfies readonly CarbBasis[]);

export const KJ_PER_KCAL = 4.184;

export function kjToKcal(kj: number): number {
  return kj / KJ_PER_KCAL;
}

export function kcalToKj(kcal: number): number {
  return kcal * KJ_PER_KCAL;
}

/** Throws unless every field is a finite, non-negative number. */
export function assertValidNutrients(n: Nutrients): void {
  for (const key of NUTRIENT_KEYS) assertInRange(key, n[key], 0, Number.MAX_SAFE_INTEGER);
}

/**
 * Largest multiplier scaleNutrients accepts. Ten serves, or 5 kg of a per-100 g food, fits; a
 * typical gram weight passed by mistake as the factor (150 rather than 1.5) is refused.
 */
export const MAX_SCALE_FACTOR = 50;

/** Multiplies every field by `factor` (0 to MAX_SCALE_FACTOR). For grams use nutrientsForGrams. */
export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  assertValidNutrients(n);
  assertInRange('factor', factor, 0, MAX_SCALE_FACTOR);
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) out[key] = n[key] * factor;
  return out;
}

/**
 * Nutrients in `grams` of a food described per 100 g (FL-01: a label per 100 g, 150 g logged).
 * Divides by 100 itself, so a gram weight can never be passed as a multiplier by mistake.
 */
export function nutrientsForGrams(per100g: Nutrients, grams: number): Nutrients {
  assertInRange('grams', grams, 0, MAX_SCALE_FACTOR * 100);
  return scaleNutrients(per100g, grams / 100);
}

export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  const out: Nutrients = {
    energyKj: 0,
    proteinG: 0,
    fatG: 0,
    saturatedFatG: 0,
    carbsG: 0,
    sugarsG: 0,
    fibreG: 0,
    sodiumMg: 0,
  };
  for (const item of items) {
    assertValidNutrients(item);
    for (const key of NUTRIENT_KEYS) out[key] += item[key];
  }
  return out;
}
