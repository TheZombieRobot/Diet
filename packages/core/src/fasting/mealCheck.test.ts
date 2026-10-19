import { describe, expect, it } from 'vitest';
import type { FoodLogRecord, PlannedMealRecord, RecipeRecord } from '../storage/records';
import type { Nutrients } from '../nutrition/nutrients';
import {
  loggedIntakeOn,
  type LoggedIntake,
  mealCheck,
  type MealCheckInput,
  type PlannedMealFigures,
  plannedMealFigures,
  plannedMealsOf,
  proteinDenseCookedGrams,
} from './mealCheck';

const NZ = 'Pacific/Auckland';
const meal = (
  slot: PlannedMealFigures['slot'],
  proteinG: number,
  more: Partial<PlannedMealFigures> = {},
): PlannedMealFigures => ({
  slot,
  proteinG,
  proteinKnown: true,
  foodEnergyKj: 9_500,
  proteinFoodCookedG: 450,
  incomplete: false,
  ...more,
});
const logged = (more: Partial<LoggedIntake> = {}): LoggedIntake => ({
  proteinG: 0,
  foodEnergyKj: 0,
  loggedSlots: [],
  otherEntries: 0,
  incomplete: false,
  ...more,
});
const check = (more: Partial<MealCheckInput>) =>
  mealCheck({
    proteinTargetG: 140,
    dayEnergyTargetKj: 9_100,
    planned: null,
    logged: null,
    windowClosed: false,
    oneMealWindow: true,
    ...more,
  });

describe('the single-meal check (FL-12, FL-13, HS-18, C64)', () => {
  it('FL-12: a 95 g dinner against 140 g is short on protein; the headline says 95 g', () => {
    expect(check({ planned: [meal('dinner', 95)] })).toEqual({
      kind: 'short-before',
      reasons: ['protein'],
      sitting: { proteinG: 95, atLeast: false, unknown: false, dinnerOnly: true },
      energyChecked: true,
    });
  });

  it('FL-13: a 140 g dinner at the energy target and under 600 g of protein food passes', () => {
    const result = check({ planned: [meal('dinner', 140, { foodEnergyKj: 9_100 })] });
    expect(result).toEqual({
      kind: 'ok',
      sitting: { proteinG: 140, atLeast: false, unknown: false, dinnerOnly: true },
      energyChecked: true,
    });
  });

  it.each([
    [139, 'short-before'],
    [139.6, 'short-before'],
    [140, 'ok'],
    [141, 'ok'],
  ])('C64: %d g is %s (strict, no tolerance; shown rounded down)', (protein, kind) => {
    const result = check({ planned: [meal('dinner', protein)] });
    expect(result.kind).toBe(kind);
    if (protein === 139.6 && result.kind === 'short-before')
      expect(result.sitting?.proteinG).toBe(139);
  });

  it("C10: a dinner with enough protein but under the day's energy target is short on energy", () => {
    expect(check({ planned: [meal('dinner', 140, { foodEnergyKj: 5_200 })] })).toMatchObject({
      kind: 'short-before',
      reasons: ['energy'],
    });
  });

  it('with no energy target, energy is not shown to be met: the check never passes (item 21)', () => {
    const noTarget = { dayEnergyTargetKj: null };
    expect(check({ ...noTarget, planned: [meal('dinner', 95)] })).toMatchObject({
      kind: 'short-before',
      reasons: ['protein', 'energy-unknown'],
      energyChecked: false,
    });
    expect(
      check({ ...noTarget, planned: [meal('dinner', 160, { foodEnergyKj: 20_000 })] }),
    ).toMatchObject({
      kind: 'short-before',
      reasons: ['energy-unknown'],
    });
    expect(
      check({
        ...noTarget,
        windowClosed: true,
        logged: logged({ proteinG: 160, foodEnergyKj: 20_000 }),
      }),
    ).toEqual({ kind: 'short-after', reasons: ['energy-unknown'], energyChecked: false });
  });

  it.each([
    [650, ['portion']],
    [600, []],
    [601, ['portion']],
  ])('C29: %d g of protein food in one sitting', (grams, reasons) => {
    const result = check({ planned: [meal('dinner', 140, { proteinFoodCookedG: grams })] });
    expect(result.kind === 'short-before' ? result.reasons : []).toEqual(reasons);
  });

  it('a one-meal window makes every planned meal one sitting: the headline and the 600 g test use the sum', () => {
    const result = check({
      planned: [
        meal('meal1', 50, { proteinFoodCookedG: 300 }),
        meal('dinner', 95, { proteinFoodCookedG: 400 }),
      ],
    });
    expect(result).toMatchObject({
      kind: 'short-before',
      reasons: ['portion'],
      sitting: { proteinG: 145, dinnerOnly: false },
    });
  });

  it('FL-10: a 22:2 day of snack 30 g and dinner 70 g under a 120 g target is short, with no headline', () => {
    expect(
      check({
        proteinTargetG: 120,
        oneMealWindow: false,
        planned: [meal('snack', 30), meal('dinner', 70)],
      }),
    ).toEqual({ kind: 'short-before', reasons: ['protein'], sitting: null, energyChecked: true });
  });

  it('lower bounds are compared as they are and shown "at least"; a missing recipe is "protein unknown"', () => {
    expect(check({ planned: [meal('dinner', 150, { incomplete: true })] })).toMatchObject({
      kind: 'ok',
      sitting: { proteinG: 150, atLeast: true },
    });
    expect(check({ planned: [meal('dinner', 100, { incomplete: true })] }).kind).toBe(
      'short-before',
    );
    const missing = plannedMealFigures(
      { slot: 'dinner', recipeId: 'gone', myServes: 1, householdServes: 1 },
      null,
      () => null,
    );
    expect(check({ planned: [missing] })).toMatchObject({
      kind: 'short-before',
      reasons: ['protein', 'energy'],
      sitting: { proteinG: 0, atLeast: true, unknown: true },
    });
  });
});

describe('the widen-window prompt with logged food (C62, C11)', () => {
  it('23:1 at 10 am with an adequate plan and nothing logged passes', () => {
    expect(check({ planned: [meal('dinner', 150)], logged: logged() }).kind).toBe('ok');
  });

  it('16:8 at 3 pm: lunch logged from the plan at 40 g plus dinner planned at 60 g is short of 120 g', () => {
    const result = check({
      proteinTargetG: 120,
      oneMealWindow: false,
      planned: [meal('lunch', 60), meal('dinner', 60)],
      logged: logged({ proteinG: 40, foodEnergyKj: 4_000, loggedSlots: ['lunch'] }),
    });
    expect(result).toMatchObject({ kind: 'short-before', reasons: ['protein'] });
  });

  it('a lunch logged from a label takes the place of the planned lunch: 20 + 80 = 100 g is short', () => {
    const result = check({
      proteinTargetG: 120,
      oneMealWindow: false,
      planned: [meal('lunch', 60), meal('dinner', 80)],
      logged: logged({ proteinG: 20, foodEnergyKj: 6_000, otherEntries: 1 }),
    });
    expect(result).toMatchObject({ kind: 'short-before', reasons: ['protein'] });
  });

  it('extra food logged does not hide a plan that is short on its own (both views must pass)', () => {
    const result = check({
      planned: [meal('dinner', 120)],
      logged: logged({ proteinG: 30, foodEnergyKj: 1_000, loggedSlots: ['snack'] }),
    });
    expect(result).toMatchObject({ kind: 'short-before', reasons: ['protein'] });
  });

  it('after the window, the logged food alone is compared; without a log nothing is checked', () => {
    const short = logged({ proteinG: 95, foodEnergyKj: 9_500, loggedSlots: ['dinner'] });
    expect(check({ windowClosed: true, planned: [meal('dinner', 140)], logged: short })).toEqual({
      kind: 'short-after',
      reasons: ['protein'],
      energyChecked: true,
    });
    expect(check({ windowClosed: true, logged: short }).kind).toBe('short-after');
    expect(check({ windowClosed: true, planned: [meal('dinner', 140)] }).kind).toBe('unavailable');
  });

  it('with no plan nothing is checked before the window closes; with neither, nothing at all', () => {
    expect(check({ logged: logged({ proteinG: 10 }) }).kind).toBe('unavailable');
    expect(check({}).kind).toBe('unavailable');
  });

  it('is strict: it passes exactly when every figure meets its threshold (property)', () => {
    let seed = 11;
    const next = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    for (let i = 0; i < 400; i++) {
      const protein = 100 + next(80);
      const energy = 7_000 + next(4_000);
      const grams = 500 + next(200);
      const result = check({
        planned: [meal('dinner', protein, { foodEnergyKj: energy, proteinFoodCookedG: grams })],
      });
      const meets = protein >= 140 && energy >= 9_100 && grams <= 600;
      expect(result.kind, JSON.stringify({ protein, energy, grams })).toBe(
        meets ? 'ok' : 'short-before',
      );
    }
  });
});

describe('figures for the check (items 22 and 23 feed these)', () => {
  const nutrients = (proteinG: number, energyKj = 0): Nutrients => ({
    energyKj,
    proteinG,
    fatG: 0,
    saturatedFatG: 0,
    carbsG: 0,
    sugarsG: 0,
    fibreG: 0,
    sodiumMg: 0,
  });
  const ingredient = (protein: number, more: Record<string, unknown> = {}) => ({
    nutrientsPer100g: nutrients(protein),
    unknownNutrients: [],
    cookedYield: null,
    yieldCitation: null,
    ...more,
  });
  const line = (ingredientId: string, rawG: number, cookedG: number | null = null) => ({
    ingredientId,
    rawG,
    cookedG,
    displayAs: null,
  });

  it('counts protein-dense ingredients by cooked weight, scaled to the owner serves', () => {
    const pantry: Record<string, ReturnType<typeof ingredient>> = {
      chicken: ingredient(31),
      ten: ingredient(10),
      under: ingredient(9.9),
      unknown: ingredient(0, { unknownNutrients: ['proteinG'] }),
      lentils: ingredient(24, { cookedYield: 2.5, yieldCitation: 'synthetic yield reference' }),
      uncited: ingredient(24, { cookedYield: 2.5 }),
    };
    const grams = (lines: ReturnType<typeof line>[], myServes = 1, serves = 1) =>
      proteinDenseCookedGrams({ serves, lines }, myServes, (id) => pantry[id] ?? null);
    expect(grams([line('chicken', 300, 220)])).toBe(220);
    expect(grams([line('chicken', 300)])).toBe(300); // no cooked weight: raw
    expect(grams([line('ten', 100), line('under', 100)])).toBe(100);
    expect(grams([line('unknown', 50), line('missing', 70)])).toBe(120);
    expect(grams([line('lentils', 200)])).toBe(500);
    expect(grams([line('uncited', 200)])).toBe(200);
    expect(grams([line('chicken', 600, 400)], 1, 4)).toBe(100);
  });

  it('a planned meal uses the owner serves only, and marks unknown protein as a lower bound', () => {
    const recipe = {
      serves: 4,
      lines: [],
      nutritionPerServe: nutrients(40, 2_000),
      unknownNutrients: ['energyKj'],
    } as unknown as RecipeRecord;
    const planned: PlannedMealRecord = {
      slot: 'dinner',
      recipeId: 'r',
      myServes: 1.5,
      householdServes: 4,
    };
    expect(plannedMealFigures(planned, recipe, () => null)).toEqual({
      slot: 'dinner',
      proteinG: 60,
      proteinKnown: true,
      foodEnergyKj: 3_000,
      proteinFoodCookedG: 0,
      incomplete: true,
    });
  });

  it('a row that only holds a per-day window is not a plan', () => {
    expect(plannedMealsOf({ meals: [] })).toBeNull();
    expect(plannedMealsOf(undefined)).toBeNull();
  });

  it('the food log for a date: each row in its own zone, plan slots from refId, other entries, lower bounds', () => {
    const row = (at: string, more: Partial<FoodLogRecord>): FoodLogRecord => ({
      id: at,
      at,
      timeZone: NZ,
      sourceKind: 'label',
      refId: null,
      name: 'synthetic',
      grams: null,
      weightBasis: null,
      servings: null,
      nutrients: nutrients(20, 1_000),
      unknownNutrients: [],
      confidence: 'label',
      ...more,
    });
    const rows = [
      row('2000-01-04T00:00:00.000Z', { sourceKind: 'plan', refId: '2000-01-04#lunch' }),
      row('2000-01-04T05:00:00.000Z', { unknownNutrients: ['proteinG'] }),
      row('2000-01-03T10:30:00.000Z', {}), // 23:30 on the 3rd in Auckland
      row('2000-01-03T12:00:00.000Z', { timeZone: 'Europe/London' }), // noon on the 3rd in London
    ];
    expect(loggedIntakeOn('2000-01-04', rows, NZ)).toEqual({
      proteinG: 40,
      foodEnergyKj: 2_000,
      loggedSlots: ['lunch'],
      otherEntries: 1,
      incomplete: true,
    });
  });
});
