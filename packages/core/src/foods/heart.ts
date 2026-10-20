/**
 * HEALTH_SAFETY section 4's recipe roles, by food group (item 18 design 3.7; NU-04 data for item
 * 20). Strictly the section's lists: what it favours, what it flags (fatty cuts, processed meat,
 * butter and cream, coconut oil and coconut cream, cheese above about 40 g per serve), and nothing
 * else. Flagged does not mean forbidden. The heart-smart badge itself needs a known saturated-fat
 * figure, which item 20 checks.
 */
import type { SeedId } from '../storage/primitives';
import type { FoodGroup } from './types';

export type HeartRole =
  | { readonly kind: 'favour' }
  | { readonly kind: 'flag'; readonly aboveGramsPerServe: number }
  | { readonly kind: 'neutral' };

/** "Cheese above about 40 g per serve" (HEALTH_SAFETY section 4). */
export const CHEESE_FLAG_ABOVE_G = 40;

/** The ordinary cuts, flagged as fatty (lean entries carry only lean names: rule CR20). */
export const FATTY_CUT_IDS: readonly SeedId[] = Object.freeze([
  'seed:beef-mince',
  'seed:lamb-chops',
  'seed:pork-chops',
]);

const FLAGGED_GROUPS: readonly FoodGroup[] = ['processed-meat', 'butter-cream'];
const FLAGGED_IDS: readonly SeedId[] = ['seed:coconut-oil', 'seed:coconut-cream'];
const FAVOURED_GROUPS: readonly FoodGroup[] = [
  'leafy-green',
  'vegetable',
  'poultry',
  'oily-fish',
  'egg',
  'legume',
  'nut-seed',
];
const FAVOURED_IDS: readonly SeedId[] = ['seed:olive-oil', 'seed:avocado'];

/** The first match wins: fatty cuts and flagged fats, cheese, favoured foods, then neutral. */
export function heartRoleOf(food: { readonly id: string; readonly group: FoodGroup }): HeartRole {
  if (
    FATTY_CUT_IDS.includes(food.id) ||
    FLAGGED_GROUPS.includes(food.group) ||
    FLAGGED_IDS.includes(food.id)
  )
    return { kind: 'flag', aboveGramsPerServe: 0 };
  if (food.group === 'cheese') return { kind: 'flag', aboveGramsPerServe: CHEESE_FLAG_ABOVE_G };
  if (FAVOURED_GROUPS.includes(food.group) || FAVOURED_IDS.includes(food.id))
    return { kind: 'favour' };
  return { kind: 'neutral' };
}
