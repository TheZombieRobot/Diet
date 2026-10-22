/**
 * The planner's bundled datasets (item 22 design 2.16): item 18's foods and item 20's recipes,
 * with the approved nutrient sources, or null when either could not be loaded. The one place the
 * planner screens, the Fast card's meal sources and the plan write read them; tests replace this
 * module with synthetic data. Both datasets are in the app bundle, so nothing is fetched.
 */
import { APPROVED_NUTRIENT_SOURCES, foodData, type PlanData, recipeData } from '@diet/core';
import { foods as foodsCopy } from '@diet/core/copy/health';

export function planData(): PlanData | null {
  const foods = foodData();
  const recipes = recipeData();
  if (foods.status !== 'ok' || recipes.status !== 'ok') return null;
  return {
    foods,
    recipes: recipes.data,
    approved: APPROVED_NUTRIENT_SOURCES,
    attributions: foodsCopy.attribution,
  };
}
