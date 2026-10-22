/**
 * A recipe's live figures for the food log's previews (item 23 design 2.3): the same core
 * functions the repository runs inside its write, from the same rows, so the preview is the entry
 * that will be stored. Never a stored recipe snapshot (HS-R20).
 */
import {
  allSeedViews,
  type DatabaseSource,
  type FoodDataOk,
  ingredientResolver,
  type PortionFigures,
  type RecipeData,
  type RecipeFoods,
  recipeNutrition,
  type RecipeNutrition,
  type RecipeRecord,
  type RefId,
  type SeedRecipe,
} from '@diet/core';
import type { RecipeContextRows } from '../../db/repos/recipes';

export function recipeFoodsFrom(
  data: FoodDataOk,
  rows: Pick<RecipeContextRows, 'own' | 'overrides'>,
  approved: readonly DatabaseSource[],
): RecipeFoods {
  return {
    resolve: ingredientResolver(allSeedViews(data), rows.overrides, rows.own),
    seedById: data.seedById,
    approved,
  };
}

/** A seed recipe or an owner's copy by id, or null when it is not in the app. */
export function findRecipe(
  id: RefId,
  data: RecipeData | null,
  owner: readonly RecipeRecord[],
): SeedRecipe | RecipeRecord | null {
  return data?.recipes.find((r) => r.id === id) ?? owner.find((r) => r.id === id) ?? null;
}

export function portionOf(
  recipe: SeedRecipe | RecipeRecord,
  foods: RecipeFoods,
): { readonly figures: PortionFigures; readonly nutrition: RecipeNutrition } {
  const nutrition = recipeNutrition(recipe, foods);
  return {
    nutrition,
    figures: {
      refId: recipe.id,
      title: recipe.title,
      perServe: nutrition.perServe,
      unknownNutrients: nutrition.unknownNutrients,
      confidence: nutrition.confidence,
    },
  };
}
