import { foodData, type IngredientRecord, StorageValidationError } from '@diet/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onboardForTests, openTestDb, type TestDb } from '../db/testKit';
import { catalogueFrom, foodsState, readFoodInputs } from './useFoods';

let test: TestDb;
beforeEach(async () => {
  test = await openTestDb();
  await onboardForTests(test);
});
afterEach(() => {
  test.db.shutDown();
});

const shipped = () => {
  const data = foodData();
  if (data.status !== 'ok') throw new Error('the shipped catalogue did not load');
  return data;
};
const T = '2000-01-01T00:00:00.000Z';

describe('the live food catalogue (item 18 design 5.2)', () => {
  it('B1 HS-36 D35: a seed with no figures can never be stored as a food with figures of 0', async () => {
    const state = foodsState(shipped(), await readFoodInputs(test.storage));
    if (state.status !== 'ready') throw new Error('not ready');
    const view = state.viewById.get('seed:spinach');
    if (view === undefined) throw new Error('spinach');
    // Its fields copied into an own food, as a careless caller would (the repository sets the times).
    const viewOnly = new Set(['allergensIfComplete', 'allergensAtLeast', 'createdAt', 'updatedAt']);
    const asRecord = {
      ...Object.fromEntries(Object.entries(view).filter(([key]) => !viewOnly.has(key))),
      id: crypto.randomUUID(),
      allergens: view.allergensIfComplete,
    };
    await expect(test.repos.ingredients.create(asRecord as never)).rejects.toBeInstanceOf(
      StorageValidationError,
    );
    // Even with an ordinary source, all eight unknown is refused (D35).
    await expect(
      test.repos.ingredients.create({ ...asRecord, source: 'estimate' } as never),
    ).rejects.toMatchObject({ field: 'unknownNutrients' });
    expect(await test.repos.ingredients.list()).toEqual([]);
  });

  it('B2 C69 C43 G13 FL-07: corrections show in the views; own foods join the link catalogue; the gluten-free setting is read', async () => {
    const { repos } = test;
    await repos.ingredientOverrides.create({
      seedId: 'seed:spinach',
      changes: [
        { field: 'packSizes', value: { packSizesG: [250], enteredAt: T } },
        { field: 'addAllergens', value: ['tree-nut'] },
        { field: 'aisle', value: 'Health food' },
      ],
    });
    await repos.ingredientOverrides.create({
      seedId: 'seed:no-longer-shipped',
      changes: [{ field: 'name', value: 'Orphan' }],
    });
    const own: Omit<IngredientRecord, 'createdAt' | 'updatedAt'> = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Example own food',
      aliases: [],
      aisle: 'Pantry',
      packSizesG: [],
      packSizeSource: null,
      packSizeEnteredAt: null,
      nutrientsPer100g: {
        energyKj: 100,
        proteinG: 1,
        fatG: 1,
        saturatedFatG: 1,
        carbsG: 1,
        sugarsG: 1,
        fibreG: 0,
        sodiumMg: 1,
      },
      unknownNutrients: ['fibreG'],
      carbBasisAsEntered: 'available',
      nutrientBasis: 'as-sold',
      cookedYield: null,
      yieldCitation: null,
      source: 'label',
      sourceCitation: null,
      allergens: null,
      gardenFlag: false,
      seasonMonths: [],
      substitutes: [],
      gramsPerEach: null,
      servingSizeG: null,
    };
    await repos.ingredients.create(own);
    await repos.profile.update({ glutenFreeHousehold: true });

    const state = foodsState(shipped(), await readFoodInputs(test.storage));
    if (state.status !== 'ready') throw new Error('not ready');
    expect(state.viewById.get('seed:spinach')).toMatchObject({
      packSizesG: [250],
      packSizeSource: 'owner',
      packSizeEnteredAt: T,
      aisle: 'Health food',
      allergensIfComplete: ['tree-nut'],
    });
    expect(state.viewById.has('seed:no-longer-shipped')).toBe(false);
    expect(state.profile.glutenFreeHousehold).toBe(true);
    const catalogue = catalogueFrom(state);
    expect(catalogue.hasDataset).toBe(true);
    expect(catalogue.entries.at(-1)?.id).toBe(own.id);
    expect(catalogue.entries).toHaveLength(state.views.length + 1);
    expect(catalogueFrom({ status: 'pending' }).hasDataset).toBe(false);
  });

  it('N21: a missing profile or a failed read is an error, never "no allergens"', () => {
    expect(foodsState(shipped(), { ok: false })).toEqual({ status: 'error' });
    expect(
      foodsState(shipped(), { ok: true, inputs: { overrides: [], own: [], profile: null } }),
    ).toEqual({ status: 'error' });
    expect(foodsState(null, undefined)).toEqual({ status: 'error' });
    expect(foodsState(shipped(), undefined)).toEqual({ status: 'pending' });
  });
});
