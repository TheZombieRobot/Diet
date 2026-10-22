/**
 * Phone-only allergen reminders (design 2.12; J36): worked out on render, never written to the
 * list, so never in Copy text, an export or the laptop payload (item 31 rule 4).
 */
import {
  type Allergen,
  blockedAllergens,
  foodAllergenFacts,
  type GroceryItem,
  type GroceryListRecord,
  type ProfileRecord,
  servingFor,
} from '@diet/core';
import type { ListFoods } from './types';

type AllergenProfile = Pick<ProfileRecord, 'allergens' | 'glutenFreeHousehold'>;

/** Item 18's "Check the label for allergens" above the aisles. */
export function labelReminderShown(profile: AllergenProfile, list: GroceryListRecord): boolean {
  return (
    (profile.allergens.length > 0 || profile.glutenFreeHousehold) &&
    list.items.some((line) => line.section === 'to-buy')
  );
}

/** The household's blocked allergens this to-buy line's food is known to carry. */
export function lineConflicts(
  line: Pick<GroceryItem, 'ingredientId' | 'section'>,
  foods: Pick<ListFoods, 'resolve'>,
  profile: AllergenProfile,
): readonly Allergen[] {
  if (line.section !== 'to-buy' || line.ingredientId === null) return [];
  const view = foods.resolve(line.ingredientId);
  if (view === null) return [];
  return servingFor(blockedAllergens(profile, 'shared'), foodAllergenFacts(view)).conflicts;
}
