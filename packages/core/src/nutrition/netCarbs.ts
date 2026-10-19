import { assertInRange } from '../util/round';
import { assertValidNutrients, type CarbBasis, type Nutrients } from './nutrients';

export interface CarbFigures {
  carbsG: number;
  fibreG: number;
  /** Whether `carbsG` already excludes fibre. See CarbBasis. */
  carbBasis: CarbBasis;
}

/**
 * Available carbohydrate (fibre excluded) from a raw figure on either basis (DATA_MODEL.md;
 * NU-03). Use it when an ingredient or label record is created, so Nutrients.carbsG is always on
 * the available basis.
 *
 * Fibre is subtracted only when the carbohydrate figure includes it ('total', e.g. USDA), and the
 * result is never negative. NZ labels and the NZ Food Composition Database already exclude fibre
 * ('available'), so their figure is used as it is; subtracting fibre again would undercount carbs
 * and make a keto ceiling look met when it is not. Any other basis is refused rather than guessed.
 */
export function toAvailableCarbsG({ carbsG, fibreG, carbBasis }: CarbFigures): number {
  assertInRange('carbsG', carbsG, 0, Number.MAX_SAFE_INTEGER);
  assertInRange('fibreG', fibreG, 0, Number.MAX_SAFE_INTEGER);
  switch (carbBasis) {
    case 'available':
      return carbsG;
    case 'total':
      return Math.max(0, carbsG - fibreG);
    default: {
      const unknown: never = carbBasis;
      throw new RangeError(`Unknown carbohydrate basis: ${JSON.stringify(unknown)}`);
    }
  }
}

/**
 * Net carbohydrate = carbohydrate − fibre, never negative (DATA_MODEL.md; NU-03), for a raw figure
 * on either basis. The same conversion as toAvailableCarbsG: net carbs and available carbohydrate
 * are the same quantity.
 */
export function netCarbsG(figures: CarbFigures): number {
  return toAvailableCarbsG(figures);
}

/**
 * Net carbs of normalised Nutrients (a food, a recipe serve or a whole day). Because carbsG is
 * always available carbohydrate, this is carbsG itself; fibre is never subtracted again.
 */
export function netCarbsOf(n: Nutrients): number {
  assertValidNutrients(n);
  return n.carbsG;
}
