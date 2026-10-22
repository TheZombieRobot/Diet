/**
 * Synthetic food data for tests (item 18 design 3.9), beside the code it tests, as
 * exercise/testSessions.ts is: @diet/test-fixtures depends on core, so core cannot import it.
 * Not exported from core's index; reached only through the "@diet/core/foods/testData" subpath,
 * and a scan (tools/scans/foodsHome.test.ts) allows that import only in tests and test-fixtures.
 *
 * Every food here is an "example" with round made-up figures: none describes a real food, so no
 * figure from memory enters the repository.
 */
import type { IngredientView } from '../storage/overrides';
import { EMPTY_RELEASE, type FoodDataOk, loadFoodData } from './dataset';
import { seedView } from './view';
import type {
  AttributionMap,
  DatabaseSource,
  FoodCatalogue,
  NutrientRelease,
  ReleaseRow,
  SeedIngredient,
} from './types';

const green: SeedIngredient = {
  id: 'seed:example-green',
  name: 'Example leafy green',
  aliases: ['Example greens'],
  aisle: 'Produce',
  group: 'leafy-green',
  packs: { unit: 'each', sizes: [1], container: null },
  loose: true,
  gramsPerEach: 500,
  countWord: { one: 'bunch', many: 'bunches' },
  allergens: [],
  allergensComplete: true,
  gardenFlag: true,
  seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  basis: 'raw',
  cookedOf: null,
  substitutes: [],
  importHint: 'raw leaves',
};

const protein: SeedIngredient = {
  id: 'seed:example-protein',
  name: 'Example protein food',
  aliases: [],
  aisle: 'Meat and fish',
  group: 'lean-fish',
  packs: { unit: 'g', sizes: [250, 500], container: { one: 'pack', many: 'packs' } },
  loose: false,
  gramsPerEach: null,
  countWord: null,
  allergens: ['fish'],
  allergensComplete: true,
  gardenFlag: false,
  seasonMonths: [],
  basis: 'raw',
  cookedOf: null,
  substitutes: ['seed:example-green'],
  importHint: 'raw fillet',
};

const proteinCooked: SeedIngredient = {
  ...protein,
  id: 'seed:example-protein-cooked',
  name: 'Example protein food, cooked',
  packs: null,
  basis: 'cooked',
  cookedOf: 'seed:example-protein',
  substitutes: [],
  importHint: 'baked',
};

const oil: SeedIngredient = {
  id: 'seed:example-oil',
  name: 'Example oil',
  aliases: [],
  aisle: 'Pantry',
  group: 'oil',
  packs: { unit: 'ml', sizes: [500, 1000], container: { one: 'bottle', many: 'bottles' } },
  loose: false,
  gramsPerEach: null,
  countWord: null,
  allergens: [],
  allergensComplete: false,
  gardenFlag: false,
  seasonMonths: [],
  basis: 'as-sold',
  cookedOf: null,
  substitutes: [],
  importHint: 'as sold',
};

/** A valid synthetic catalogue (validated with { shippedChecks: false }). */
export const exampleCatalogue: FoodCatalogue = {
  version: 1,
  revisedOn: '2000-01-01',
  foods: [green, protein, proteinCooked, oil],
};

/** A fresh, mutable copy of the example catalogue, for tests that break one field. */
export function exampleCatalogueCopy(): {
  version: number;
  revisedOn: string;
  foods: Record<string, unknown>[];
} {
  return JSON.parse(JSON.stringify(exampleCatalogue)) as {
    version: number;
    revisedOn: string;
    foods: Record<string, unknown>[];
  };
}

function exampleRow(source: DatabaseSource, foodId: string, sugarsKnown = true): ReleaseRow {
  const value = (n: number, unit: 'kJ' | 'g' | 'mg', field: string) => ({
    value: n,
    unit,
    field,
    source,
  });
  return {
    source,
    foodId,
    foodName: `Example database food ${foodId}`,
    values: {
      energyKj: value(1000, 'kJ', 'E1'),
      proteinG: value(20, 'g', 'P1'),
      fatG: value(10, 'g', 'F1'),
      saturatedFatG: value(2, 'g', 'S1'),
      carbsG: value(10, 'g', 'C1'),
      sugarsG: sugarsKnown ? value(1, 'g', 'U1') : null,
      fibreG: value(3, 'g', 'B1'),
      sodiumMg: value(100, 'mg', 'N1'),
    },
  };
}

/**
 * A release approved for `source`: one row per example food with round made-up figures (1,000 kJ;
 * 20 g protein; 10 g fat; 2 g saturated fat; 10 g carbohydrate; 1 g sugars; 3 g fibre; 100 mg
 * sodium), the oil's row with no sugars figure.
 */
export function exampleRelease(source: DatabaseSource): NutrientRelease {
  return {
    version: 1,
    sources: [
      {
        id: source,
        title: 'Example database',
        edition: 'Example edition',
        retrievedOn: '2000-01-01',
        decidedOn: '2000-01-01',
      },
    ],
    foods: {
      'seed:example-green': exampleRow(source, 'X1'),
      'seed:example-protein': exampleRow(source, 'X2'),
      'seed:example-protein-cooked': exampleRow(source, 'X3'),
      'seed:example-oil': exampleRow(source, 'X4', false),
    },
  };
}

export const exampleAttribution: AttributionMap = {
  usda: { name: 'Example database', text: 'Example attribution text.' },
  'nz-fcdb': { name: 'Example database', text: 'Example attribution text.' },
};

/**
 * The example catalogue loaded as the app loads the shipped one: with no release (every figure not
 * known), or with an example release approved and attributed for `source`.
 */
export function exampleFoodData(source: DatabaseSource | null = null): FoodDataOk {
  const data = loadFoodData(
    exampleCatalogue,
    source === null ? EMPTY_RELEASE : exampleRelease(source),
    source === null ? [] : [source],
    exampleAttribution,
    { shippedChecks: false },
  );
  if (data.status !== 'ok') throw new Error('The example catalogue should load');
  return data;
}

/** A not-loaded view of the example leafy green, with any fields replaced. */
export function seedViewFixture(changes: Partial<IngredientView> = {}): IngredientView {
  return { ...seedView(green, null, null, exampleCatalogue.revisedOn), ...changes };
}
