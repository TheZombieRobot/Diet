import { describe, expect, expectTypeOf, it } from 'vitest';
import { confidenceOf, type NUTRITION_SOURCES } from '../nutrition/confidence';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import { effectiveIngredient, type FoodSource, type IngredientView } from '../storage/overrides';
import type { IngredientRecord, NutrientKey } from '../storage/records';
import { foodData } from './dataset';
import { figureText, knownFigure } from './figures';
import { exampleCatalogue, exampleFoodData, exampleRelease, seedViewFixture } from './testData';
import type {
  FOOD_GROUPS,
  FoodGroup,
  PACK_UNITS,
  PackUnit,
  RELEASE_UNITS,
  SEED_AISLES,
  SeedAisle,
} from './types';
import {
  allSeedViews,
  displaySource,
  effectivePacks,
  foodConfidence,
  lineSourceForMix,
  seedView,
  twinOf,
} from './view';

const shipped = () => {
  const data = foodData();
  if (data.status !== 'ok') throw new Error('the shipped catalogue did not load');
  return data;
};
const T = '2000-01-01T00:00:00.000Z';

describe('seed views (item 18 design 3.2)', () => {
  it('F5 HS-37 C43 C69 D35: every shipped seed reads as not loaded, with no figure, citation or badge', () => {
    const data = shipped();
    for (const view of allSeedViews(data)) {
      const seed = data.seedById.get(view.id);
      if (seed === undefined) throw new Error(view.id);
      expect(view.source).toBe('not-loaded');
      expect(view.unknownNutrients).toEqual([...NUTRIENT_KEYS]);
      for (const key of NUTRIENT_KEYS) {
        expect(view.nutrientsPer100g[key]).toBe(0);
        expect(knownFigure(view, key)).toBeNull();
      }
      expect(view).toMatchObject({ sourceCitation: null, cookedYield: null, yieldCitation: null });
      expect(foodConfidence(view)).toBeNull();
      expect(lineSourceForMix(view)).toBe('estimate');
      if (seed.packs?.unit === 'g') {
        expect(view.packSizesG).toEqual(seed.packs.sizes);
        expect(view.packSizeSource).toBe('typical');
      } else {
        expect(view.packSizesG).toEqual([]);
        expect(view.packSizeSource).toBeNull();
      }
      expect(view.allergensIfComplete).toEqual(seed.allergensComplete ? seed.allergens : null);
      expect(view.allergensAtLeast).toEqual(seed.allergens);
      expect(view.createdAt).toBe(`${data.catalogue.revisedOn}T00:00:00.000Z`);
    }
  });

  it('F6 C01 C31 N5: a loaded row is read as published, with the two USDA conversions only', () => {
    const [nzGreen] = allSeedViews(exampleFoodData('nz-fcdb'));
    const [usGreen, , , usOil] = allSeedViews(exampleFoodData('usda'));
    expect(nzGreen?.nutrientsPer100g.carbsG).toBe(10);
    expect(nzGreen?.carbBasisAsEntered).toBe('available');
    expect(usGreen?.nutrientsPer100g.carbsG).toBe(7); // 10 g by difference less 3 g fibre
    expect(usGreen?.carbBasisAsEntered).toBe('total');
    expect(usGreen?.sourceCitation).toBe('Example database, Example edition, food X1');
    // The oil's row has no sugars figure: listed, never 0 as a value.
    expect(usOil?.unknownNutrients).toEqual(['sugarsG']);
    if (usOil !== undefined) expect(knownFigure(usOil, 'sugarsG')).toBeNull();

    const row = exampleRelease('usda').foods['seed:example-green'];
    if (row === undefined) throw new Error('row');
    const seed = exampleCatalogue.foods[0];
    if (seed === undefined) throw new Error('seed');
    const info = exampleRelease('usda').sources[0] ?? null;
    const noFibre = { ...row, values: { ...row.values, fibreG: null } };
    expect(seedView(seed, noFibre, info, '2000-01-01').unknownNutrients).toEqual([
      'carbsG',
      'fibreG',
    ]);
    const kcal = {
      ...row,
      values: {
        ...row.values,
        energyKj: { value: 94, unit: 'kcal' as const, field: 'E2', source: 'usda' as const },
      },
    };
    const energy = seedView(seed, kcal, info, '2000-01-01').nutrientsPer100g.energyKj;
    expect(energy).toBeCloseTo(393.296, 9);
    expect(figureText('energyKj', { kind: 'value', value: energy })).toBe('393 kJ');
  });

  it('F11 HS-37 X6: a view is never a stored record, and has no plain allergen list', () => {
    const view = seedViewFixture();
    // @ts-expect-error A FoodSource may be 'not-loaded', which has no badge.
    expect(() => confidenceOf(view.source)).toThrow(RangeError);
    // @ts-expect-error A view cannot be written as an ingredient record.
    const record: IngredientRecord = view;
    expect(record.id).toBe(view.id);
    // @ts-expect-error There is no allergens field: read allergens through foodAllergenFacts.
    expect(view.allergens).toBeUndefined();
    expectTypeOf<SeedAisle>().toEqualTypeOf<(typeof SEED_AISLES)[number]>();
    expectTypeOf<FoodGroup>().toEqualTypeOf<(typeof FOOD_GROUPS)[number]>();
    expectTypeOf<PackUnit>().toEqualTypeOf<(typeof PACK_UNITS)[number]>();
    expectTypeOf<keyof typeof RELEASE_UNITS>().toEqualTypeOf<NutrientKey>();
    expectTypeOf<FoodSource>().toEqualTypeOf<(typeof NUTRITION_SOURCES)[number] | 'not-loaded'>();
  });

  it("F15 C67 C69: raw and cooked twins from either side; an owner's grams win over the seed's packs", () => {
    const data = shipped();
    const pair = { raw: 'seed:chicken-breast', cooked: 'seed:chicken-breast-cooked' };
    expect(twinOf(data, 'seed:chicken-breast')).toEqual(pair);
    expect(twinOf(data, 'seed:chicken-breast-cooked')).toEqual(pair);
    expect(twinOf(data, 'seed:spinach')).toBeNull();
    const oil = data.seedById.get('seed:olive-oil') ?? null;
    const view = allSeedViews(data).find((v) => v.id === 'seed:olive-oil') as IngredientView;
    const owner = effectiveIngredient(view, {
      seedId: 'seed:olive-oil',
      changes: [{ field: 'packSizes', value: { packSizesG: [750], enteredAt: T } }],
      createdAt: T,
      updatedAt: T,
    });
    expect(effectivePacks(oil, view)).toEqual(oil?.packs);
    // A millilitre bottle is not carried over to grams.
    expect(effectivePacks(oil, owner)).toEqual({ unit: 'g', sizes: [750], container: null });
  });

  it('F19 C97 C32 N43: a database source that was not approved shows and counts as Estimate', () => {
    const usda = seedViewFixture({ source: 'usda', unknownNutrients: [] });
    expect(displaySource(usda)).toBe('estimate');
    expect(foodConfidence(usda)).toBe('estimate');
    expect(lineSourceForMix(usda)).toBe('estimate');
    expect(displaySource(usda, ['usda'])).toBe('usda');
    expect(foodConfidence(usda, ['usda'])).toBe('database');
    expect(foodConfidence(seedViewFixture({ source: 'label', unknownNutrients: ['fibreG'] }))).toBe(
      'label',
    );
    // Contract 5: a recipe line missing any figure counts as Estimate, even from an approved source.
    expect(lineSourceForMix(usda, ['usda'])).toBe('usda');
    expect(
      lineSourceForMix(seedViewFixture({ source: 'usda', unknownNutrients: ['fibreG'] }), ['usda']),
    ).toBe('estimate');
  });
});
