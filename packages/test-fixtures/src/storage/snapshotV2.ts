/**
 * The released schema-version-2 fixture (storage spec section 9.4; checklist item 23): the
 * version-1 fixture plus the two rows version 2 newly allows, a plan log row and an owner's recipe
 * copy, each listing all eight figures as unknown (item 18–20 contract 8). Every value is plainly
 * synthetic. Its SHA-256 is pinned by snapshotV2.test.ts, so this released fixture cannot be
 * edited; snapshotV1 is not touched.
 */
import { NUTRIENT_KEYS, type Snapshot, sortByPrimaryKey, TABLES_V2 } from '@diet/core';
import { fixtureId, snapshotV1 } from './snapshotV1';

const ALL_UNKNOWN = {
  nutrients: Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [k, 0]),
  ) as unknown as Snapshot['food_log'][number]['nutrients'],
  unknownNutrients: [...NUTRIENT_KEYS],
};

/** The rows version 2 adds, for the fixture test's coverage check. */
export const SNAPSHOT_V2_ADDED = Object.freeze({
  food_log: [
    {
      id: fixtureId(0x2301),
      at: '2000-01-06T06:00:00.000Z',
      timeZone: 'Pacific/Auckland',
      sourceKind: 'plan',
      refId: '2000-01-06#dinner',
      name: 'Example traybake',
      grams: null,
      weightBasis: null,
      servings: 1,
      ...ALL_UNKNOWN,
      confidence: 'estimate',
    },
  ] satisfies Snapshot['food_log'],
  recipes: [
    {
      id: fixtureId(0x2302),
      title: 'Example traybake',
      serves: 4,
      timeMinutes: 40,
      lines: [
        { ingredientId: 'seed:chicken-thigh', rawG: 600, cookedG: null, displayAs: null },
        { ingredientId: 'seed:silverbeet', rawG: 300, cookedG: null, displayAs: null },
      ],
      method: ['Roast everything together.'],
      tags: [],
      allergens: [],
      derivedFromRecipeId: 'seed:recipe-chicken-silverbeet-traybake',
      nutritionPerServe: ALL_UNKNOWN.nutrients,
      unknownNutrients: ALL_UNKNOWN.unknownNutrients,
      confidence: 'estimate',
      sourceMix: { label: 0, 'nz-fcdb': 0, usda: 0, estimate: 2 },
      createdAt: '2000-01-06T00:00:00.000Z',
      updatedAt: '2000-01-06T00:00:00.000Z',
    },
  ] satisfies Snapshot['recipes'],
});

/** Every table in primary-key order, as an export writes it. */
export const snapshotV2: Snapshot = {
  ...snapshotV1,
  food_log: sortByPrimaryKey(TABLES_V2.food_log, [
    ...snapshotV1.food_log,
    ...SNAPSHOT_V2_ADDED.food_log,
  ]),
  recipes: sortByPrimaryKey(TABLES_V2.recipes, [
    ...snapshotV1.recipes,
    ...SNAPSHOT_V2_ADDED.recipes,
  ]),
};
