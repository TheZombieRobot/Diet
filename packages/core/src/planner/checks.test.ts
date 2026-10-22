import { describe, expect, it } from 'vitest';
import { mealCheck, type PlannedMealFigures } from '../fasting/mealCheck';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import type { MealSlot, NutrientKey, PlannedMealRecord } from '../storage/records';
import { energyForMealChecks } from '../targets/energy';
import { appDayCheck, ownerDayFloorNote, planDayDisplay } from './checks';
import { countedDay, type CountedDay, planDayFigures, type PlanMealFigures } from './figures';
import { plannedMealsForCheck } from './mealSources';
import { allowedSlots, planSlotsFor } from './slots';
import { exampleDayContext, exampleDayTargets, fixtureLookup, meal, R } from './testData';

interface Part {
  readonly slot?: MealSlot;
  readonly kj: number;
  readonly protein: number;
  readonly carbs?: number;
  readonly sat?: number;
  readonly unknown?: readonly NutrientKey[];
  readonly foodG?: number;
  readonly myServes?: number;
  readonly recipeId?: string;
}

/** A counted day built straight from figures, for the boundaries. */
function day(parts: readonly Part[]): CountedDay {
  const counted: PlannedMealRecord[] = parts.map((p, i) => ({
    slot: p.slot ?? (i === parts.length - 1 ? 'dinner' : 'snack'),
    recipeId: p.recipeId ?? `seed:recipe-x${i}`,
    myServes: p.myServes ?? 1,
    householdServes: 1,
  }));
  const meals: PlanMealFigures[] = parts.map((p, i) => ({
    ...(counted[i] as PlannedMealRecord),
    nutrients: {
      ...(Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<NutrientKey, number>),
      energyKj: p.kj,
      proteinG: p.protein,
      carbsG: p.carbs ?? 0,
      saturatedFatG: p.sat ?? 0,
    },
    unknownNutrients: p.unknown ?? [],
    recipeFound: true,
  }));
  const sitting: PlannedMealFigures[] = parts.map((p, i) => ({
    slot: (counted[i] as PlannedMealRecord).slot,
    proteinG: p.protein,
    proteinKnown: !(p.unknown ?? []).includes('proteinG') || p.protein > 0,
    foodEnergyKj: p.kj,
    proteinFoodCookedG: p.foodG ?? 0,
    incomplete: (p.unknown ?? []).some((k) => k === 'proteinG' || k === 'energyKj'),
  }));
  return { counted, outside: [], figures: planDayFigures(meals), sitting };
}

const twoMeals = exampleDayContext(); // 22:2, Kickstart: aim 9,100 kJ, 140 g, ceiling 20 g
const oneMeal = exampleDayContext({ window: { start: '18:00', end: '19:00' } });
const always = () => true;
const check = (d: CountedDay, ctx = twoMeals, kind: 'auto-fill' | 'copy' = 'auto-fill') =>
  appDayCheck({ day: d, ctx, kind, oneMealOk: always });

describe('app-made days (item 22 S6; HS-10, NU-06, HS-25, HS-R18, C10, C29, P43, V39, V44)', () => {
  it('NU-06: a complete 4,999 kJ day is refused below the 5,000 kJ floor, for auto-fill and copy', () => {
    const d = day([
      { kj: 2000, protein: 70 },
      { kj: 2999, protein: 70 },
    ]);
    for (const kind of ['auto-fill', 'copy'] as const) {
      expect(check(d, twoMeals, kind)).toMatchObject({
        ok: false,
        reason: 'below-floor',
        floorKj: 5000,
      });
    }
    // An unbuilt kind called directly is refused by item 21's floorCheck too.
    expect(
      appDayCheck({ day: d, ctx: twoMeals, kind: 'template', oneMealOk: always }),
    ).toMatchObject({ ok: false, reason: 'below-floor' });
  });

  it('the aim is the energy target, never the floor: 5,000 kJ is short of 9,100; 9,100 passes', () => {
    expect(
      check(
        day([
          { kj: 1000, protein: 70 },
          { kj: 4000, protein: 70 },
        ]),
      ),
    ).toMatchObject({
      reason: 'energy-short',
      aimKj: 9100,
    });
    expect(
      check(
        day([
          { kj: 4100, protein: 70 },
          { kj: 5000, protein: 70 },
        ]),
      ),
    ).toEqual({ ok: true });
  });

  it('H22b, HS-R18: unknown energy never passes, whether its known part is under the floor or over it', () => {
    const raised = exampleDayContext({ storedFloorKj: 6000 });
    expect(
      check(
        day([
          { kj: 2500, protein: 70, unknown: ['energyKj'] },
          { kj: 3000, protein: 70 },
        ]),
        raised,
      ),
    ).toMatchObject({ ok: false, reason: 'energy-not-known', floorKj: 6000 });
    expect(
      check(
        day([
          { kj: 3000, protein: 70, unknown: ['energyKj'] },
          { kj: 4000, protein: 70 },
        ]),
      ),
    ).toMatchObject({ reason: 'energy-not-known-aim' });
  });

  it('HS-25: protein 139 g against a 140 g check is refused; 140 g passes; unknown protein never passes', () => {
    const base = { kj: 5000 };
    expect(
      check(
        day([
          { ...base, protein: 69 },
          { ...base, protein: 70 },
        ]),
      ),
    ).toMatchObject({
      reason: 'protein-short',
      proteinG: 140,
    });
    expect(
      check(
        day([
          { ...base, protein: 70 },
          { ...base, protein: 70 },
        ]),
      ).ok,
    ).toBe(true);
    expect(
      check(
        day([
          { ...base, protein: 70, unknown: ['proteinG'] },
          { ...base, protein: 70 },
        ]),
      ),
    ).toMatchObject({ reason: 'protein-not-known' });
  });

  it('HS-09: 20.4 g of carbs is within a 20 g ceiling, 20.5 g is over, and unknown carbs never pass', () => {
    const at = (carbs: number, unknown: NutrientKey[] = []) =>
      check(
        day([
          { kj: 5000, protein: 70, carbs, unknown },
          { kj: 5000, protein: 70 },
        ]),
      );
    expect(at(20.4).ok).toBe(true);
    expect(at(20.5)).toMatchObject({ reason: 'carbs-over', ceilingG: 20 });
    expect(at(5, ['carbsG'])).toMatchObject({ reason: 'carbs-not-known' });
  });

  it('C29, P43, V44: a one-meal day is refused for 601 g of protein food, a light dish, or 1.5 serves after reflux', () => {
    expect(check(day([{ kj: 9100, protein: 140, foodG: 601 }]), oneMeal)).toMatchObject({
      reason: 'one-meal-short',
      reasons: ['portion'],
    });
    expect(
      appDayCheck({
        day: day([{ kj: 9100, protein: 140 }]),
        ctx: oneMeal,
        kind: 'auto-fill',
        oneMealOk: () => false,
      }),
    ).toMatchObject({ reason: 'one-meal-dish' });
    const reflux = exampleDayContext({ window: oneMeal.window, refluxDay: true });
    expect(check(day([{ kj: 9100, protein: 140, myServes: 1.5 }]), reflux)).toMatchObject({
      reason: 'one-meal-reflux',
    });
    expect(check(day([{ kj: 9100, protein: 140, myServes: 1 }]), reflux)).toEqual({ ok: true });
  });

  it('V39: with no energy aim nothing is made, even a complete 6,000 kJ, 60 g day for an under-18', () => {
    const d = day([
      { kj: 3000, protein: 30 },
      { kj: 3000, protein: 30 },
    ]);
    const minor = exampleDayContext({
      targets: exampleDayTargets('steady', { energy: 'not-estimated' }),
    });
    const noGuide = exampleDayContext({
      targets: exampleDayTargets('steady', { energy: 'needs-guide' }),
    });
    expect(check(d, minor)).toMatchObject({ reason: 'no-estimate' });
    expect(check(d, noGuide)).toMatchObject({ reason: 'no-guide' });
  });

  it('V40: under plain figures the saturated-fat budget is still checked', () => {
    const plain = exampleDayContext({ plainFigures: true });
    expect(
      check(
        day([
          { kj: 5000, protein: 70, sat: 20 },
          { kj: 5000, protein: 70, sat: 20.5 },
        ]),
        plain,
      ),
    ).toMatchObject({ reason: 'sat-fat-over', budgetG: 40 });
  });
});

describe('the Planned food card and the owner’s floor note (item 22 S14; NU-05, HS-09, HS-R18, T25, T26)', () => {
  const satDay = (sat: number, unknown: NutrientKey[] = []) =>
    day([
      { kj: 5000, protein: 70, sat, unknown },
      { kj: 5000, protein: 70 },
    ]);
  const budget24 = exampleDayContext({
    targets: exampleDayTargets('steady', { satFatBudgetG: 24 }),
  });

  it('NU-05: 25 g against a 24 g budget is over, 23.4 g within, an unknown figure incomplete', () => {
    expect(planDayDisplay(satDay(25), budget24).satFat.state).toBe('over');
    expect(planDayDisplay(satDay(23.4), budget24).satFat.state).toBe('within');
    expect(planDayDisplay(satDay(10, ['saturatedFatG']), budget24).satFat.state).toBe('incomplete');
  });

  it('T25, T26: plain figures show no target or limit; the pregnancy note drops only the energy target', () => {
    const plain = planDayDisplay(satDay(5), exampleDayContext({ plainFigures: true }));
    expect(plain.energy.targetKj).toBeNull();
    expect(plain.protein.check).toBeNull();
    expect(plain.satFat.budgetG).toBeNull();
    const pregnancy = planDayDisplay(satDay(5), exampleDayContext({ pregnancyNote: true }));
    expect(pregnancy.energy.targetKj).toBeNull();
    expect(pregnancy.protein.check).toEqual({ kind: 'target', g: 140 });
    expect(planDayDisplay(satDay(5), budget24).protein.check).toEqual({
      kind: 'range',
      min: 120,
      max: 140,
    });
  });

  it('C108, HS-R18: the owner’s day gets a note below the floor or with energy not known, never a refusal', () => {
    const note = (parts: Part[]) => ownerDayFloorNote(day(parts), twoMeals);
    expect(note([{ kj: 4999, protein: 1 }])).toEqual({ kind: 'below-floor', floorKj: 5000 });
    expect(note([{ kj: 4000, protein: 1, unknown: ['energyKj'] }])).toEqual({
      kind: 'energy-not-known',
      floorKj: 5000,
    });
    expect(note([{ kj: 5000, protein: 1, unknown: ['energyKj'] }])).toBeNull();
  });
});

describe('counted meals (item 22 S16; V38, C10, C29, HS-18)', () => {
  const lookup = fixtureLookup();
  const stored = [meal('snack', R.snackB), meal('dinner', R.gardenF, 2)];
  const targets = exampleDayTargets('kickstart');
  const checkFor = (window: { start: string; end: string }) => {
    const counted = allowedSlots(planSlotsFor(window));
    return mealCheck({
      proteinTargetG: 140,
      dayEnergyTargetKj: energyForMealChecks(targets.energy),
      planned: plannedMealsForCheck({ meals: stored }, counted, lookup),
      logged: null,
      windowClosed: false,
      oneMealWindow: planSlotsFor(window).pattern === 'one-meal',
    });
  };

  it('a 22:2 plan read on 23:1 (a Kickstart start, an Undo, a saved pattern) is judged on its dinner alone', () => {
    const before = checkFor({ start: '17:00', end: '19:00' });
    expect(before.kind).toBe('short-before');
    const after = checkFor({ start: '18:00', end: '19:00' });
    if (after.kind !== 'short-before') throw new Error('short');
    expect(after.reasons).toContain('protein');
    expect(after.sitting).toMatchObject({ proteinG: 108, dinnerOnly: true });
  });

  it('the outside snack never makes up a 23:1 day for the app, nor the owner’s floor note', () => {
    const ctx = exampleDayContext({ window: { start: '18:00', end: '19:00' } });
    const d = countedDay(stored, ctx.counted, lookup);
    expect(d.outside.map((m) => m.slot)).toEqual(['snack']);
    expect(d.figures.totals.energyKj).toBe(4280);
    expect(appDayCheck({ day: d, ctx, kind: 'auto-fill', oneMealOk: always })).toMatchObject({
      reason: 'below-floor',
    });
    expect(ownerDayFloorNote(d, ctx)).toEqual({ kind: 'below-floor', floorKj: 5000 });
  });

  it('worked days of design 6.0: snack B with dinner A at 2 serves passes a 22:2 Kickstart day', () => {
    const d = countedDay(
      [meal('snack', R.snackB), meal('dinner', R.dinnerA, 2)],
      twoMeals.counted,
      lookup,
    );
    expect(d.figures.totals.energyKj).toBe(10620);
    expect(d.figures.totals.proteinG).toBe(165);
    expect(check(d)).toEqual({ ok: true });
    expect(
      check(countedDay([meal('dinner', R.dinnerA, 2)], oneMeal.counted, lookup), oneMeal),
    ).toEqual({
      ok: true,
    });
  });
});
