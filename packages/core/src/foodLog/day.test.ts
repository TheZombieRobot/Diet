import { describe, expect, it } from 'vitest';
import { mealCheck, type LoggedIntake } from '../fasting/mealCheck';
import { NUTRIENT_KEYS, type Nutrients } from '../nutrition/nutrients';
import type { FoodLogRecord, PlanDayRecord } from '../storage/records';
import { validateRow } from '../storage/validate';
import { LOG_GRAMS_MAX, WATER_ENTRY_ML } from './constants';
import {
  energyForChecks,
  loggedIntakeForMealCheck,
  logDay,
  planMealsToLog,
  planRowRebuildable,
  sameRecipeLogged,
} from './day';
import { parseWaterMl, waterGuideView, waterRowsOn } from './water';

const AKL = 'Pacific/Auckland';
const DATE = '2026-10-18';
const n = (patch: Partial<Nutrients>): Nutrients => ({
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
  ...patch,
});
let next = 0;
const row = (patch: Partial<FoodLogRecord>): FoodLogRecord => {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-${next.toString(16).padStart(12, '0')}`,
    at: '2026-10-18T06:00:00.000Z', // 7 pm in Auckland.
    timeZone: AKL,
    sourceKind: 'plan',
    refId: `${DATE}#dinner`,
    name: 'Example traybake',
    grams: null,
    weightBasis: null,
    servings: 1,
    nutrients: n({ energyKj: 4000, proteinG: 95 }),
    unknownNutrients: [],
    confidence: 'database',
    ...patch,
  };
};
const allUnknown = {
  nutrients: n({}),
  unknownNutrients: [...NUTRIENT_KEYS],
  confidence: 'estimate' as const,
};
const plan = (meals: PlanDayRecord['meals']): Pick<PlanDayRecord, 'date' | 'meals'> => ({
  date: DATE,
  meals,
});
const TRAYBAKE = 'seed:recipe-example-traybake';
const SOUP = 'seed:recipe-example-soup';

describe('logDay (HS-R18, C11)', () => {
  it('U14: rows by their own zone; unknown keys; no figures only when no entry shows one', () => {
    const late = row({ at: '2026-10-18T10:30:00.000Z' }); // 23:30 in Auckland on the 18th.
    const otherDay = row({ at: '2026-10-18T11:30:00.000Z' }); // 00:30 on the 19th.
    const lacking = row({ unknownNutrients: ['proteinG'], nutrients: n({ proteinG: 30 }) });
    const day = logDay([late, otherDay, lacking], [], DATE, AKL);
    expect(day.entries.map((e) => e.id)).toEqual([lacking.id, late.id]);
    expect(day.unknownKeys).toEqual(['proteinG']);
    expect(day.noneKnown).toBe(false);
    expect(logDay([row(allUnknown)], [], DATE, AKL).noneKnown).toBe(true);
    // All eight listed, but lower bounds above 0: "at least" figures, so not "no figures" (H20b).
    const atLeast = row({ ...allUnknown, nutrients: n({ proteinG: 12, energyKj: 900 }) });
    expect(logDay([atLeast], [], DATE, AKL).noneKnown).toBe(false);
  });

  it('U15* C11: drinks never reach the food figures, and the meal check takes no drinks', () => {
    const label = row({
      sourceKind: 'label',
      refId: 'seed:example',
      grams: 150,
      weightBasis: 'as-sold',
      confidence: 'label',
      nutrients: n({ energyKj: 600, proteinG: 15, fatG: 6, carbsG: 7.5 }),
    });
    const can = { kcalPerServe: 94, count: 6, beverage: { volumeMl: 330, abvPercent: 5 } };
    const day = logDay([label], [can], DATE, AKL);
    expect(day.intake.food).toEqual(label.nutrients);
    expect(day.intake.alcohol.knownKj).toBe(2360);
    expect(loggedIntakeForMealCheck([label], DATE, AKL).foodEnergyKj).toBe(600);
  });
});

describe('a planned meal counts once (design 2.5)', () => {
  it('U16: plan rows, same-recipe rows, re-planned slots', () => {
    const day = plan([
      { slot: 'lunch', recipeId: TRAYBAKE, myServes: 1, householdServes: 2 },
      { slot: 'breakfast', recipeId: SOUP, myServes: 0, householdServes: 2 },
      { slot: 'dinner', recipeId: TRAYBAKE, myServes: 1, householdServes: 3 },
    ]);
    expect(planMealsToLog(day, [], DATE, AKL).map((m) => [m.slot, m.logged])).toEqual([
      ['lunch', null],
      ['dinner', null],
    ]);
    // One recipe row covers one slot: lunch only.
    const recipeRow = row({ sourceKind: 'recipe', refId: TRAYBAKE });
    expect(planMealsToLog(day, [recipeRow], DATE, AKL).map((m) => m.logged?.by ?? null)).toEqual([
      'recipe',
      null,
    ]);
    // A plan row of another date is not this day's.
    const elsewhere = row({ refId: '2026-10-17#dinner', at: '2026-10-17T06:00:00.000Z' });
    expect(planMealsToLog(day, [elsewhere], DATE, AKL).every((m) => m.logged === null)).toBe(true);
    const planRow = row({ name: 'Example old title' });
    expect(planMealsToLog(day, [planRow], DATE, AKL)[1]?.logged).toEqual({
      by: 'plan',
      entryId: planRow.id,
      name: 'Example old title',
    });
    expect(sameRecipeLogged([planRow], day, DATE, TRAYBAKE, AKL)?.id).toBe(planRow.id);
    expect(sameRecipeLogged([recipeRow], day, DATE, TRAYBAKE, AKL)?.id).toBe(recipeRow.id);
    expect(sameRecipeLogged([planRow], day, DATE, SOUP, AKL)).toBeNull();
    const titles = (id: string) => (id === TRAYBAKE ? 'Example traybake' : 'Example soup');
    expect(planRowRebuildable(row({}), day, titles)).toEqual({ recipeId: TRAYBAKE });
    const replanned = plan([{ slot: 'dinner', recipeId: SOUP, myServes: 1, householdServes: 1 }]);
    expect(planRowRebuildable(row({}), replanned, titles)).toBeNull();
  });

  it('U17*: the meal check reads one row per planned slot, and an empty date as nothing logged', () => {
    expect(loggedIntakeForMealCheck([], DATE, AKL)).toMatchObject({ empty: true, proteinG: 0 });
    const dinner = row({});
    const restored = row({ at: '2026-10-18T06:30:00.000Z' });
    const once = loggedIntakeForMealCheck([dinner, restored], DATE, AKL);
    expect(once).toMatchObject({ loggedSlots: ['dinner'], proteinG: 95, empty: false });
    expect(
      mealCheck({
        proteinTargetG: 140,
        dayEnergyTargetKj: 3000,
        planned: null,
        logged: once,
        windowClosed: true,
        oneMealWindow: true,
      }),
    ).toEqual({ kind: 'short-after', reasons: ['protein'], energyChecked: true });
    const lacking = row({
      sourceKind: 'label',
      refId: 'seed:x',
      grams: 100,
      weightBasis: 'raw',
      confidence: 'label',
      unknownNutrients: ['fibreG'],
      nutrients: n({ proteinG: 30 }),
    });
    expect(loggedIntakeForMealCheck([lacking], DATE, AKL)).toMatchObject({
      otherEntries: 1,
      proteinG: 30,
    });
    const unknownProtein = row({
      sourceKind: 'recipe',
      refId: SOUP,
      unknownNutrients: ['proteinG'],
      nutrients: n({ proteinG: 10, energyKj: 500 }),
    });
    expect(loggedIntakeForMealCheck([unknownProtein], DATE, AKL)).toMatchObject({
      incomplete: true,
      proteinG: 10,
    });
  });

  it('U18* C11: alcohol energy typed on a label never meets an energy check', () => {
    // A beer label, 990 g: stored 1,683 kJ; its protein and carbohydrate give 555 kJ.
    const beer = row({
      sourceKind: 'label',
      refId: 'seed:x',
      name: 'Example Steinlager',
      grams: 990,
      weightBasis: 'as-sold',
      confidence: 'label',
      nutrients: n({ energyKj: 1683, carbsG: 29.7, proteinG: 2.97 }),
    });
    expect(energyForChecks(beer)).toBeCloseTo(555.39, 1);
    const dinner = row({ nutrients: n({ proteinG: 150, energyKj: 7800 }) });
    const check = (rows: FoodLogRecord[]) =>
      mealCheck({
        proteinTargetG: 140,
        dayEnergyTargetKj: 9100,
        planned: null,
        logged: loggedIntakeForMealCheck(rows, DATE, AKL),
        windowClosed: true,
        oneMealWindow: true,
      });
    expect(check([dinner, beer])).toEqual({
      kind: 'short-after',
      reasons: ['energy'],
      energyChecked: true,
    });
    // A recipe or plan row is never capped.
    expect(energyForChecks(dinner)).toBe(7800);
  });

  it('U24: after the window an empty log is nothing logged; before the window it reads as no log', () => {
    const empty: LoggedIntake = {
      proteinG: 0,
      foodEnergyKj: 0,
      loggedSlots: [],
      otherEntries: 0,
      incomplete: false,
      empty: true,
    };
    const base = {
      proteinTargetG: 140,
      dayEnergyTargetKj: null,
      planned: null,
      oneMealWindow: true,
    };
    expect(mealCheck({ ...base, logged: empty, windowClosed: true })).toEqual({
      kind: 'nothing-logged',
      energyChecked: false,
    });
    expect(mealCheck({ ...base, logged: empty, windowClosed: false })).toEqual(
      mealCheck({ ...base, logged: null, windowClosed: false }),
    );
  });
});

describe('water (ruling 12; T25, T26)', () => {
  it('U20: whole millilitres from 1 to 3,000; the guide hidden under plain figures and the pregnancy note', () => {
    expect(['', '0', '1', '3000', '3001', '250.5', '2,5'].map((t) => parseWaterMl(t))).toEqual([
      { ok: false, problem: 'required' },
      { ok: false, problem: 'range' },
      { ok: true, ml: 1 },
      { ok: true, ml: 3000 },
      { ok: false, problem: 'range' },
      { ok: false, problem: 'not-number' },
      { ok: false, problem: 'not-number' },
    ]);
    const nrv = { ml: 2600, source: 'nrv' as const };
    const plain = { plainFigures: false, pregnancyNote: false };
    expect(waterGuideView(nrv, 500, plain)).toEqual({
      guide: { totalMl: 3100, baseMl: 2600, heatExtraMl: 500 },
      pregnancyLine: false,
    });
    expect(waterGuideView(nrv, 0, { ...plain, plainFigures: true })).toEqual({
      guide: null,
      pregnancyLine: false,
    });
    expect(waterGuideView(nrv, 500, { ...plain, pregnancyNote: true })).toEqual({
      guide: null,
      pregnancyLine: true,
    });
    expect(
      waterGuideView({ ml: 3000, source: 'owner' }, 0, { ...plain, pregnancyNote: true }),
    ).toEqual({ guide: { totalMl: 3000, baseMl: 3000, heatExtraMl: 0 }, pregnancyLine: false });
    expect(() => waterGuideView(nrv, -1, plain)).toThrow(RangeError);
    const sydney = { at: '2026-10-17T13:30:00.000Z', timeZone: 'Australia/Sydney' }; // 00:30 on the 18th.
    expect(waterRowsOn([sydney], DATE, AKL)).toEqual([sydney]);
  });

  it('U22: the entry limits are the validators’ bounds', () => {
    const water = (ml: number) => ({
      id: '00000000-0000-4000-8000-000000000001',
      at: '2026-10-18T06:00:00.000Z',
      timeZone: AKL,
      ml,
      electrolyte: false,
    });
    expect(() => validateRow('water_log', water(WATER_ENTRY_ML.max))).not.toThrow();
    expect(() => validateRow('water_log', water(WATER_ENTRY_ML.max + 1))).toThrow();
    const label = row({
      sourceKind: 'label',
      refId: 'seed:x',
      weightBasis: 'raw',
      confidence: 'label',
      nutrients: n({}),
    });
    expect(() => validateRow('food_log', { ...label, grams: LOG_GRAMS_MAX })).not.toThrow();
    expect(() => validateRow('food_log', { ...label, grams: LOG_GRAMS_MAX + 0.1 })).toThrow();
  });
});
