/**
 * "Cooking for": scaling a recipe's amounts (item 20 design 4.8; HS-23). It changes ingredient
 * amounts only; no nutrition function takes a household or cooking-for input, so the figures stay
 * those of one serve. The rounding here is for ingredient amounts, never for a nutrient figure.
 */
import type { RecipeLine } from '../storage/records';
import { EDIBLE_G_PER_EGG, SCALE_SERVES_LIMITS } from './constants';

/** The lines' raw and cooked grams for `toServes` serves of a recipe written for `fromServes`. */
export function scaleLines<T extends Pick<RecipeLine, 'rawG' | 'cookedG'>>(
  lines: readonly T[],
  fromServes: number,
  toServes: number,
): (T & { readonly scaled: boolean })[] {
  if (!Number.isInteger(fromServes) || fromServes < 1 || fromServes > 50)
    throw new RangeError('A recipe makes 1 to 50 whole serves');
  if (
    !Number.isInteger(toServes) ||
    toServes < SCALE_SERVES_LIMITS.min ||
    toServes > SCALE_SERVES_LIMITS.max
  )
    throw new RangeError('Cooking for is 1 to 20 whole serves');
  const factor = toServes / fromServes;
  return lines.map((line) => ({
    ...line,
    rawG: line.rawG * factor,
    cookedG: line.cookedG === null ? null : line.cookedG * factor,
    scaled: factor !== 1,
  }));
}

/** An amount as shown: to the nearest 0.5 g below 10 g, whole grams to 100 g, the nearest 5 g above. */
export function roundRecipeGrams(grams: number): number {
  if (!Number.isFinite(grams) || grams < 0) throw new RangeError('Grams must be 0 or more');
  if (grams < 10) return Math.round(grams * 2) / 2;
  if (grams <= 100) return Math.round(grams);
  return Math.round(grams / 5) * 5;
}

/** How many eggs an egg line's edible weight is, at least 1 (N11). */
export function eggCount(rawG: number): number {
  return Math.max(1, Math.round(rawG / EDIBLE_G_PER_EGG));
}
