/**
 * The shipped ingredient dataset (packages/core/data; item 18 design 2.1 and 3.2). The imports put
 * both files in the app bundle, so the Foods screen works offline with no request (HS-14, PWA-03).
 * Both are checked on first use and kept, deep-frozen. A catalogue that fails gives status 'error'
 * (only the Foods screen and the About line read it); a release that fails is not used at all:
 * every figure reads "not known" and releaseStatus is 'unreadable' (N17). CI makes both
 * impossible to ship (dataset.test.ts).
 */
// The import attributes let Node load them too (the browser tests read core directly).
import catalogueRaw from '../../data/ingredients.json' with { type: 'json' };
import releaseRaw from '../../data/ingredient-nutrients.json' with { type: 'json' };
import { foods } from '../copy/health';
import type { IngredientView } from '../storage/overrides';
import { APPROVED_NUTRIENT_SOURCES } from './approval';
import type {
  AttributionMap,
  DatabaseSource,
  FoodCatalogue,
  NutrientRelease,
  SeedIngredient,
} from './types';
import { deepFrozenCopy, validateFoodCatalogue, validateNutrientRelease } from './validate';
import { allSeedViews, sortSources } from './view';

export type FoodData =
  | {
      readonly status: 'ok';
      readonly catalogue: FoodCatalogue;
      readonly release: NutrientRelease;
      readonly releaseStatus: 'ok' | 'unreadable';
      readonly seedById: ReadonlyMap<string, SeedIngredient>;
    }
  | { readonly status: 'error' };
export type FoodDataOk = Extract<FoodData, { status: 'ok' }>;

/** A release with no source and no figure: what ships until checklist item 10 approves a source. */
export const EMPTY_RELEASE: NutrientRelease = Object.freeze({
  version: 1,
  sources: Object.freeze([]),
  foods: Object.freeze({}),
});

/**
 * Pure: parse and check both files. A release that fails is replaced by EMPTY_RELEASE,
 * 'unreadable'. Only tests of synthetic catalogues pass `shippedChecks: false`.
 */
export function loadFoodData(
  catalogueInput: unknown,
  releaseInput: unknown,
  approved: readonly DatabaseSource[],
  attributions: AttributionMap,
  options: { readonly shippedChecks?: boolean } = {},
): FoodData {
  if (validateFoodCatalogue(catalogueInput, options).length > 0)
    return Object.freeze({ status: 'error' });
  const catalogue = deepFrozenCopy(catalogueInput as FoodCatalogue);
  const releaseOk =
    validateNutrientRelease(releaseInput, catalogue, approved, attributions).length === 0;
  return Object.freeze({
    status: 'ok',
    catalogue,
    release: releaseOk ? deepFrozenCopy(releaseInput as NutrientRelease) : EMPTY_RELEASE,
    releaseStatus: releaseOk ? 'ok' : 'unreadable',
    seedById: new Map(catalogue.foods.map((f) => [f.id, f])),
  });
}

let loaded: FoodData | undefined;
let views: readonly IngredientView[] | undefined;

/** The bundled data, loaded once with APPROVED_NUTRIENT_SOURCES and foods.attribution, and kept. */
export function foodData(): FoodData {
  loaded ??= loadFoodData(catalogueRaw, releaseRaw, APPROVED_NUTRIENT_SOURCES, foods.attribution);
  return loaded;
}

/** The approved sources the loaded release uses ([] when none or unreadable), in NUTRITION_SOURCES order. */
export function sourcesInUse(data: FoodData): DatabaseSource[] {
  if (data.status !== 'ok' || data.releaseStatus !== 'ok') return [];
  return sortSources(Object.values(data.release.foods).map((row) => row.source));
}

/** Every seed as a view (allSeedViews of foodData()), or [] when the catalogue failed. Cached and frozen. */
export function seedViews(): readonly IngredientView[] {
  if (views === undefined) {
    const data = foodData();
    views = Object.freeze(data.status === 'ok' ? allSeedViews(data) : []);
  }
  return views;
}
