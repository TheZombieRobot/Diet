import type { PlanDayRecord, PlannedMealRecord, RecipeLine } from '@diet/core';
import { exampleOwnFood, listFoodsFixture, SYNTHETIC_PER_100G } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { planNeeds, planSummary } from './aggregate';
import type { DatedMeal, ResolvedRecipe } from './types';

const OWN_AVOCADO = '00000000-0000-4000-8000-000000000a01';
const foods = listFoodsFixture({
  own: [exampleOwnFood(OWN_AVOCADO, 'Avocado', SYNTHETIC_PER_100G)],
});
const line = (ingredientId: string, rawG: number, cookedG: number | null = null): RecipeLine => ({
  ingredientId,
  rawG,
  cookedG,
  displayAs: null,
});
let titles = 0;
const recipe = (serves: number, lines: RecipeLine[]): ResolvedRecipe => ({
  title: `Example recipe ${String((titles += 1))}`,
  serves,
  lines,
  seedLines: null,
});
const meal = (
  date: string,
  recipeId: string,
  serves: Partial<PlannedMealRecord> = {},
): DatedMeal => ({
  date,
  meal: { slot: 'dinner', recipeId, myServes: 1, householdServes: 1, ...serves },
});

describe('planNeeds (LU1; GL-01, NN-04, HS-23)', () => {
  const recipes: Record<string, ResolvedRecipe> = {
    a: recipe(1, [line('seed:avocado', 200)]),
    b: recipe(1, [line('seed:avocado', 200), line('seed:example-gone', 50)]),
    four: recipe(4, [line('seed:lemon', 400)]),
    cooked: recipe(1, [
      line('seed:beef-mince-lean', 500, 380),
      line('seed:brown-rice-cooked', 300),
    ]),
    own: recipe(1, [line(OWN_AVOCADO, 100), line('seed:avocado', 100)]),
  };
  const recipeOf = (id: string) => recipes[id] ?? null;

  it('GL-01: the same food from two recipes on two days is one need, summed, with both sources', () => {
    const { needs } = planNeeds(
      [meal('2000-01-10', 'a'), meal('2000-01-11', 'b')],
      recipeOf,
      foods,
    );
    expect(needs[0]).toMatchObject({ kind: 'grams', ingredientId: 'seed:avocado', grams: 400 });
    expect(needs[0]?.sources).toHaveLength(2);
    expect(needs[1]).toMatchObject({ kind: 'unknown-food', ingredientId: 'seed:example-gone' });
  });

  it('serves cooked are the larger of household and own serves; a leftover line is bought', () => {
    const grams = (m: DatedMeal) => planNeeds([m], recipeOf, foods).needs[0]?.grams;
    expect(grams(meal('2000-01-10', 'four', { householdServes: 3, myServes: 1 }))).toBe(300);
    expect(grams(meal('2000-01-10', 'four', { householdServes: 1, myServes: 1.5 }))).toBe(150);
    expect(grams(meal('2000-01-10', 'four', { householdServes: 2, myServes: 0 }))).toBe(200);
  });

  it('NN-04: raw grams only; a cooked-form line is kept apart under its raw food', () => {
    const { needs } = planNeeds([meal('2000-01-10', 'cooked')], recipeOf, foods);
    expect(needs[0]).toMatchObject({
      kind: 'grams',
      ingredientId: 'seed:beef-mince-lean',
      grams: 500,
    });
    expect(needs[1]).toMatchObject({ kind: 'cooked', ingredientId: 'seed:brown-rice', grams: 300 });
  });

  it('an own food and a seed of the same name stay two needs; a missing recipe is skipped', () => {
    const result = planNeeds(
      [meal('2000-01-10', 'own'), meal('2000-01-10', 'gone')],
      recipeOf,
      foods,
    );
    expect(result.needs.map((n) => n.ingredientId)).toEqual([OWN_AVOCADO, 'seed:avocado']);
    expect(result).toMatchObject({ mealCount: 1, skippedMeals: 1 });
  });
});

describe('planSummary (LU1; J46, HS-18)', () => {
  const day = (date: string, row: Partial<PlanDayRecord>): PlanDayRecord => ({
    date,
    dietMode: 'balanced',
    meals: [],
    eatingWindow: null,
    updatedAt: '2000-01-01T00:00:00.000Z',
    ...row,
  });
  const dinner: PlannedMealRecord = {
    slot: 'dinner',
    recipeId: 'a',
    myServes: 1,
    householdServes: 1,
  };

  it('counts meals, days, unreadable meals and 5 pm windows with no snack meal', () => {
    const rows = [
      day('2000-01-10', { meals: [dinner, { ...dinner, recipeId: 'gone' }] }),
      day('2000-01-11', { eatingWindow: { start: '17:00', end: '20:00' } }),
      day('2000-01-12', {
        meals: [{ ...dinner, slot: 'snack' }],
        eatingWindow: { start: '17:00', end: '20:00' },
      }),
      day('2000-01-13', { eatingWindow: { start: '17:00', end: '18:00' } }),
    ];
    expect(planSummary(rows, (id) => id === 'a')).toEqual({
      meals: 3,
      days: 2,
      unreadable: 1,
      snackDays: 1,
    });
  });
});
