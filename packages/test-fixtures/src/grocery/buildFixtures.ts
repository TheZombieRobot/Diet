/**
 * Grocery list builder fixtures (checklist item 24; design 5.1). Synthetic and deterministic, over
 * item 18's shipped catalogue. Item 19's GL-02 and NN-06 rows link to `seed:example-*` ids, which
 * the shipped catalogue never holds, so the builder, database and screen tests use these rows,
 * linked to real catalogue ids, instead. Dates are in the year 2000.
 */
import {
  APPROVED_NUTRIENT_SOURCES,
  type FoodDataOk,
  foodData,
  type GardenRecord,
  type IngredientOverrideRecord,
  type IngredientRecord,
  type IngredientResolver,
  ingredientResolver,
  type PantryRecord,
  type SeedIngredient,
  seedViews,
} from '@diet/core';
import { STOCK_UPDATED_AT, stockId } from '../garden/stockFixtures';

/** Structurally the grocery package's ListFoods (the fixtures package depends on core alone). */
export interface ListFoodsFixture {
  readonly resolve: IngredientResolver;
  readonly seedById: ReadonlyMap<string, SeedIngredient>;
  readonly approved: typeof APPROVED_NUTRIENT_SOURCES;
  readonly data: FoodDataOk;
}

/** The shipped seeds with the owner's corrections and own foods given. */
export function listFoodsFixture(
  options: {
    readonly overrides?: readonly IngredientOverrideRecord[];
    readonly own?: readonly IngredientRecord[];
  } = {},
): ListFoodsFixture {
  const data = foodData();
  if (data.status !== 'ok') throw new Error('The shipped catalogue did not load');
  return {
    resolve: ingredientResolver(seedViews(), options.overrides ?? [], options.own ?? []),
    seedById: data.seedById,
    approved: APPROVED_NUTRIENT_SOURCES,
    data,
  };
}

/** An owner correction of one seed's pack sizes (C110's explicit fixture: chicken 250 g and 500 g). */
export function packSizesOverride(seedId: string, packSizesG: number[]): IngredientOverrideRecord {
  return {
    seedId,
    changes: [{ field: 'packSizes', value: { packSizesG, enteredAt: STOCK_UPDATED_AT } }],
    createdAt: STOCK_UPDATED_AT,
    updatedAt: STOCK_UPDATED_AT,
  };
}

const crop = (
  n: number,
  row: Partial<GardenRecord> & Pick<GardenRecord, 'name'>,
): GardenRecord => ({
  id: stockId(n),
  ingredientId: null,
  amount: null,
  unit: null,
  gramsPerUnit: null,
  harvestReady: true,
  harvestedAt: null,
  perishabilityDays: null,
  updatedAt: STOCK_UPDATED_AT,
  ...row,
});

const item = (
  n: number,
  row: Partial<PantryRecord> & Pick<PantryRecord, 'name'>,
): PantryRecord => ({
  id: stockId(n),
  ingredientId: null,
  amount: null,
  unit: null,
  updatedAt: STOCK_UPDATED_AT,
  ...row,
});

/** Silverbeet 300 g picked 9 January; courgette 2 each at 250.4 g. */
export const LIST_GARDEN: readonly GardenRecord[] = Object.freeze([
  crop(51, {
    name: 'Silverbeet',
    ingredientId: 'seed:silverbeet',
    amount: 300,
    unit: 'g',
    harvestedAt: '2000-01-09',
  }),
  crop(52, {
    name: 'Courgette',
    ingredientId: 'seed:courgette',
    amount: 2,
    unit: 'each',
    gramsPerUnit: 250.4,
  }),
]);

/** Olive oil 500 mL, eggs 6 each, chicken thigh 1,000 g. */
export const LIST_PANTRY: readonly PantryRecord[] = Object.freeze([
  item(61, { name: 'Olive oil', ingredientId: 'seed:olive-oil', amount: 500, unit: 'ml' }),
  item(62, { name: 'Eggs', ingredientId: 'seed:eggs', amount: 6, unit: 'each' }),
  item(63, { name: 'Chicken thighs', ingredientId: 'seed:chicken-thigh', amount: 1000, unit: 'g' }),
]);

/** Eggs, amount not entered. */
export const LIST_PANTRY_UNMEASURED: readonly PantryRecord[] = Object.freeze([
  item(64, { name: 'Eggs', ingredientId: 'seed:eggs' }),
]);

/** Silverbeet, available, amount not entered (C57). */
export const LIST_GARDEN_UNKNOWN: readonly GardenRecord[] = Object.freeze([
  crop(53, { name: 'Silverbeet', ingredientId: 'seed:silverbeet' }),
]);

/** Hens' eggs marked available, amount not entered: not garden produce (J29). */
export const LIST_GARDEN_EGGS_UNKNOWN: readonly GardenRecord[] = Object.freeze([
  crop(54, { name: 'Eggs', ingredientId: 'seed:eggs' }),
]);
