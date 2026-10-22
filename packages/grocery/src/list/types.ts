/**
 * Shared shapes of the grocery list builder (checklist item 24; design 2.1). Every function in
 * this folder is pure: no clock, storage, randomness or network, except the `randomId` an input
 * passes in. Wording comes from core's `grocery` copy section through fillTemplate.
 */
import type {
  CountWord,
  FoodDataOk,
  Instant,
  LocalDate,
  PlannedMealRecord,
  ProfileRecord,
  RecipeFoods,
  RecipeLine,
  SeedRecipeLine,
  TimeZone,
} from '@diet/core';

/** The grocery_lists validator's limit on items (STORAGE_DESIGN 4.11). */
export const MAX_LIST_ITEMS = 500;
/** The validator's limit on quantity, fromGardenG and fromPantryG. */
export const MAX_LINE_AMOUNT = 100_000;

export interface DatedMeal {
  readonly date: LocalDate;
  readonly meal: PlannedMealRecord;
}

export interface ResolvedRecipe {
  /** The recipe's title (owner copy or seed), used only to name a line whose food is gone. */
  readonly title: string;
  readonly serves: number;
  readonly lines: readonly (RecipeLine | SeedRecipeLine)[];
  /** An owner copy's seed lines (item 20's swap pool), else null. */
  readonly seedLines: readonly SeedRecipeLine[] | null;
}

/** Item 18's resolver, seeds and approved sources (item 20's RecipeFoods) plus the catalogue. */
export interface ListFoods extends RecipeFoods {
  readonly data: FoodDataOk;
}

export type SubstituteProfile = Pick<
  ProfileRecord,
  'allergens' | 'glutenFreeHousehold' | 'dislikeIngredientIds' | 'dislikeTerms'
>;

export interface StockContext {
  readonly now: Instant;
  readonly today: LocalDate;
  readonly timeZone: TimeZone;
  /** history.ts: the current list's updatedAt, or null with no list. */
  readonly previousListAt: Instant | null;
}

/** An audit row to write with the list change it explains (kind 'grocery'). */
export interface AuditDraft {
  readonly table: 'garden' | 'pantry' | 'grocery_lists';
  /** A garden or pantry id, a list id, or `${listId}#${lineId}`. */
  readonly recordId: string;
  readonly reason: string;
}

/** The words a line's notes and audit rows use for its food. */
export interface FoodWords {
  readonly name: string;
  readonly countWord: CountWord | null;
}

/** FoodWords plus what the build needs to decide C57's automatic move (J29). */
export interface StockFood extends FoodWords {
  readonly gardenProduce: boolean;
}
