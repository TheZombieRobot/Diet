/**
 * What the meal checks and the planner read of a recipe (item 20 design 4.10): its live figures,
 * never a stored snapshot. Item 22 passes this to item 15's plannedMealFigures and sums planned
 * energy from it; with unknown figures item 15 offers the snack, and item 18's
 * floorCheckWithUnknowns refuses an app-made day whose energy is incomplete and below the floor.
 */
import type { Nutrients } from '../nutrition/nutrients';
import type { NutrientKey, RecipeLine, RecipeRecord } from '../storage/records';
import type { RecipeFoods } from './foodKind';
import { recipeNutrition } from './nutrition';
import type { SeedRecipe } from './types';

/** Only recipeChecksOf makes one, so a stored record's snapshot is never passed as live figures. */
declare const LIVE_FIGURES: unique symbol;

export interface RecipeChecks {
  readonly serves: number;
  readonly lines: readonly RecipeLine[];
  readonly nutritionPerServe: Nutrients;
  readonly unknownNutrients: NutrientKey[];
  readonly [LIVE_FIGURES]: true;
}

export function recipeChecksOf(
  recipe: SeedRecipe | RecipeRecord,
  foods: RecipeFoods,
): RecipeChecks {
  const n = recipeNutrition(recipe, foods);
  return {
    serves: recipe.serves,
    lines: recipe.lines.map((line) => ({
      ingredientId: line.ingredientId,
      rawG: line.rawG,
      cookedG: line.cookedG,
      displayAs: line.displayAs,
    })),
    nutritionPerServe: { ...n.perServe },
    unknownNutrients: [...n.unknownNutrients],
  } as Omit<RecipeChecks, typeof LIVE_FIGURES> as RecipeChecks;
}
