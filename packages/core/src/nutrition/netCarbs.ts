import { assertInRange } from '../util/round';
import type { CarbBasis } from './nutrients';

export interface CarbFigures {
  carbsG: number;
  fibreG: number;
  /** Whether `carbsG` already excludes fibre. See CarbBasis. */
  carbBasis: CarbBasis;
}

/**
 * Net carbohydrate = carbohydrate − fibre, never negative (DATA_MODEL.md; NU-03).
 *
 * Fibre is subtracted only when the carbohydrate figure includes it ('total', e.g. USDA). NZ
 * labels and the NZ Food Composition Database already exclude fibre ('available'), so their
 * carbohydrate figure is the net figure; subtracting fibre again would undercount carbs and make
 * a keto ceiling look met when it is not.
 */
export function netCarbsG({ carbsG, fibreG, carbBasis }: CarbFigures): number {
  assertInRange('carbsG', carbsG, 0, Number.MAX_SAFE_INTEGER);
  assertInRange('fibreG', fibreG, 0, Number.MAX_SAFE_INTEGER);
  if (carbBasis === 'available') return carbsG;
  return Math.max(0, carbsG - fibreG);
}
