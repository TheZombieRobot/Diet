/**
 * Planner fixtures for tests (item 22 design 6.0), beside the code they test as foods/testData.ts
 * and recipes/testData.ts are. Not exported from core's index; reached only through
 * "@diet/core/planner/testData", which a scan allows only in tests and test-fixtures.
 *
 * Every food and recipe here is an "Example" with round made-up figures: none describes a real
 * food or dish, none ships, and no figure from memory enters the repository. The foods are a
 * synthetic catalogue with a synthetic release approved for one source, so the figures count as
 * loaded; `loaded: false` gives the shipped state (every figure not known).
 */
import type { EatingWindow } from '../fasting/eatingWindow';
import { EMPTY_RELEASE, type FoodDataOk, loadFoodData } from '../foods/dataset';
import { validateFoodCatalogue } from '../foods/validate';
import type {
  AttributionMap,
  DatabaseSource,
  NutrientRelease,
  ReleaseRow,
  SeedIngredient,
} from '../foods/types';
import type { RecipeData, SeedRecipe } from '../recipes/types';
import type { Allergen } from '../storage/allergens';
import type { SeedId } from '../storage/primitives';
import type { DietMode, MealSlot, PlannedMealRecord } from '../storage/records';
import type { DayTargets } from '../targets/dayTargets';
import type { LocalDate } from '../util/time';
import type { PlanDayContext } from './checks';
import { type PlanData, type PlanRecipeLookup, planRecipeLookup } from './context';
import { allowedSlots, planSlotsFor } from './slots';
import { planDateState } from './week';

export const EXAMPLE_PLAN_SOURCE: DatabaseSource = 'nz-fcdb';

/** Today in the fixtures: a Wednesday; the week runs 3 to 9 January 2000. */
export const PLAN_TODAY: LocalDate = '2000-01-05';
export const PLAN_WEEK: LocalDate = '2000-01-03';

/**
 * The synthetic foods. Groups and aisles are chosen only so the catalogue rules let each list be
 * complete where design 6.0 says so; they describe no real food.
 */
interface FoodRow {
  readonly key: string;
  readonly name: string;
  readonly group: SeedIngredient['group'];
  readonly aisle: SeedIngredient['aisle'];
  /** kJ, protein, fat, saturated fat, net carbs, fibre, sodium (mg), per 100 g. */
  readonly per100g: readonly [number, number, number, number, number, number, number];
  readonly allergens: readonly Allergen[];
  readonly complete: boolean;
  readonly garden?: { readonly months: readonly number[] };
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const FOODS: readonly FoodRow[] = [
  {
    key: 'protein',
    name: 'Example protein food',
    group: 'poultry',
    aisle: 'Meat and fish',
    per100g: [600, 25, 2, 0.5, 0, 0, 60],
    allergens: [],
    complete: true,
  },
  {
    key: 'fat',
    name: 'Example fat',
    group: 'fruit',
    aisle: 'Produce',
    per100g: [3700, 0, 100, 14, 0, 0, 0],
    allergens: [],
    complete: true,
  },
  {
    key: 'green-a',
    name: 'Example green A',
    group: 'leafy-green',
    aisle: 'Produce',
    per100g: [100, 2, 0.3, 0, 2, 2, 20],
    allergens: [],
    complete: true,
    garden: { months: ALL_MONTHS },
  },
  {
    key: 'green-b',
    name: 'Example green B',
    group: 'leafy-green',
    aisle: 'Produce',
    per100g: [100, 2, 0.3, 0, 2, 2, 20],
    allergens: [],
    complete: true,
    garden: { months: ALL_MONTHS },
  },
  {
    key: 'green-c',
    name: 'Example green C',
    group: 'leafy-green',
    aisle: 'Produce',
    per100g: [100, 2, 0.3, 0, 2, 2, 20],
    allergens: [],
    complete: true,
    garden: { months: [6, 7, 8] },
  },
  {
    key: 'high-carb',
    name: 'Example high-carb food',
    group: 'starchy-vegetable',
    aisle: 'Produce',
    per100g: [1500, 8, 1, 0.2, 75, 3, 5],
    allergens: [],
    complete: true,
  },
  {
    key: 'fish',
    name: 'Example fish food',
    group: 'lean-fish',
    aisle: 'Meat and fish',
    per100g: [600, 25, 2, 0.5, 0, 0, 60],
    allergens: ['fish'],
    complete: true,
  },
  {
    key: 'wheat',
    name: 'Example wheat food',
    group: 'starchy-vegetable',
    aisle: 'Produce',
    per100g: [1500, 12, 2, 0.4, 65, 3, 5],
    allergens: ['wheat'],
    complete: true,
  },
  {
    key: 'packed',
    name: 'Example packed food',
    group: 'condiment',
    aisle: 'Pantry',
    per100g: [500, 5, 2, 0.3, 10, 1, 400],
    allergens: [],
    complete: false,
  },
  {
    key: 'egg',
    name: 'Example egg',
    group: 'egg',
    aisle: 'Dairy and eggs',
    per100g: [600, 12.5, 10, 3, 0.5, 0, 140],
    allergens: ['egg'],
    complete: true,
  },
];

export const foodId = (key: string): SeedId => `seed:example-plan-${key}`;

function seedOf(row: FoodRow): SeedIngredient {
  return {
    id: foodId(row.key),
    name: row.name,
    aliases: [],
    aisle: row.aisle,
    group: row.group,
    packs: { unit: 'g', sizes: [500], container: { one: 'pack', many: 'packs' } },
    loose: row.garden !== undefined,
    gramsPerEach: null,
    countWord: null,
    allergens: [...row.allergens],
    allergensComplete: row.complete,
    gardenFlag: row.garden !== undefined,
    seasonMonths: [...(row.garden?.months ?? [])],
    basis: 'raw',
    cookedOf: null,
    substitutes: [],
    importHint: 'raw',
  };
}

function rowOf(row: FoodRow, i: number): ReleaseRow {
  const [kj, protein, fat, sat, carbs, fibre, sodium] = row.per100g;
  const v = (value: number, unit: 'kJ' | 'g' | 'mg', field: string) => ({
    value,
    unit,
    field,
    source: EXAMPLE_PLAN_SOURCE,
  });
  return {
    source: EXAMPLE_PLAN_SOURCE,
    foodId: `X${i + 1}`,
    foodName: `Example database food ${i + 1}`,
    values: {
      energyKj: v(kj, 'kJ', 'E'),
      proteinG: v(protein, 'g', 'P'),
      fatG: v(fat, 'g', 'F'),
      saturatedFatG: v(sat, 'g', 'S'),
      carbsG: v(carbs, 'g', 'C'),
      sugarsG: v(0, 'g', 'U'),
      fibreG: v(fibre, 'g', 'B'),
      sodiumMg: v(sodium, 'mg', 'N'),
    },
  };
}

const ATTRIBUTION: AttributionMap = {
  usda: { name: 'Example database', text: 'Example attribution text.' },
  'nz-fcdb': { name: 'Example database', text: 'Example attribution text.' },
};

const RELEASE: NutrientRelease = {
  version: 1,
  sources: [
    {
      id: EXAMPLE_PLAN_SOURCE,
      title: 'Example database',
      edition: 'Example edition',
      retrievedOn: '2000-01-01',
      decidedOn: '2000-01-01',
    },
  ],
  foods: Object.fromEntries(FOODS.map((row, i) => [foodId(row.key), rowOf(row, i)])),
};

/** The synthetic catalogue, loaded with its release approved, or (loaded: false) with none. */
export function examplePlanFoodData(options: { readonly loaded?: boolean } = {}): FoodDataOk {
  const loaded = options.loaded ?? true;
  const catalogue = { version: 1, revisedOn: '2000-01-01', foods: FOODS.map(seedOf) };
  const data = loadFoodData(
    catalogue,
    loaded ? RELEASE : EMPTY_RELEASE,
    loaded ? [EXAMPLE_PLAN_SOURCE] : [],
    ATTRIBUTION,
    { shippedChecks: false },
  );
  if (data.status !== 'ok') {
    const problems = validateFoodCatalogue(catalogue, { shippedChecks: false });
    throw new Error(`The example planner catalogue should load: ${JSON.stringify(problems)}`);
  }
  if (loaded && data.releaseStatus !== 'ok') throw new Error('The example release should load');
  return data;
}

export const recipeId = (key: string): SeedId => `seed:recipe-example-${key}`;

/** The recipe keys of design 6.0's table. */
export const R = {
  dinnerA: recipeId('dinner-a'),
  snackB: recipeId('snack-b'),
  soupC: recipeId('soup-c'),
  fishD: recipeId('fish-dinner-d'),
  wheatE: recipeId('wheat-dinner-e'),
  gardenF: recipeId('garden-dinner-f'),
  packedG: recipeId('packed-dinner-g'),
  bigH: recipeId('big-dinner-h'),
  carbI: recipeId('carb-dinner-i'),
  breakfastJ: recipeId('breakfast-j'),
  lunchK: recipeId('lunch-k'),
  lightM: recipeId('light-garden-dinner-m'),
} as const;

function recipe(
  id: SeedId,
  title: string,
  slots: readonly MealSlot[],
  lines: readonly (readonly [string, number])[],
  options: {
    readonly oneMealOk?: boolean;
    readonly carbStyle?: DietMode;
    readonly usesLeftoversFrom?: SeedId | null;
  } = {},
): SeedRecipe {
  const allergens = [
    ...new Set(lines.flatMap(([key]) => FOODS.find((f) => f.key === key)?.allergens ?? [])),
  ];
  return {
    id,
    title,
    serves: 1,
    timeMinutes: 30,
    slots: [...slots],
    carbStyle: options.carbStyle ?? 'keto',
    oneMealOk: options.oneMealOk ?? true,
    lines: lines.map(([key, rawG]) => ({
      ingredientId: foodId(key),
      rawG,
      cookedG: null,
      displayAs: null,
      swaps: [],
      leftover: false,
    })),
    method: ['Cook it.'],
    allergens,
    usesLeftoversFrom: options.usesLeftoversFrom ?? null,
  };
}

/** Design 6.0's recipes, every one serving 1, every line raw. */
export function examplePlanRecipeData(): RecipeData {
  return {
    datasetVersion: 1,
    recipes: [
      recipe(
        R.dinnerA,
        'Example dinner A',
        ['dinner'],
        [
          ['protein', 280],
          ['fat', 80],
        ],
      ),
      recipe(
        R.snackB,
        'Example snack B',
        ['snack'],
        [
          ['protein', 100],
          ['fat', 20],
        ],
      ),
      recipe(
        R.soupC,
        'Example soup C',
        ['lunch', 'dinner'],
        [
          ['protein', 150],
          ['green-a', 200],
          ['fat', 30],
        ],
        { oneMealOk: false },
      ),
      recipe(
        R.fishD,
        'Example fish dinner D',
        ['dinner'],
        [
          ['fish', 200],
          ['fat', 60],
        ],
      ),
      recipe(
        R.wheatE,
        'Example wheat dinner E',
        ['dinner'],
        [
          ['wheat', 150],
          ['protein', 150],
          ['fat', 30],
        ],
        { carbStyle: 'balanced' },
      ),
      recipe(
        R.gardenF,
        'Example garden dinner F',
        ['dinner'],
        [
          ['protein', 200],
          ['green-a', 100],
          ['green-b', 100],
          ['fat', 20],
        ],
      ),
      recipe(
        R.packedG,
        'Example packed dinner G',
        ['dinner'],
        [
          ['protein', 200],
          ['packed', 50],
          ['fat', 60],
        ],
      ),
      recipe(R.bigH, 'Example big dinner H', ['dinner'], [['protein', 750]]),
      recipe(
        R.carbI,
        'Example carb dinner I',
        ['dinner'],
        [
          ['protein', 150],
          ['high-carb', 60],
          ['green-a', 100],
          ['green-b', 100],
        ],
        { carbStyle: 'balanced' },
      ),
      recipe(
        R.breakfastJ,
        'Example breakfast J',
        ['breakfast'],
        [
          ['egg', 100],
          ['fat', 10],
        ],
      ),
      recipe(
        R.lunchK,
        'Example lunch K',
        ['lunch'],
        [
          ['protein', 160],
          ['fat', 40],
        ],
      ),
      recipe(
        R.lightM,
        'Example light garden dinner M',
        ['dinner'],
        [
          ['protein', 80],
          ['green-a', 100],
          ['green-b', 100],
        ],
      ),
    ],
    ketoFirstWeek: { dinners: [], snacks: [] },
  };
}

/** Design 6.0's PlanData: the synthetic foods (loaded unless told otherwise) and recipes. */
export function fixturePlanData(options: { readonly loaded?: boolean } = {}): PlanData {
  const loaded = options.loaded ?? true;
  return {
    foods: examplePlanFoodData({ loaded }),
    recipes: examplePlanRecipeData(),
    approved: loaded ? [EXAMPLE_PLAN_SOURCE] : [],
    attributions: ATTRIBUTION,
  };
}

/** A lookup over the fixture data with no owner records. */
export function fixtureLookup(
  options: {
    readonly loaded?: boolean;
    readonly allergens?: readonly ProfileAllergens[number][];
    readonly glutenFreeHousehold?: boolean;
    readonly dislikeTerms?: readonly string[];
    readonly hidden?: readonly SeedId[];
  } = {},
): PlanRecipeLookup {
  return planRecipeLookup(fixturePlanData({ loaded: options.loaded ?? true }), {
    ownRecipes: [],
    ownIngredients: [],
    overrides: [],
    profile: {
      allergens: [...(options.allergens ?? [])],
      dislikeIngredientIds: [],
      dislikeTerms: [...(options.dislikeTerms ?? [])],
      glutenFreeHousehold: options.glutenFreeHousehold ?? false,
    },
    hiddenSeedIds: [...(options.hidden ?? [])],
  });
}

type ProfileAllergens = Parameters<typeof planRecipeLookup>[1]['profile']['allergens'];

/** The stored floor of the examples (the app's default floor; the planner reads it from targets). */
const EXAMPLE_FLOOR = 5000;

/**
 * Design 6.0's exact targets. Kickstart: 9,100 kJ, a 140 g protein check, a 20 g ceiling; Steady:
 * 11,050 kJ, 120 g (range 120–140), the 30 g keto ceiling (or none for balanced). Saturated-fat
 * budget 40 g; floor 5,000 kJ.
 */
export function exampleDayTargets(
  kind: 'kickstart' | 'steady',
  changes: {
    readonly ceilingG?: number | null;
    readonly satFatBudgetG?: number | null;
    readonly energy?: 'target' | 'needs-guide' | 'not-estimated';
    readonly targetKj?: number;
    readonly floorKj?: number;
  } = {},
): DayTargets {
  const kick = kind === 'kickstart';
  const targetKj = changes.targetKj ?? (kick ? 9100 : 11050);
  const floorKj = changes.floorKj ?? EXAMPLE_FLOOR;
  const ceilingG = changes.ceilingG === undefined ? (kick ? 20 : 30) : changes.ceilingG;
  const sat = changes.satFatBudgetG === undefined ? 40 : changes.satFatBudgetG;
  const energyKind = changes.energy ?? 'target';
  return {
    figures: kick ? 'kickstart' : 'steady',
    kickstartSuspended: null,
    estimate: { available: false, reason: 'not-estimated' },
    deficit: { pct: kick ? 30 : 15, basis: kick ? 'kickstart' : 'steady' },
    energy:
      energyKind === 'target'
        ? {
            kind: 'target',
            targetKj,
            estimateKj: targetKj,
            deficit: { pct: kick ? 30 : 15, basis: kick ? 'kickstart' : 'steady' },
            floorKj,
            clampedToFloor: false,
            estimateBelowFloor: false,
          }
        : {
            kind: 'no-estimate',
            reason: energyKind === 'not-estimated' ? 'not-estimated' : 'missing-weight',
            floorKj,
          },
    protein: {
      rangeG: { min: 120, max: 140 },
      checkTargetG: kick ? 140 : 120,
      basis: kick ? 'range-top' : 'range-bottom',
    },
    netCarbs:
      ceilingG === null
        ? { kind: 'none', basis: 'balanced' }
        : { kind: 'ceiling', grams: ceilingG, basis: kick ? 'kickstart' : 'keto' },
    saturatedFat:
      sat === null ? { kind: 'none' } : { kind: 'budget', grams: sat, pct: 10, fromKj: targetKj },
    fibre: { grams: 30, source: 'nrv' },
    water: { ml: 2500, source: 'nrv' },
  };
}

/** A day's context for the pure checks, with the window's slots. */
export function exampleDayContext(
  changes: {
    readonly date?: LocalDate;
    readonly window?: EatingWindow | null;
    readonly targets?: DayTargets;
    readonly plainFigures?: boolean;
    readonly pregnancyNote?: boolean;
    readonly refluxDay?: boolean;
    readonly storedFloorKj?: number;
    readonly today?: LocalDate;
  } = {},
): PlanDayContext {
  const date = changes.date ?? PLAN_TODAY;
  const window = changes.window === undefined ? { start: '17:00', end: '19:00' } : changes.window;
  const slots = planSlotsFor(window);
  const state = planDateState(date, changes.today ?? PLAN_TODAY);
  return {
    date,
    state,
    window,
    slots,
    counted: allowedSlots(slots),
    targets: changes.targets ?? exampleDayTargets('kickstart'),
    display: {
      plainFigures: changes.plainFigures ?? false,
      pregnancyNote: changes.pregnancyNote ?? false,
    },
    storedFloorKj: changes.storedFloorKj ?? EXAMPLE_FLOOR,
    refluxDay: changes.refluxDay ?? false,
  };
}

/** A planned meal: one serve, cooked for one, unless told otherwise. */
export function meal(
  slot: MealSlot,
  id: SeedId,
  myServes = 1,
  householdServes = 1,
): PlannedMealRecord {
  return { slot, recipeId: id, myServes, householdServes };
}
