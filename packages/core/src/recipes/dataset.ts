/**
 * The shipped recipe dataset (packages/core/data/recipes.json; item 20 design 2.1). The import
 * puts it in the app bundle, so the recipes work offline with no request (PWA-03). It is checked
 * against item 18's catalogue on first use and kept, deep-frozen; a file that fails, or a
 * catalogue that failed, gives status 'error' and the recipe screens say so. CI makes both
 * impossible to ship (dataset.test.ts).
 */
// The import attribute lets Node load it too (the browser tests read core directly).
import raw from '../../data/recipes.json' with { type: 'json' };
import { type FoodData, type FoodDataOk, foodData } from '../foods/dataset';
import type { SeedRecipe, RecipeData } from './types';
import { parseRecipeData } from './validate';

export type RecipeDataResult =
  | { readonly status: 'ok'; readonly data: RecipeData; readonly foods: FoodDataOk }
  | { readonly status: 'error' };

const ERROR: RecipeDataResult = Object.freeze({ status: 'error' });

/** Pure, for tests: the dataset checked against `foods`. Never throws. */
export function loadRecipeData(input: unknown, foods: FoodData): RecipeDataResult {
  if (foods.status !== 'ok') return ERROR;
  try {
    return Object.freeze({ status: 'ok', data: parseRecipeData(input, foods), foods });
  } catch {
    return ERROR;
  }
}

let loaded: RecipeDataResult | undefined;
let byId: ReadonlyMap<string, SeedRecipe> | undefined;

/** The bundled dataset, checked against foodData() once and kept. */
export function recipeData(): RecipeDataResult {
  loaded ??= loadRecipeData(raw, foodData());
  return loaded;
}

/** A seed recipe by id; null for an unknown id or when the dataset is 'error'. */
export function seedRecipe(id: string): SeedRecipe | null {
  if (byId === undefined) {
    const result = recipeData();
    byId = new Map(result.status === 'ok' ? result.data.recipes.map((r) => [r.id, r]) : []);
  }
  return byId.get(id) ?? null;
}
