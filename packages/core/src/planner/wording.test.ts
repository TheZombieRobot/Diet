import { describe, expect, it } from 'vitest';
import { planner as copy } from '../copy/health';
import { mealCheck } from '../fasting/mealCheck';
import * as foods from '../foods';
import * as recipes from '../recipes';
import * as planner from './index';
import { plannedMealsForCheck } from './mealSources';
import { fixtureLookup, meal, R } from './testData';
import { type PlanReasonOptions, planReasonWording } from './wording';

const base: PlanReasonOptions = {
  plainFigures: false,
  pregnancyNote: false,
  snackFits: false,
  stopSignPause: false,
  hasWindow: true,
  where: 'preview',
};

describe('refusal wording (item 22 S17; T25, T26, HS-18, V40, V50)', () => {
  it('owner and preview sentences differ where the table says, and each names its follow-up', () => {
    const owner = { ...base, where: 'owner' as const };
    expect(planReasonWording({ reason: 'past-day' }, owner).key).toBe('planner.refused.pastDay');
    expect(planReasonWording({ reason: 'past-day' }, base).key).toBe('planner.reasons.pastDay');
    expect(planReasonWording({ reason: 'slot', slot: 'snack' }, owner)).toEqual({
      key: 'planner.refused.slot',
      then: 'widen-and-schedule',
    });
    expect(
      planReasonWording({ reason: 'slot', slot: 'snack' }, { ...owner, hasWindow: false }).then,
    ).toBeNull();
    expect(planReasonWording({ reason: 'one-meal-reflux', recipeId: R.dinnerA }, base).then).toBe(
      'reflux-options',
    );
    expect(planReasonWording({ reason: 'energy-not-known', floorKj: 5000 }, base).key).toBe(
      'foods.planner.energyNotKnown',
    );
  });

  it('HS-18, V50: a short single sitting offers the snack only when it fits, else the eating schedule', () => {
    const short = { reason: 'one-meal-short', reasons: ['protein'] } as const;
    expect(planReasonWording(short, { ...base, snackFits: true })).toEqual({
      key: 'planner.reasons.oneMealShort',
      then: 'add-snack',
    });
    expect(planReasonWording(short, base)).toEqual({
      key: 'planner.reasons.oneMealShortNoSnack',
      then: 'schedule',
    });
  });

  it('F20: during a stop-sign pause a reflux refusal offers no window-moving option and links none', () => {
    const refusal = { reason: 'one-meal-reflux', recipeId: R.dinnerA } as const;
    expect(planReasonWording(refusal, { ...base, stopSignPause: true })).toEqual({
      key: 'planner.reasons.oneMealRefluxPause',
      then: null,
    });
    expect(copy.reasons.oneMealRefluxPause).not.toMatch(/snack|split|earlier|window/i);
  });

  it('T25, T26, V40: plain figures name no target or figure except the floor; the pregnancy note only for energy', () => {
    const plain = { ...base, plainFigures: true };
    const pregnancy = { ...base, pregnancyNote: true };
    const cases = [
      { reason: 'energy-not-known-aim', aimKj: 9100 },
      { reason: 'energy-short', aimKj: 9100 },
      { reason: 'protein-not-known', proteinG: 140 },
      { reason: 'protein-short', proteinG: 140 },
      { reason: 'carbs-over', ceilingG: 20 },
      { reason: 'sat-fat-not-known', budgetG: 40 },
    ] as const;
    for (const refusal of cases) {
      expect(planReasonWording(refusal, plain).key).toMatch(/plainNot(?:Known|Filled)$/);
    }
    expect(planReasonWording(cases[1], pregnancy).key).toBe('planner.reasons.plainNotFilled');
    expect(planReasonWording(cases[3], pregnancy).key).toBe('planner.reasons.proteinShort');
    expect(planReasonWording({ reason: 'below-floor', floorKj: 5000 }, plain).key).toBe(
      'targets.plannerFloor.refused',
    );
  });
});

describe('planned meals for item 15’s check (item 22 S13; FL-10, FL-12, FL-13, C23, V51)', () => {
  const lookup = fixtureLookup();
  const run = (
    meals: Parameters<typeof plannedMealsForCheck>[0],
    target: number,
    energy: number | null,
  ) =>
    mealCheck({
      proteinTargetG: target,
      dayEnergyTargetKj: energy,
      planned: plannedMealsForCheck(meals, ['snack', 'dinner'], lookup),
      logged: null,
      windowClosed: false,
      oneMealWindow: false,
    });

  it('FL-12: a dinner of 54 g against 140 g is short; FL-13: 140 g and the energy target met is ok', () => {
    const short = run({ meals: [meal('dinner', R.gardenF)] }, 140, 9100);
    expect(short.kind === 'short-before' && short.reasons).toContain('protein');
    expect(run({ meals: [meal('dinner', R.dinnerA, 2)] }, 140, 9100).kind).toBe('ok');
  });

  it('FL-10: a snack and a dinner short of 120 g are short; no energy target means energy not shown to be met', () => {
    const pair = run({ meals: [meal('snack', R.snackB), meal('dinner', R.dinnerA)] }, 120, 9100);
    expect(pair.kind === 'short-before' && pair.reasons).toContain('protein');
    expect(run({ meals: [meal('dinner', R.dinnerA, 2)] }, 140, null)).toMatchObject({
      reasons: ['energy-unknown'],
    });
  });

  it('a missing recipe, or no datasets, reads "protein unknown", never as no plan; never "at least 0"', () => {
    expect(plannedMealsForCheck({ meals: [] }, ['dinner'], lookup)).toBeNull();
    const none = plannedMealsForCheck(
      { meals: [meal('dinner', R.dinnerA)] },
      ['dinner'],
      fixtureLookup({ loaded: false }),
    );
    expect(none).not.toBeNull();
    const check = mealCheck({
      proteinTargetG: 140,
      dayEnergyTargetKj: 9100,
      planned: none,
      logged: null,
      windowClosed: false,
      oneMealWindow: true,
    });
    expect(check).toMatchObject({
      kind: 'short-before',
      sitting: { unknown: true, dinnerOnly: true },
    });
  });
});

describe('export names (item 22 S15)', () => {
  it('the planner’s exports do not reuse a recipes or foods name', () => {
    const own = Object.keys(planner);
    const others = new Set([...Object.keys(recipes), ...Object.keys(foods)]);
    expect(own.filter((name) => others.has(name))).toEqual([]);
  });
});
