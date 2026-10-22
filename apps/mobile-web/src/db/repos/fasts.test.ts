// @vitest-environment node
// Item 15 through the repositories (Real Dexie over fake-indexeddb): undoing an end, the guarded
// update, a restart mid-fast, the planned length stored at the start, alcohol kept out of the
// food figures, the streak after an edit, the per-day eating windows and the two cards.
import {
  alcoholNoteApplies,
  cardHidden,
  cardTrigger,
  type EatingWindow,
  type FastRecord,
  fastingStreak,
  fastRecordPlan,
  loggedIntakeOn,
  mealCheck,
  type Nutrients,
  parseClockTime,
  planFast,
  runningSpan,
  type Schedule,
  spanElapsedMs,
  validateRow,
  zonedWallTimeToInstant,
} from '@diet/core';
import { fixtureId } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { StorageFullError } from '../errors';
import {
  failingWrite,
  onboardForTests,
  openTestDb,
  type OnboardOptions,
  type OpenTestOptions,
  type TestDb,
  testEnv,
  seedPlanDay,
} from '../testKit';

const NZ = 'Pacific/Auckland';
const MIN = 60_000;
const HOUR = 3_600_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const at = (date: string, time: string): number =>
  zonedWallTimeToInstant(date, parseClockTime(time), NZ);
const clockAt = (test: TestDb, ms: number) => {
  test.env.set(iso(ms));
};
const ONE_MEAL: EatingWindow = { start: '18:00', end: '19:00' };
const SNACK_AND_DINNER: EatingWindow = { start: '17:00', end: '19:00' };
const schedule = (
  standing: EatingWindow | null,
  overrides: Record<string, EatingWindow> = {},
): Schedule => ({ standing, switchTo: null, overrides });

/** A database whose readiness answers leave fasting open: every answer "no", a synthetic profile. */
async function openOpen(options: OpenTestOptions = {}): Promise<TestDb> {
  const test = await openTestDb(options);
  await onboardForTests(test, { weightKg: null });
  return test;
}

/** A completed fast, started and ended through the repository at the given instants. */
async function completedFast(test: TestDb, startMs: number, endMs: number): Promise<FastRecord> {
  clockAt(test, startMs);
  const fast = await test.repos.fasts.start();
  clockAt(test, endMs);
  return test.repos.fasts.end(fast.id);
}

describe('no fast starts or reopens while fasting is switched off (FS-08, HS-03)', () => {
  const refused = async (test: TestDb) => {
    await expect(test.repos.fasts.start()).rejects.toMatchObject({ rule: 'fasting-gated' });
  };

  it('start() is refused with no answers, each gating answer, an under-18 birth year or a low weight', async () => {
    await refused(await openTestDb());
    const cases: OnboardOptions[] = [
      { answers: { q1: 'yes' } },
      { answers: { q2: 'yes' } },
      { answers: { q5: 'yes' } },
      { answers: { q3: 'yes' } },
      // Born 1982: the minimum age in 2000 is 17.
      { profile: { birthYear: 1982 } },
      // 50 kg is below BMI 18.5 for 175 cm.
      { weightKg: 50 },
    ];
    for (const options of cases) {
      const test = await openTestDb();
      await onboardForTests(test, options);
      await refused(test);
    }
  });

  it("start() is allowed with every answer no, and with answer 3's prescriber agreement until 3 is answered again", async () => {
    expect(await (await openOpen()).repos.fasts.start()).toMatchObject({ endedAt: null });
    const test = await openTestDb();
    await onboardForTests(test, { answers: { q3: 'yes' }, confirmations: ['prescriberAgreed'] });
    const fast = await test.repos.fasts.start();
    test.env.set(new Date(Date.parse(test.env.now()) + HOUR).toISOString());
    await test.repos.fasts.end(fast.id);
    await test.repos.readiness.answer('q3', 'yes');
    await refused(test);
    // An open fast can always be ended; reopening one waits for the gate (undoEnd).
    await expect(test.repos.fasts.undoEnd(fast.id)).rejects.toMatchObject({
      rule: 'fasting-gated',
    });
  });
});

describe('undoing an end (HS-18, FS-08)', () => {
  it('reopens the latest fast within 5 minutes of its end; refuses later, a running fast and an older fast', async () => {
    const test = await openOpen();
    const older = await completedFast(test, at('2000-01-02', '19:00'), at('2000-01-03', '18:00'));
    const latest = await completedFast(test, at('2000-01-03', '19:00'), at('2000-01-04', '18:00'));
    const ended = Date.parse(latest.endedAt ?? '');
    // Five minutes and a millisecond, written out so a longer limit fails here.
    clockAt(test, ended + 300_001);
    await expect(test.repos.fasts.undoEnd(latest.id)).rejects.toMatchObject({
      rule: 'undo-expired',
    });
    clockAt(test, ended + 4 * MIN);
    await expect(test.repos.fasts.undoEnd(older.id)).rejects.toMatchObject({ rule: 'not-latest' });
    const reopened = await test.repos.fasts.undoEnd(latest.id);
    expect(reopened).toMatchObject({ endedAt: null, endedTimeZone: null });
    expect(await test.repos.fasts.running()).toEqual(reopened);
    await expect(test.repos.fasts.undoEnd(latest.id)).rejects.toMatchObject({ rule: 'not-ended' });
    await expect(test.repos.fasts.undoEnd(fixtureId(1))).rejects.toMatchObject({
      rule: 'not-found',
    });
  });

  it('End is never refused: with the phone clock 2 hours behind the start it stores the start plus 1 ms (review)', async () => {
    const test = await openOpen({ env: testEnv('2000-01-04T06:00:00.000Z') });
    const fast = await test.repos.fasts.start();
    clockAt(test, Date.parse(fast.startedAt) - 2 * HOUR);
    const ended = await test.repos.fasts.end(fast.id);
    expect(ended.endedAt).toBe('2000-01-04T06:00:00.001Z');
    expect(await test.repos.fasts.running()).toBeUndefined();
  });

  it('an update never reopens a fast, never sets a time after now, and never overlaps another', async () => {
    const test = await openOpen();
    const first = await completedFast(test, at('2000-01-02', '19:00'), at('2000-01-03', '18:00'));
    const second = await completedFast(test, at('2000-01-03', '19:00'), at('2000-01-04', '18:00'));
    await expect(test.repos.fasts.update(second.id, { endedAt: null })).rejects.toMatchObject({
      rule: 'reopen',
    });
    const later = iso(Date.parse(test.env.now()) + MIN);
    await expect(test.repos.fasts.update(second.id, { endedAt: later })).rejects.toMatchObject({
      rule: 'future-time',
    });
    await expect(test.repos.fasts.update(second.id, { startedAt: later })).rejects.toMatchObject({
      rule: 'future-time',
    });
    await expect(
      test.repos.fasts.update(second.id, { startedAt: first.startedAt }),
    ).rejects.toMatchObject({ rule: 'fast-overlap' });
    const noted = await test.repos.fasts.update(second.id, { note: 'Example note' });
    expect(noted).toMatchObject({ note: 'Example note', endedAt: second.endedAt });
  });
});

describe('the fast survives a restart (FS-03)', () => {
  it('a fresh database on the same phone, 14 h 30 m later, shows the same fast and its real elapsed time', async () => {
    const env = testEnv('2000-01-04T06:00:00.000Z'); // 19:00 NZDT
    const first = await openOpen({ env });
    const fast = await first.repos.fasts.start();
    first.db.closeForGood('reload-needed');
    env.set('2000-01-04T20:30:00.000Z');
    const second = await openTestDb({ deps: first.deps, env });
    const running = await second.repos.fasts.running();
    expect(running).toEqual(fast);
    const span = runningSpan(await second.repos.fasts.list());
    expect(span === null ? 0 : spanElapsedMs(span, Date.parse(env.now()))).toBe(
      14 * HOUR + 30 * MIN,
    );
  });
});

describe('the planned length stored at the start (FS-06, D47)', () => {
  it('stores 1440 for a capped plan, null without a pattern, and 9 for a joined span', async () => {
    const test = await openOpen();
    const april = at('2026-04-04', '18:30');
    clockAt(test, april);
    const capped = await test.repos.fasts.start(
      fastRecordPlan(planFast(april, NZ, schedule(ONE_MEAL))),
    );
    expect(capped).toMatchObject({ plannedFastMinutes: 1440, snackTime: null, dinnerTime: null });
    clockAt(test, april + HOUR);
    await test.repos.fasts.end(capped.id);
    const none = await test.repos.fasts.start(
      fastRecordPlan(planFast(april + 2 * HOUR, NZ, schedule(null))),
    );
    expect(none.plannedFastMinutes).toBeNull();

    const joined = await openOpen();
    const monday = at('2000-01-03', '19:00');
    await completedFast(joined, monday, at('2000-01-04', '18:50'));
    const restart = at('2000-01-04', '18:51');
    clockAt(joined, restart);
    const plan = planFast(restart, NZ, schedule(ONE_MEAL), monday);
    expect((await joined.repos.fasts.start(fastRecordPlan(plan))).plannedFastMinutes).toBe(9);
  });
});

describe('alcohol is not food, and changes nothing but the note (FS-05, C11, C63)', () => {
  const nutrients = (proteinG: number, energyKj: number): Nutrients => ({
    energyKj,
    proteinG,
    fatG: 0,
    saturatedFatG: 0,
    carbsG: 0,
    sugarsG: 0,
    fibreG: 0,
    sodiumMg: 0,
  });

  /** One fixture day through the repositories: a plan row, three food entries, maybe drinks. */
  async function day(withDrinks: boolean) {
    const test = await openOpen();
    await completedFast(test, at('2000-01-03', '19:00'), at('2000-01-04', '12:00'));
    clockAt(test, at('2000-01-04', '13:00'));
    await test.repos.planDays.setWindows([{ date: '2000-01-04', window: SNACK_AND_DINNER }]);
    const food = (time: string, sourceKind: 'plan' | 'label', protein: number, energy: number) =>
      test.repos.foodLog.create({
        at: iso(at('2000-01-04', time)),
        sourceKind,
        refId: sourceKind === 'plan' ? '2000-01-04#lunch' : fixtureId(500 + protein),
        name: 'Example food',
        grams: null,
        weightBasis: null,
        servings: 1,
        nutrients: nutrients(protein, energy),
        unknownNutrients: [],
        confidence: sourceKind === 'plan' ? 'database' : 'label',
      });
    await food('12:10', 'plan', 40, 3_000);
    await food('12:20', 'label', 15, 1_200);
    await food('12:30', 'label', 10, 800);
    clockAt(test, at('2000-01-04', '20:00'));
    const fast = await test.repos.fasts.start();
    if (withDrinks) {
      for (let i = 0; i < 6; i++) {
        clockAt(test, at('2000-01-04', '20:30') + i * 10 * MIN);
        await test.repos.drinks.log({
          beverageId: null,
          name: 'Example lager',
          beverage: { volumeMl: 330, abvPercent: 5, label: null },
          count: 1,
        });
      }
    }
    clockAt(test, at('2000-01-04', '22:00'));
    const intake = loggedIntakeOn('2000-01-04', await test.repos.foodLog.list(), NZ);
    const check = mealCheck({
      proteinTargetG: 120,
      dayEnergyTargetKj: 9_000,
      planned: null,
      logged: intake,
      windowClosed: true,
      oneMealWindow: false,
    });
    const streak = fastingStreak(await test.repos.fasts.list(), '2000-01-04', NZ);
    const drinks = await test.repos.drinks.list();
    return { intake, check, streak, drinks, fasts: [fast] };
  }

  it('the food figures, the meal check and the streak are the same with six drinks in the fast', async () => {
    const plain = await day(false);
    const drinking = await day(true);
    expect(drinking.drinks).toHaveLength(6);
    expect(drinking.intake).toEqual({
      proteinG: 65,
      foodEnergyKj: 5_000,
      loggedSlots: ['lunch'],
      otherEntries: 2,
      incomplete: false,
    });
    expect(drinking.intake).toEqual(plain.intake);
    expect(drinking.check).toEqual(plain.check);
    expect(drinking.streak).toBe(plain.streak);
    const drink = drinking.drinks[0];
    expect(
      drink !== undefined &&
        alcoholNoteApplies(
          drink,
          drinking.fasts,
          schedule(SNACK_AND_DINNER),
          at('2000-01-04', '22:00'),
        ),
    ).toBe(true);
  });
});

describe('editing a fast past 24 hours (HS-02, C63)', () => {
  it('removes its credit without resetting the streak, and editing it back restores the credit', async () => {
    const test = await openOpen();
    await completedFast(test, at('2000-01-01', '19:00'), at('2000-01-02', '15:00'));
    await completedFast(test, at('2000-01-02', '19:00'), at('2000-01-03', '15:00'));
    const last = await completedFast(test, at('2000-01-03', '19:00'), at('2000-01-04', '18:00'));
    clockAt(test, at('2000-01-04', '21:00'));
    const streak = async () => fastingStreak(await test.repos.fasts.list(), '2000-01-04', NZ);
    expect(await streak()).toBe(3);
    // 23 hours becomes 25: the 4th is no longer credited, and the 3rd and 4th become neutral.
    await test.repos.fasts.update(last.id, { startedAt: iso(at('2000-01-03', '17:00')) });
    expect(await streak()).toBe(2);
    await test.repos.fasts.update(last.id, { startedAt: iso(at('2000-01-03', '19:00')) });
    expect(await streak()).toBe(3);
  });
});

describe('per-day eating windows (FL-12, C73)', () => {
  it('a date with no row gets one with no meals; a row with meals keeps them; every row validates', async () => {
    const test = await openTestDb();
    clockAt(test, at('2000-01-04', '09:00'));
    await seedPlanDay(test, {
      date: '2000-01-05',
      dietMode: 'keto',
      meals: [{ slot: 'dinner', recipeId: fixtureId(600), myServes: 1, householdServes: 3 }],
      eatingWindow: null,
    });
    await test.repos.planDays.setWindows([
      { date: '2000-01-04', window: SNACK_AND_DINNER },
      { date: '2000-01-05', window: SNACK_AND_DINNER },
    ]);
    const [empty, planned] = await test.repos.planDays.list();
    const profile = await test.repos.profile.get();
    expect(empty).toMatchObject({
      date: '2000-01-04',
      dietMode: profile.dietMode,
      meals: [],
      eatingWindow: SNACK_AND_DINNER,
    });
    expect(planned).toMatchObject({ date: '2000-01-05', eatingWindow: SNACK_AND_DINNER });
    expect(planned?.meals).toHaveLength(1);
    for (const row of [empty, planned]) expect(validateRow('plan_days', row)).toEqual(row);

    await test.repos.planDays.clearWindow('2000-01-04');
    await test.repos.planDays.clearWindow('2000-01-05');
    expect(await test.repos.planDays.get('2000-01-04')).toBeUndefined();
    expect(await test.repos.planDays.get('2000-01-05')).toMatchObject({ eatingWindow: null });
  });

  it('writes a pair of changes in one transaction: a failed second write leaves neither', async () => {
    const full = failingWrite('plan_days', 'put', () =>
      Object.assign(new Error('full'), { name: 'QuotaExceededError' }),
    );
    const test = await openTestDb({ extraMiddleware: [full.middleware] });
    full.arm();
    await expect(
      test.repos.planDays.setWindows([
        { date: '2000-01-04', window: { start: '17:00', end: '18:00' } },
        { date: '2000-01-05', window: SNACK_AND_DINNER },
      ]),
    ).rejects.toBeInstanceOf(StorageFullError);
    expect(await test.repos.planDays.list()).toEqual([]);
  });
});

describe('the two item-15 cards (FL-16)', () => {
  it('the snack offer and the GP nudge dismiss through the registry; the nudge returns after 168 hours', async () => {
    const test = await openTestDb();
    const snack = await test.repos.cardState.dismiss('single-meal-snack', 'date:2000-01-04');
    expect(cardTrigger('single-meal-snack', 'date:2000-01-04')?.dismissal).toEqual({
      kind: 'final',
    });
    expect(snack.dismissedAt).toBe(test.env.now());
    const nudge = await test.repos.cardState.dismiss('reflux-gp-nudge', 'rolling');
    const dismissal = cardTrigger('reflux-gp-nudge', 'rolling')?.dismissal ?? { kind: 'final' };
    const hiddenAt = (ms: number) =>
      cardHidden({ now: iso(ms), row: nudge, dismissal, drinkingDayCutoverMinutes: 300 });
    const dismissed = Date.parse(nudge.dismissedAt ?? '');
    expect(hiddenAt(dismissed + 167 * HOUR)).toBe(true);
    expect(hiddenAt(dismissed + 168 * HOUR)).toBe(false);
  });
});
