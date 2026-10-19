/**
 * Synthetic records for the item 21 screen and repository tests: the design's male and female
 * fixtures on item 14's weight scenarios, food entries and drinks. Imported only by tests; nothing
 * here describes anyone.
 */
import {
  type Confidence,
  type DrinkLogRecord,
  type FoodLogRecord,
  type Nutrients,
  type NutrientKey,
  type Snapshot,
} from '@diet/core';
import {
  fixtureId,
  onDay,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { openSnapshotDb, type TestDb } from '../../db/testKit';

const ZONE = 'Pacific/Auckland';

/**
 * Male, 185 cm, born 1969, a physically active job, keto, 100 kg every day, a Kickstart from day 1
 * (WT-07: a 14,516 kJ rough guide, 10,162 kJ with the 30% Kickstart deficit, a 27 g budget).
 */
export const MALE: WeightScenarioOptions = {
  ...WEIGHT_SCENARIOS.K10,
  ratesKgPerWeek: [0],
  heightCm: 185,
  goalKg: null,
  profile: { sex: 'male', birthYear: 1969, activityLevel: 'active-job' },
};

/** Female, 160 cm, born 1929, mostly sitting, 55 kg, a Kickstart (WT-06: a 5,217 kJ guide, the 5,000 floor). */
export const FEMALE: WeightScenarioOptions = {
  ...MALE,
  startKg: 55,
  heightCm: 160,
  profile: { sex: 'female', birthYear: 1929, activityLevel: 'sedentary' },
};

/** The male fixture with no Kickstart. */
export const MALE_STEADY: WeightScenarioOptions = { ...MALE, periods: [] };

const zero: Nutrients = {
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
};

let nextId = 40_000;

/** A food_log row on scenario day 10 at `time` local. */
export function foodEntry(
  time: string,
  name: string,
  nutrients: Partial<Nutrients>,
  options: { confidence?: Confidence; unknown?: NutrientKey[] } = {},
): FoodLogRecord {
  const confidence = options.confidence ?? 'estimate';
  // The source kind each badge needs (storage spec 4.7): a label, a recipe, or an estimate.
  const sourceKind =
    confidence === 'label' ? 'label' : confidence === 'database' ? 'recipe' : 'estimate';
  return {
    id: fixtureId(nextId++),
    at: new Date(`2000-02-10T${time}:00+13:00`).toISOString(),
    timeZone: ZONE,
    sourceKind,
    refId: sourceKind === 'estimate' ? null : fixtureId(nextId++),
    name,
    grams: 100,
    weightBasis: 'raw',
    servings: null,
    nutrients: { ...zero, ...nutrients },
    unknownNutrients: options.unknown ?? [],
    confidence,
  };
}

/** A drinks_log row at `at`: a 330 mL 5% premix with 94 kcal on the label, or no label (energy unknown). */
export function drink(at: string, count: number, kcal: number | null = 94): DrinkLogRecord {
  return {
    id: fixtureId(nextId++),
    at,
    timeZone: ZONE,
    beverageId: null,
    name: 'Example premix',
    count,
    beverage: {
      volumeMl: 330,
      abvPercent: 5,
      label:
        kcal === null
          ? null
          : {
              volumeMl: 330,
              abvPercent: 5,
              standardDrinks: null,
              kcal,
              energyAsEntered: { value: kcal, unit: 'kcal' },
              origin: 'owner',
            },
    },
    stdDrinksPerServe: 1.3,
    stdSource: 'calculated',
    kcalPerServe: kcal,
  };
}

export interface TargetsSeed {
  readonly food?: readonly FoodLogRecord[];
  readonly drinks?: readonly DrinkLogRecord[];
  /** Local time on day 10 (default 09:00). */
  readonly time?: string;
}

/** A test database holding the scenario on its day 10, with any food and drinks. */
export async function seedTargets(
  options: WeightScenarioOptions,
  seed: TargetsSeed = {},
): Promise<TestDb> {
  const seen = onDay(options, 10, seed.time ?? '09:00');
  const snapshot: Snapshot = {
    ...weightScenario(seen),
    food_log: [...(seed.food ?? [])],
    drinks_log: [...(seed.drinks ?? [])],
  };
  return openSnapshotDb(snapshot, seen.now);
}
