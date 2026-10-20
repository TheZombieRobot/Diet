/**
 * Allergen wording and the one swap rule (item 18 design 3.4; C43, C107, FL-07, HS-24; item 18–20
 * contract 7). A food's allergens are read only through foodAllergenFacts and decided only by
 * allergenWarning, so a brand-dependent list is never treated as free of a listed allergen, and it
 * still reports what it is known to contain.
 */
import { foods } from '../copy/health';
import { fillTemplate, joinList } from '../copy/template';
import {
  type Allergen,
  allergenWarning,
  GLUTEN_CEREALS,
  sortAllergens,
  type UserAllergen,
} from '../storage/allergens';
import {
  foodAllergenFacts,
  type IngredientResolver,
  type IngredientView,
} from '../storage/overrides';
import type { ProfileRecord } from '../storage/records';
import { isDislikedFood } from './names';
import { SINGLE_FOOD_IDS } from './types';

export type AllergenSummary =
  /** Complete and empty: a fresh single food. */
  | { readonly kind: 'none' }
  /** Not complete, nothing known: a SINGLE_FOOD_IDS food (packed). */
  | { readonly kind: 'none-single' }
  /** Complete, not empty. */
  | { readonly kind: 'contains'; readonly allergens: readonly Allergen[] }
  /** Not complete (may be empty): other allergens depend on the brand. */
  | { readonly kind: 'brand'; readonly allergens: readonly Allergen[] };

export function allergenSummary(
  view: Pick<IngredientView, 'id' | 'allergensIfComplete' | 'allergensAtLeast'>,
): AllergenSummary {
  const facts = foodAllergenFacts(view);
  if (!facts.allergensUnknown) {
    return facts.allergens.length === 0
      ? { kind: 'none' }
      : { kind: 'contains', allergens: facts.allergens };
  }
  if (facts.allergens.length === 0 && SINGLE_FOOD_IDS.includes(view.id))
    return { kind: 'none-single' };
  return { kind: 'brand', allergens: facts.allergens };
}

/** "fish", "soy and wheat", in ALLERGENS order. */
export function allergenListText(list: readonly Allergen[]): string {
  return joinList(
    sortAllergens(list).map((a) => foods.allergenWords[a]),
    foods.listComma,
    foods.listAnd,
  );
}

/** The Allergens line of a food's details. */
export function allergenSummaryText(summary: AllergenSummary): string {
  switch (summary.kind) {
    case 'none':
      return foods.detail.allergensNone;
    case 'none-single':
      return foods.detail.allergensSingle;
    case 'contains':
      return fillTemplate(foods.detail.allergensContains, {
        list: allergenListText(summary.allergens),
      });
    case 'brand':
      return summary.allergens.length === 0
        ? foods.detail.allergensBrandOnly
        : `${fillTemplate(foods.detail.allergensContains, {
            list: allergenListText(summary.allergens),
          })} ${foods.detail.allergensBrandMore}`;
  }
}

/** The allergen part of a food's row: nothing for a complete empty list, else what it contains and "check the label". */
export function allergenRowPart(summary: AllergenSummary): string | null {
  switch (summary.kind) {
    case 'none':
      return null;
    case 'none-single':
      return foods.screen.rowCheckLabel;
    case 'contains':
      return fillTemplate(foods.screen.rowContains, { list: allergenListText(summary.allergens) });
    case 'brand':
      return summary.allergens.length === 0
        ? foods.screen.rowCheckLabel
        : `${fillTemplate(foods.screen.rowContains, {
            list: allergenListText(summary.allergens),
          })} · ${foods.screen.rowCheckLabel}`;
  }
}

/** The conflicts in the owner's own terms: "wheat (gluten)" when the profile listed gluten, not wheat. */
export function conflictText(
  profileAllergens: readonly UserAllergen[],
  conflicts: readonly Allergen[],
): string {
  return joinList(
    sortAllergens(conflicts).map((a) =>
      profileAllergens.includes(a)
        ? foods.allergenWords[a]
        : fillTemplate(foods.allergenCovered, {
            allergen: foods.allergenWords[a],
            choice: foods.glutenWord,
          }),
    ),
    foods.listComma,
    foods.listAnd,
  );
}

const GLUTEN: readonly Allergen[] = GLUTEN_CEREALS;
const hasGluten = (list: readonly Allergen[]): boolean => list.some((a) => GLUTEN.includes(a));

/**
 * C107: the food has a gluten cereal and the swap is known to have none (FL-07). The known lists
 * are used, complete or not, so a brand-dependent swap offered as the gluten-free one counts too.
 */
export function isGlutenFreeSwap(
  food: Pick<IngredientView, 'allergensAtLeast'>,
  swap: Pick<IngredientView, 'allergensAtLeast'>,
): boolean {
  return hasGluten(food.allergensAtLeast) && !hasGluten(swap.allergensAtLeast);
}

/** Whether a swap is offered: never one carrying a listed allergen; gluten-free ones only for a gluten-free household. */
export type SwapDecision =
  | { readonly offered: false; readonly reason: 'allergen' | 'gluten-free' }
  | { readonly offered: true; readonly checkLabel: boolean };

/**
 * The one rule for offering a swap (C107, FL-07, C43): allowedSwaps here and item 20's
 * substituteOptions both call it. A candidate that carries one of the profile's allergens is never
 * offered (not merely warned); a gluten-free swap is offered only with Gluten-free household on,
 * whatever the profile's list says; any other is offered, marked "check the label" when its
 * allergens are not complete.
 */
export function swapDecision(
  food: Pick<IngredientView, 'allergensAtLeast'>,
  candidate: Pick<IngredientView, 'allergensIfComplete' | 'allergensAtLeast'>,
  profile: Pick<ProfileRecord, 'allergens' | 'glutenFreeHousehold'>,
): SwapDecision {
  const facts = foodAllergenFacts(candidate);
  if (allergenWarning(profile.allergens, facts).conflicts.length > 0)
    return { offered: false, reason: 'allergen' };
  if (isGlutenFreeSwap(food, candidate) && !profile.glutenFreeHousehold)
    return { offered: false, reason: 'gluten-free' };
  return { offered: true, checkLabel: facts.allergensUnknown };
}

export interface AllowedSwap {
  readonly view: IngredientView;
  readonly checkLabel: boolean;
}

/**
 * The swaps a food's details may offer, in its own order, and how many were left out: those
 * swapDecision does not offer, and foods the owner does not want suggested (isDislikedFood, as
 * item 20's swap panel leaves them out).
 */
export function allowedSwaps(
  view: IngredientView,
  resolve: IngredientResolver,
  profile: Pick<
    ProfileRecord,
    'allergens' | 'glutenFreeHousehold' | 'dislikeIngredientIds' | 'dislikeTerms'
  >,
): { readonly swaps: readonly AllowedSwap[]; readonly hidden: number } {
  const swaps: AllowedSwap[] = [];
  let hidden = 0;
  for (const id of view.substitutes) {
    const swap = resolve(id);
    if (swap === null) continue;
    const decision = swapDecision(view, swap, profile);
    if (decision.offered && !isDislikedFood(swap, profile))
      swaps.push({ view: swap, checkLabel: decision.checkLabel });
    else hidden += 1;
  }
  return { swaps, hidden };
}
