/**
 * Garden and pantry rows for the stock read (checklist item 19; design section 5; GL-02, NN-06,
 * C57, C110). Item 24 uses the same rows for its GL-02 and NN-06 deduction tests. Every value is
 * synthetic: dates in the year 2000, made-up seed ids for the example foods.
 */
import type { GardenRecord, Instant, LocalDate, PantryRecord } from '@diet/core';

export const STOCK_TODAY: LocalDate = '2000-01-10';
export const STOCK_NOW: Instant = '2000-01-10T00:00:00.000Z';
/** When every row was last changed, unless a row says otherwise. */
export const STOCK_UPDATED_AT: Instant = '2000-01-09T00:00:00.000Z';

/** A synthetic UUID v4 numbered n (1 to 99): 0b6f1d2e-0000-4000-8000-0000000001nn. */
export const stockId = (n: number): string =>
  `0b6f1d2e-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

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

/** GL-02 garden: counted by weight, by count with grams per item, by count alone, and three left out. */
export const GL02_GARDEN: readonly GardenRecord[] = Object.freeze([
  crop(1, {
    name: 'Silverbeet',
    ingredientId: 'seed:silverbeet',
    amount: 300,
    unit: 'g',
    harvestedAt: '2000-01-09',
    perishabilityDays: 5,
  }),
  crop(2, {
    name: 'Example spinach',
    ingredientId: 'seed:example-spinach',
    amount: 100,
    unit: 'g',
    harvestedAt: '2000-01-05',
    perishabilityDays: 5,
  }),
  crop(3, {
    name: 'Example courgette',
    ingredientId: 'seed:example-courgette',
    amount: 2,
    unit: 'each',
    gramsPerUnit: 250.4,
  }),
  crop(4, {
    name: 'Example lettuce',
    ingredientId: 'seed:example-lettuce',
    amount: 2,
    unit: 'each',
  }),
  crop(5, {
    name: 'Example beans',
    ingredientId: 'seed:example-beans',
    amount: 200,
    unit: 'g',
    harvestReady: false,
  }),
  crop(6, {
    name: 'Example kale',
    ingredientId: 'seed:example-kale',
    amount: 150,
    unit: 'g',
    harvestedAt: '2000-01-04',
    perishabilityDays: 5,
  }),
  crop(7, { name: 'Example herb' }),
]);

/** GL-02 pantry: counts, a weight changed 8 days ago, an unmeasured item, none left and an unlinked one. */
export const GL02_PANTRY: readonly PantryRecord[] = Object.freeze([
  item(11, { name: 'Olive oil', ingredientId: 'seed:example-olive-oil', amount: 500, unit: 'ml' }),
  item(12, { name: 'Eggs', ingredientId: 'seed:example-eggs', amount: 6, unit: 'each' }),
  item(13, {
    name: 'Example flour',
    ingredientId: 'seed:example-flour',
    amount: 1000,
    unit: 'g',
    updatedAt: '2000-01-02T00:00:00.000Z',
  }),
  item(14, { name: 'Example tinned fish', ingredientId: 'seed:example-tinned-fish' }),
  item(15, { name: 'Example rice', ingredientId: 'seed:example-rice', amount: 0, unit: 'g' }),
  item(16, { name: 'Example spice', amount: 50, unit: 'g' }),
]);

/** C57: the seeded state: silverbeet available, amount not entered. */
export const GL02_NULL_AMOUNT_GARDEN: readonly GardenRecord[] = Object.freeze([
  crop(21, { name: 'Silverbeet', ingredientId: 'seed:silverbeet' }),
]);

/** NN-06: silverbeet 300 g in the garden (item 24 adds the 500 g need: 200 g to buy). */
export const NN06_GARDEN: readonly GardenRecord[] = Object.freeze([
  crop(31, { name: 'Silverbeet', ingredientId: 'seed:silverbeet', amount: 300, unit: 'g' }),
]);

/** Item 24: unmeasured eggs stay on the to-buy list by default. */
export const NN06_PANTRY_UNMEASURED: readonly PantryRecord[] = Object.freeze([
  item(41, { name: 'Eggs', ingredientId: 'seed:example-eggs' }),
]);
