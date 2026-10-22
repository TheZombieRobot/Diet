/**
 * Substitute hints (design 2.6; GL-09, C107, FL-07, HS-24, H24b). The first swap item 20's
 * substituteOptions allows (item 18's swapDecision underneath), with two more filters, because
 * the list shops for the household and the hint travels to the laptop with no room to say why:
 * no candidate known to carry an allergen of the household's shared blocked list, and, for an
 * owner who lists an allergen or keeps a gluten-free household, none that needs a label check
 * (J15). The hint names a food only, never an allergen, a dislike or why a candidate was left out.
 * A hint is stored as a bare name, so every profile write that changes the filter clears it (J28).
 */
import { blockedAllergens, type GroceryItem, type RefId, substituteOptions } from '@diet/core';
import type { NeedSource } from './aggregate';
import type { ListFoods, SubstituteProfile } from './types';

const MAX_HINT = 60;

export function substituteHint(
  sources: readonly NeedSource[],
  foods: ListFoods,
  profile: SubstituteProfile,
  gardenIds: ReadonlySet<RefId>,
): string | null {
  const blocked = blockedAllergens(profile, 'shared');
  const checksLabels = profile.allergens.length > 0 || profile.glutenFreeHousehold;
  for (const source of sources) {
    const { candidates } = substituteOptions({
      line: source.line,
      seedLines: source.seedLines,
      foods,
      profile,
      gardenIngredientIds: gardenIds,
    });
    const hint = candidates.find(
      (c) =>
        !c.facts.allergens.some((a) => blocked.includes(a)) &&
        !(checksLabels && c.facts.allergensUnknown) &&
        c.name.length <= MAX_HINT,
    );
    if (hint !== undefined) return hint.name;
  }
  return null;
}

/** A manual line linked to a food: the hint of that food's own substitutes (J35). */
export function manualSubstituteHint(
  ingredientId: RefId,
  foods: ListFoods,
  profile: SubstituteProfile,
  gardenIds: ReadonlySet<RefId>,
): string | null {
  if (foods.resolve(ingredientId) === null) return null;
  return substituteHint(
    [
      {
        line: { ingredientId, rawG: 1, cookedG: null, displayAs: null },
        seedLines: null,
        recipeTitle: '',
      },
    ],
    foods,
    profile,
    gardenIds,
  );
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((x) => right.has(x));
};

/** True when allergens, Gluten-free household or dislikes changed (as sets). */
export function substituteFilterChanged(
  before: SubstituteProfile,
  after: SubstituteProfile,
): boolean {
  return (
    before.glutenFreeHousehold !== after.glutenFreeHousehold ||
    !sameSet(before.allergens, after.allergens) ||
    !sameSet(before.dislikeIngredientIds, after.dislikeIngredientIds) ||
    !sameSet(before.dislikeTerms, after.dislikeTerms)
  );
}

/** Every hint cleared, manual lines included; null when no item had one (nothing to write). */
export function clearSubstituteHints(items: readonly GroceryItem[]): GroceryItem[] | null {
  if (!items.some((item) => item.substituteHint !== null)) return null;
  return items.map((item) => ({ ...item, substituteHint: null }));
}
