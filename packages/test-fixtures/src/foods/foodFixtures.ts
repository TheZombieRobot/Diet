/**
 * Food fixtures for the app's tests (checklist item 18; C69: one canonical dataset, and tests use
 * a small subset of it). The synthetic catalogue, release and attribution live in core beside the
 * validator they test (core cannot import this package); they are re-exported here. Every example
 * figure is made up for an "example" food; no real food carries a figure here.
 */
import { foodData, type SeedIngredient } from '@diet/core';

export {
  exampleAttribution,
  exampleCatalogue,
  exampleCatalogueCopy,
  exampleFoodData,
  exampleRelease,
  seedViewFixture,
} from '@diet/core/foods/testData';

/** A small subset of the shipped catalogue: leafy greens, raw and cooked, tofu, oil, fish, gluten and nuts. */
export const FOOD_SUBSET_IDS: readonly string[] = Object.freeze([
  'seed:silverbeet',
  'seed:spinach',
  'seed:chicken-breast',
  'seed:chicken-breast-cooked',
  'seed:firm-tofu',
  'seed:silken-tofu',
  'seed:olive-oil',
  'seed:tuna-in-oil',
  'seed:pasta',
  'seed:peanut-butter',
  'seed:tahini',
]);

/** Those foods from core's loaded catalogue (never shipped in the app). */
export function foodSubset(): SeedIngredient[] {
  const data = foodData();
  if (data.status !== 'ok') throw new Error('The shipped catalogue did not load');
  return data.catalogue.foods.filter((f) => FOOD_SUBSET_IDS.includes(f.id));
}
