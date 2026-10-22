// Item 22 design 6.2: the planner's one writer, writeMeals, re-checks everything inside its
// transaction (Node, real Dexie over fake-indexeddb). Synthetic recipes and figures from core's
// planner fixtures. Onboarded owner: female, 175 cm, born 1970, 100 kg, keto, the 22:2 window; on
// 2000-03-01 the day's energy target is 10,968 kJ, protein 120 g, saturated-fat budget 29 g.
import {
  countedDay,
  type PlanMealWrite,
  type PlanWriteKind,
  type PlanWriteRequest,
} from '@diet/core';
import { fixtureLookup, R } from '@diet/core/planner/testData';
import { describe, expect, it, vi } from 'vitest';
import { StorageRuleError } from '../errors';
import { type OnboardOptions, onboardForTests, openTestDb, type TestDb } from '../testKit';

vi.mock('../../planner/planData', async () =>
  (await import('../../testSetup/plannerData')).plannerDataMock(),
);

const TODAY = '2000-03-01';
const TOMORROW = '2000-03-02';

async function open(options: OnboardOptions = {}): Promise<TestDb> {
  const test = await openTestDb();
  await onboardForTests(test, options);
  return test;
}

const w = (
  slot: PlanMealWrite['slot'],
  recipeId: string,
  myServes = 1,
  householdServes = 1,
  date = TODAY,
) => ({
  date,
  slot,
  meal: { recipeId, myServes, householdServes },
});

const request = (
  kind: PlanWriteKind,
  writes: readonly PlanMealWrite[],
  extra: Partial<PlanWriteRequest> = {},
): PlanWriteRequest => ({ kind, writes, labelChecked: [], conflictConfirmed: [], ...extra });

/** An adequate 22:2 day for the onboarded owner: 11,010 kJ, 412.5 g protein, 12.45 g saturated fat. */
const adequate = (date = TODAY) => [
  w('snack', R.snackB, 1.5, 1, date),
  w('dinner', R.bigH, 2, 1, date),
];

const reasons = (outcome: Awaited<ReturnType<TestDb['repos']['planDays']['writeMeals']>>) =>
  outcome.refused.map((r) => r.refusal.reason);

const rule = async (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof StorageRuleError ? error.rule : error),
  );

describe('writeMeals (item 22 D1, D2, D7)', () => {
  it('D1: an owner add creates the row with the profile’s diet mode; removing the last meal deletes it, a window keeps it', async () => {
    const test = await open();
    const { planDays } = test.repos;
    expect(
      (await planDays.writeMeals(request('owner-meal', [w('dinner', R.dinnerA)]))).written,
    ).toEqual([TODAY]);
    await planDays.writeMeals(request('owner-meal', [w('snack', R.snackB)]));
    expect(await planDays.get(TODAY)).toMatchObject({
      dietMode: 'keto',
      meals: [
        { slot: 'snack', recipeId: R.snackB },
        { slot: 'dinner', recipeId: R.dinnerA },
      ],
      eatingWindow: null,
    });
    await planDays.writeMeals(request('owner-meal', [{ date: TODAY, slot: 'snack', meal: null }]));
    await planDays.writeMeals(request('owner-meal', [{ date: TODAY, slot: 'dinner', meal: null }]));
    expect(await planDays.get(TODAY)).toBeUndefined();
    await planDays.setWindows([{ date: TOMORROW, window: { start: '17:00', end: '20:00' } }]);
    await planDays.writeMeals(request('owner-meal', [w('dinner', R.dinnerA, 1, 1, TOMORROW)]));
    await planDays.writeMeals(
      request('owner-meal', [{ date: TOMORROW, slot: 'dinner', meal: null }]),
    );
    expect(await planDays.get(TOMORROW)).toMatchObject({
      meals: [],
      eatingWindow: { end: '20:00' },
    });
  });

  it('D2 FL-05 HS-23: changing a dinner for 3 to 4 keeps my serves and every figure', async () => {
    const test = await open();
    const { planDays } = test.repos;
    await planDays.writeMeals(request('owner-meal', [w('dinner', R.dinnerA, 1, 3)]));
    const before = await planDays.get(TODAY);
    await planDays.writeMeals(request('owner-meal', [w('dinner', R.dinnerA, 1, 4)]));
    const after = await planDays.get(TODAY);
    expect(after?.meals).toEqual([
      { slot: 'dinner', recipeId: R.dinnerA, myServes: 1, householdServes: 4 },
    ]);
    const figures = (meals: NonNullable<typeof after>['meals']) =>
      countedDay(meals, ['dinner'], fixtureLookup()).figures.totals;
    expect(figures(after?.meals ?? [])).toEqual(figures(before?.meals ?? []));
  });

  it('D7: a past date and a date after the planning range are refused; hasMealsBefore', async () => {
    const test = await open();
    const { planDays } = test.repos;
    expect(
      reasons(
        await planDays.writeMeals(
          request('owner-meal', [w('dinner', R.dinnerA, 1, 1, '2000-02-29')]),
        ),
      ),
    ).toEqual(['past-day']);
    expect(
      reasons(
        await planDays.writeMeals(
          request('owner-meal', [w('dinner', R.dinnerA, 1, 1, '2000-03-13')]),
        ),
      ),
    ).toEqual(['future-day']);
    expect(await planDays.hasMealsBefore('2000-03-06')).toBe(false);
    await planDays.writeMeals(request('owner-meal', [w('dinner', R.dinnerA, 1, 1, TOMORROW)]));
    expect(await planDays.hasMealsBefore('2000-03-06')).toBe(true);
    expect(await planDays.hasMealsBefore(TOMORROW)).toBe(false);
  });
});

describe('the floor and the targets cannot be bypassed (item 22 D3; HS-10, NU-06, C108, V39)', () => {
  it('a hand-built app-made request for a complete 3,480 kJ day is refused, store unchanged; the owner’s is written with a note', async () => {
    const test = await open();
    const { planDays } = test.repos;
    const low = [w('snack', R.snackB), w('dinner', R.gardenF)];
    for (const kind of ['auto-fill', 'copy'] as const) {
      expect(reasons(await planDays.writeMeals(request(kind, low)))).toEqual(['below-floor']);
    }
    for (const kind of ['template', 'repeat', 'suggested-swap'] as const) {
      expect(reasons(await planDays.writeMeals(request(kind, low)))).toEqual(['kind']);
    }
    expect(await planDays.list()).toEqual([]);
    const owner = await planDays.writeMeals(request('owner-meal', [w('dinner', R.gardenF)]));
    expect(owner.notes).toEqual([{ date: TODAY, note: { kind: 'below-floor', floorKj: 5000 } }]);
    expect(reasons(await planDays.writeMeals(request('auto-fill', adequate(TOMORROW))))).toEqual(
      [],
    );
  });

  it('a raised floor of 6,000 kJ refuses a 5,680 kJ app-made day; answer 1 "yes" refuses every app-made day', async () => {
    const test = await open();
    await test.repos.targets.update({ energyFloorKj: 6000 });
    const day = [w('snack', R.snackB, 1.5), w('dinner', R.packedG)];
    expect((await test.repos.planDays.writeMeals(request('auto-fill', day))).refused).toEqual([
      { date: TODAY, refusal: { reason: 'below-floor', floorKj: 6000 } },
    ]);
    const minor = await open({ answers: { q1: 'yes' } });
    expect(
      reasons(await minor.repos.planDays.writeMeals(request('auto-fill', adequate()))),
    ).toEqual(['no-estimate']);
  });
});

describe('allergens re-checked live (item 22 D4, D5; HS-R20, HS-24, P41, V18, V47)', () => {
  it('D4: with peanut listed, the packed dinner needs the label check; app-made writes never take it; nothing of it is stored', async () => {
    const test = await open({ profile: { allergens: ['peanut'] } });
    const { planDays } = test.repos;
    const packed = [w('dinner', R.packedG)];
    expect(reasons(await planDays.writeMeals(request('owner-meal', packed)))).toEqual([
      'label-check-needed',
    ]);
    const checked = { labelChecked: [{ recipeId: R.packedG, allergens: ['peanut' as const] }] };
    for (const kind of ['auto-fill', 'copy'] as const) {
      expect(
        reasons(
          await planDays.writeMeals(
            request(kind, [w('snack', R.snackB, 1.5), w('dinner', R.packedG, 2)], checked),
          ),
        ),
      ).toEqual(['label-check-needed']);
    }
    expect((await planDays.writeMeals(request('owner-meal', packed, checked))).written).toEqual([
      TODAY,
    ]);
    const row = await planDays.get(TODAY);
    expect(Object.keys(row ?? {}).sort()).toEqual([
      'date',
      'dietMode',
      'eatingWindow',
      'meals',
      'updatedAt',
    ]);
    expect(Object.keys(row?.meals[0] ?? {})).toEqual([
      'slot',
      'recipeId',
      'myServes',
      'householdServes',
    ]);
  });

  it('D5: allergens or dislikes added after a proposal or a confirmation refuse those writes only', async () => {
    const test = await open();
    const { planDays, profile } = test.repos;
    const proposal = [
      ...adequate(TODAY),
      w('snack', R.snackB, 2, 1, TOMORROW),
      w('dinner', R.fishD, 2, 1, TOMORROW),
    ];
    await profile.update({ allergens: ['fish'] });
    const outcome = await planDays.writeMeals(request('auto-fill', proposal));
    expect(outcome.written).toEqual([TODAY]);
    expect(reasons(outcome)).toEqual(['allergen-conflict']);
    // A label check named peanuts; fish was listed since.
    await profile.update({ allergens: ['peanut', 'fish'] });
    const peanutOnly = { labelChecked: [{ recipeId: R.packedG, allergens: ['peanut' as const] }] };
    expect(
      reasons(
        await planDays.writeMeals(
          request('owner-meal', [w('dinner', R.packedG, 1, 1, TOMORROW)], peanutOnly),
        ),
      ),
    ).toEqual(['label-check-needed']);
    // A conflict confirmed for fish; wheat was listed since (the wheat dinner has wheat only).
    await profile.update({ allergens: ['fish', 'wheat'] });
    const fishOnly = { conflictConfirmed: [{ recipeId: R.wheatE, allergens: ['fish' as const] }] };
    expect(
      reasons(
        await planDays.writeMeals(
          request('owner-meal', [w('dinner', R.wheatE, 1, 1, TOMORROW)], fishOnly),
        ),
      ),
    ).toEqual(['allergen-conflict']);
    await profile.update({ allergens: [], dislikeTerms: ['Example protein'] });
    expect(
      reasons(await planDays.writeMeals(request('auto-fill', adequate('2000-03-03')))),
    ).toEqual(['not-wanted']);
  });
});

describe('slots against the live window (item 22 D6, D10; C07, C73, HS-03, V44)', () => {
  it('D6: a snack on a 23:1 day is refused until the 5 pm snack is added; with answer 5 a breakfast is fine', async () => {
    const test = await open();
    await test.repos.targets.update({
      fastingPreset: '23:1',
      eatingWindow: { start: '18:00', end: '19:00' },
      presetChosenBy: 'user',
    });
    const { planDays } = test.repos;
    expect(
      reasons(
        await planDays.writeMeals(request('owner-meal', [w('snack', R.snackB, 1, 1, TOMORROW)])),
      ),
    ).toEqual(['slot']);
    await planDays.setWindows([{ date: TOMORROW, window: { start: '17:00', end: '19:00' } }]);
    expect(
      reasons(
        await planDays.writeMeals(request('owner-meal', [w('snack', R.snackB, 1, 1, TOMORROW)])),
      ),
    ).toEqual([]);
    const gated = await open({ answers: { q5: 'yes' } });
    await gated.repos.planDays.setWindows([
      { date: TODAY, window: { start: '18:00', end: '19:00' } },
    ]);
    expect(
      reasons(
        await gated.repos.planDays.writeMeals(
          request('owner-meal', [w('breakfast', R.breakfastJ)]),
        ),
      ),
    ).toEqual([]);
  });

  it('D10: after a reflux symptom today, tomorrow’s only meal above one serve is refused; the day after it is not for that', async () => {
    // A lighter owner, so a 9,000 kJ dinner reaches the day's energy target.
    const test = await open({ weightKg: 65 });
    await test.repos.targets.update({
      fastingPreset: '23:1',
      eatingWindow: { start: '18:00', end: '19:00' },
      presetChosenBy: 'user',
    });
    await test.repos.symptoms.create({ symptom: 'heartburn', severity: null, note: null });
    const { planDays } = test.repos;
    expect(
      reasons(
        await planDays.writeMeals(request('auto-fill', [w('dinner', R.bigH, 2, 1, TOMORROW)])),
      ),
    ).toEqual(['one-meal-reflux']);
    expect(
      reasons(
        await planDays.writeMeals(request('auto-fill', [w('dinner', R.bigH, 2, 1, '2000-03-03')])),
      ),
    ).not.toContain('one-meal-reflux');
  });
});

describe('the generic path is narrowed (item 22 D8; V32)', () => {
  it('meals only through writeMeals; a per-day window only through item 15’s methods', async () => {
    const test = await open();
    const { planDays } = test.repos;
    const meal = { slot: 'dinner' as const, recipeId: R.dinnerA, myServes: 1, householdServes: 1 };
    expect(
      await rule(
        planDays.create({ date: TODAY, dietMode: 'keto', meals: [meal], eatingWindow: null }),
      ),
    ).toBe('plan-meals-through-planner');
    await planDays.create({ date: TODAY, dietMode: 'keto', meals: [], eatingWindow: null });
    expect(await rule(planDays.update(TODAY, { meals: [meal] }))).toBe(
      'plan-meals-through-planner',
    );
    await planDays.update(TODAY, { meals: [] });
    expect((await planDays.get(TODAY))?.meals).toEqual([]);
    await planDays.remove(TODAY);
    await planDays.setWindows([{ date: TOMORROW, window: { start: '17:00', end: '19:00' } }]);
    expect(await rule(planDays.remove(TOMORROW))).toBe('plan-window-through-fasting');
    expect(await planDays.get(TOMORROW)).toBeDefined();
  });

  it('D9: hidden recipes and the budget note round-trip through settings and profile', async () => {
    const test = await open();
    await test.repos.settings.update({ hiddenSeedIds: [R.dinnerA] });
    await test.repos.profile.update({ budgetNote: '$80 a week' });
    expect((await test.repos.settings.get()).hiddenSeedIds).toEqual([R.dinnerA]);
    expect((await test.repos.profile.get()).budgetNote).toBe('$80 a week');
  });
});
