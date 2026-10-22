/**
 * The recipe dataset's shapes (checklist item 20; item 20 design 2.2). Every field is always
 * present; an absent value is null. A recipe holds no nutrient figure: its figures are worked out
 * at read time from item 18's ingredient views (P5), so they fill in when food data arrives.
 */
import type { Allergen } from '../storage/allergens';
import type { SeedId } from '../storage/primitives';
import type { DietMode, MealSlot, RecipeLine } from '../storage/records';

/** A dataset line: the stored line shape, plus curated swaps and the leftover mark. */
export interface SeedRecipeLine extends RecipeLine {
  /** Curated alternatives, 0–5, in preference order; item 18 seed ids. */
  readonly swaps: readonly SeedId[];
  /** Usually left over from the recipe's usesLeftoversFrom. */
  readonly leftover: boolean;
}

export interface SeedRecipe {
  readonly id: SeedId;
  readonly title: string;
  /** Whole, 1–8: how many serves the recipe makes as written. */
  readonly serves: number;
  readonly timeMinutes: number;
  /** Non-empty, unique, in MEAL_SLOTS order. */
  readonly slots: readonly MealSlot[];
  /** The lowest-carb diet mode it was written for (P11). */
  readonly carbStyle: DietMode;
  /** May be the only meal of a one-meal (single-sitting) day (P43). */
  readonly oneMealOk: boolean;
  readonly lines: readonly SeedRecipeLine[];
  /** 1–12 steps, each ending with ".". */
  readonly method: readonly string[];
  /** Exactly the union of what its lines are known to contain, in ALLERGENS order. */
  readonly allergens: readonly Allergen[];
  readonly usesLeftoversFrom: SeedId | null;
}

export interface RecipeData {
  readonly datasetVersion: 1;
  readonly recipes: readonly SeedRecipe[];
  /** Used by the planner only under a Kickstart or keto ceiling (item 20 design 7). Day order. */
  readonly ketoFirstWeek: {
    readonly dinners: readonly SeedId[];
    readonly snacks: readonly SeedId[];
  };
}
