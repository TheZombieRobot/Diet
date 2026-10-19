// @vitest-environment node
// Repositories and the validation middleware (storage spec sections 7.3 and 8; section 16 tests
// 23, 24 and 25; table CRUD for item 12's acceptance). Real Dexie over fake-indexeddb.
import {
  type GenericOp,
  primaryKeyOf,
  type StoreName,
  StorageInvariantError,
  StorageValidationError,
  TABLES,
} from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { snapshotV1 } from '@diet/test-fixtures';
import { describe, expect, it, vi } from 'vitest';
import { StorageFullError, StorageOperationError, StorageRuleError } from './errors';
import { crudRepo, type CrudRepo, type RepoContext } from './repos';
import { failingWrite, openTestDb, photoRow, type TestDb, testEnv } from './testKit';

const contextOf = ({ db, env }: TestDb): RepoContext => ({ db, env, gate: db.gate, hooks: {} });

/** Fields the repository sets itself on create (section 8.4), left out of the input. */
const ASSIGNED: Partial<Record<StoreName, readonly string[]>> = {
  steps_log: ['updatedAt'],
  ingredients: ['createdAt', 'updatedAt'],
  ingredient_overrides: ['createdAt', 'updatedAt'],
  recipes: ['createdAt', 'updatedAt'],
  plan_days: ['updatedAt'],
  garden: ['updatedAt'],
  pantry: ['updatedAt'],
  sessions: ['completedAt', 'timeZone'],
  beverages: ['createdAt', 'updatedAt'],
  alcohol_day_notes: ['enteredAt', 'timeZone', 'updatedAt'],
  alcohol_milestones: ['createdAt'],
  grocery_lists: ['createdAt', 'updatedAt', 'version'],
};

/** A change that each store's validator accepts, for the update step. */
const PATCHES: Partial<Record<StoreName, Record<string, unknown>>> = {
  weights: { note: 'Example changed note' },
  symptom_log: { note: 'Example changed note' },
  water_log: { ml: 500 },
  steps_log: { steps: 4321 },
  ingredients: { name: 'Example changed food' },
  ingredient_overrides: { changes: [{ field: 'name', value: 'Example changed name' }] },
  recipes: { title: 'Example changed recipe' },
  plan_days: { meals: [] },
  food_log: { name: 'Example changed entry' },
  garden: { name: 'Example changed crop' },
  pantry: { name: 'Example changed item' },
  sessions: { note: 'Example changed note' },
  beverages: { name: 'Example changed drink' },
  alcohol_day_notes: { note: 'Example changed note' },
  alcohol_milestones: { label: 'Example changed milestone' },
  grocery_lists: { storeName: 'Example changed store' },
};

const FULL_CRUD = (Object.keys(PATCHES) as StoreName[]).filter((t) =>
  (['create', 'update', 'remove'] as GenericOp[]).every((op) => TABLES[t].ops.includes(op)),
);

function inputFor(table: StoreName): Record<string, unknown> {
  const sample = structuredClone(
    snapshotV1[table as keyof typeof snapshotV1][0],
  ) as unknown as Record<string, unknown>;
  for (const field of ASSIGNED[table] ?? []) Reflect.deleteProperty(sample, field);
  if (table === 'grocery_lists') {
    // A new list has never been sent (version starts at 1).
    Object.assign(sample, {
      sentVersion: null,
      sentAt: null,
      transferId: null,
      receivedVersion: null,
      receivedAt: null,
      laptopReceivedAt: null,
    });
  }
  return sample;
}

describe('generic repositories (section 8.2; section 16 test 23; table CRUD)', () => {
  it('covers every store whose generic column allows create, update and remove', () => {
    expect([...FULL_CRUD].sort()).toEqual(
      (Object.keys(TABLES) as StoreName[])
        .filter((t) =>
          ['create', 'update', 'remove'].every((op) => TABLES[t].ops.includes(op as GenericOp)),
        )
        .sort(),
    );
    expect(FULL_CRUD).toHaveLength(16);
  });

  it.each(FULL_CRUD)('%s: create, get, list, index range, update, remove', async (table) => {
    const test = await openTestDb();
    const repo = crudRepo(contextOf(test), table) as unknown as CrudRepo<'weights'>;
    const input = inputFor(table);
    const created = (await repo.create(input as never)) as unknown as Record<string, unknown>;
    for (const [field, value] of Object.entries(input))
      expect(created[field], field).toEqual(value);
    for (const field of ['createdAt', 'updatedAt', 'enteredAt']) {
      if ((ASSIGNED[table] ?? []).includes(field))
        expect(created[field], field).toBe(test.env.now());
    }
    if (table === 'grocery_lists') expect(created['version']).toBe(1);
    const spec = TABLES[table];
    const key = primaryKeyOf(spec, created);
    const keyArg = (key.length === 1 ? key[0] : key) as string;
    expect(await repo.get(keyArg)).toEqual(created);
    expect(await repo.list()).toContainEqual(created);
    const index =
      spec.indexes[0] !== undefined && created[spec.indexes[0]] !== null
        ? spec.indexes[0]
        : (spec.key[0] ?? '');
    const value = created[index] as string;
    expect(await repo.listByIndex(index, value, value)).toContainEqual(created);

    test.env.advanceDays(1);
    const updated = (await repo.update(keyArg, PATCHES[table] as never)) as unknown as Record<
      string,
      unknown
    >;
    expect(updated).toMatchObject(PATCHES[table] ?? {});
    expect(await repo.get(keyArg)).toEqual(updated);
    if ('updatedAt' in created) expect(updated['updatedAt']).toBe(test.env.now());
    if ('createdAt' in created) expect(updated['createdAt']).toBe(created['createdAt']);
    if (table === 'grocery_lists') expect(updated['version']).toBe(2);

    await repo.remove(keyArg);
    expect(await repo.get(keyArg)).toBeUndefined();
  });

  it('an invalid write is refused and the store is unchanged', async () => {
    const test = await openTestDb();
    const before = await test.db.weights.count();
    await expect(
      test.repos.weights.create({ kg: 5, source: 'manual', note: null }),
    ).rejects.toMatchObject({
      name: 'StorageValidationError',
      table: 'weights',
      field: 'kg',
      rule: 'range',
    });
    expect(await test.db.weights.count()).toBe(before);
    const created = await test.repos.weights.create({ kg: 100, source: 'manual', note: null });
    await expect(test.repos.weights.update(created.id, { kg: 401 })).rejects.toBeInstanceOf(
      StorageValidationError,
    );
    expect((await test.repos.weights.get(created.id))?.kg).toBe(100);
  });

  it('the middleware refuses a raw put of an invalid row, and every partial update', async () => {
    const test = await openTestDb();
    const row = await test.repos.weights.create({ kg: 100, source: 'manual', note: null });
    await expect(test.db.weights.put({ ...row, kg: 5 })).rejects.toMatchObject({
      name: 'StorageValidationError',
      field: 'kg',
    });
    await expect(test.db.weights.update(row.id, { kg: 5 })).rejects.toBeInstanceOf(
      StorageOperationError,
    );
    await expect(test.db.weights.update(row.id, { note: 'Example note' })).rejects.toBeInstanceOf(
      StorageOperationError,
    );
    await expect(
      test.db.weights.where('id').equals(row.id).modify({ kg: 101 }),
    ).rejects.toBeDefined();
    expect((await test.db.weights.get(row.id))?.kg).toBe(100);
  });

  it('the generic repository refuses what section 8.4 does not list', async () => {
    const test = await openTestDb();
    const ctx = contextOf(test);
    const periods = crudRepo(ctx, 'kickstart_periods');
    const checks = crudRepo(ctx, 'kickstart_checks');
    const drinks = crudRepo(ctx, 'drinks_log');
    const id = test.env.randomId();
    expect(() => periods.update(id, {})).toThrow(StorageOperationError);
    expect(() => periods.remove(id)).toThrow(StorageOperationError);
    expect(() => periods.create({} as never)).toThrow(StorageOperationError);
    expect(() => checks.update(id, {})).toThrow(StorageOperationError);
    expect(() => checks.remove(id)).toThrow(StorageOperationError);
    expect(() => drinks.create({} as never)).toThrow(StorageOperationError);
    expect(() => drinks.update(id, {})).toThrow(StorageOperationError);
    expect(() => drinks.remove(id)).toThrow(StorageOperationError);
    expect(await drinks.list()).toEqual([]);
    expect(await drinks.get(id)).toBeUndefined();
    expect(() => crudRepo(ctx, 'profile').remove('singleton')).toThrow(StorageOperationError);
    expect(() => crudRepo(ctx, 'card_state').list()).toThrow(StorageOperationError);
    expect(() => crudRepo(ctx, 'transfer_pairings').list()).toThrow(StorageOperationError);
    expect(() => crudRepo(ctx, 'garden_photos').get(id)).toThrow(StorageOperationError);
    expect(() => crudRepo(ctx, 'audit').remove(id)).toThrow(StorageOperationError);
    expect(() => crudRepo(ctx, 'weights').listByIndex('kg', 1, 2)).toThrow(StorageOperationError);
  });

  it('the middleware keeps Kickstart checks append-only and periods unremovable, even for raw writes', async () => {
    const test = await openTestDb({ env: testEnv('2000-03-01T12:00:00.000Z', 'UTC') });
    const period = await test.repos.kickstart.startPeriod();
    const check = {
      id: test.env.randomId(),
      periodId: period.id,
      askedAt: '2000-03-19T12:00:00.000Z',
      timeZone: 'UTC',
      dizzyOnStanding: 'no',
      palpitations: 'no',
      crampsNotSettling: 'no',
      faintAtWork: 'no',
      energyRating: null,
      sleepRating: null,
      outcome: 'extended',
    } as const;
    await test.db.kickstart_checks.add(check);
    await expect(test.db.kickstart_checks.put(check)).rejects.toBeInstanceOf(StorageOperationError);
    await expect(test.db.kickstart_checks.delete(check.id)).rejects.toBeInstanceOf(
      StorageOperationError,
    );
    await expect(test.db.kickstart_periods.delete(period.id)).rejects.toBeInstanceOf(
      StorageOperationError,
    );
    await expect(
      test.db.kickstart_periods.where(':id').between(period.id, period.id, true, true).delete(),
    ).rejects.toBeInstanceOf(StorageOperationError);
    expect(await test.db.kickstart_checks.count()).toBe(1);
    expect(await test.db.kickstart_periods.count()).toBe(1);
    // A clear (import and upgrade) is allowed.
    await test.db.kickstart_checks.clear();
    await test.db.kickstart_periods.clear();
    expect(await test.db.kickstart_periods.count()).toBe(0);
  });

  it('transfer_pairings has no repository at item 12; it is written raw and validated', async () => {
    const test = await openTestDb();
    await expect(
      test.db.transfer_pairings.put({
        id: 'singleton',
        relayUrl: 'http://not-https.example.com',
        roomId: 'ExampleRoomId00000000A',
        key: {} as never,
        pairedAt: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(StorageValidationError);
  });
});

describe('special repositories (section 8.2; section 16 test 24)', () => {
  it('fasts: start refuses while one runs, running() finds it, a planned 1470 minutes stores null', async () => {
    const test = await openTestDb();
    const fast = await test.repos.fasts.start({ plannedFastMinutes: 1470 });
    expect(fast.plannedFastMinutes).toBeNull();
    expect(await test.repos.fasts.running()).toEqual(fast);
    await expect(test.repos.fasts.start()).rejects.toMatchObject({ rule: 'fast-running' });
    test.env.advanceDays(1);
    const ended = await test.repos.fasts.end(fast.id);
    expect(ended.endedAt).toBe(test.env.now());
    expect(ended.endedTimeZone).toBe('Pacific/Auckland');
    expect(await test.repos.fasts.running()).toBeUndefined();
    await expect(test.repos.fasts.end(fast.id)).rejects.toMatchObject({ rule: 'already-ended' });
    const next = await test.repos.fasts.start({ plannedFastMinutes: 1380 });
    expect(next.plannedFastMinutes).toBe(1380);
    // Section 5 rule 3 on update: a start moved before the previous end overlaps.
    await expect(
      test.repos.fasts.update(next.id, { startedAt: fast.startedAt }),
    ).rejects.toBeInstanceOf(StorageInvariantError);
  });

  describe('kickstart (the cap and window cases of test 5, through the repository)', () => {
    const day = (n: number) => `2000-03-${String(n).padStart(2, '0')}T12:00:00.000Z`;
    const yes = {
      dizzyOnStanding: 'no',
      palpitations: 'no',
      crampsNotSettling: 'no',
      faintAtWork: 'no',
    } as const;
    /** A clock in UTC, so Kickstart day N is 1 March + N − 1. */
    const at = (test: TestDb, n: number) => {
      const start = Date.parse('2000-03-01T12:00:00.000Z');
      test.env.set(new Date(start + (n - 1) * 86_400_000).toISOString());
    };
    const open = () => openTestDb({ env: testEnv(day(1), 'UTC') });

    it('a check on day 3 is too early; day 19 (the last 3 days) extends; day 22 of an unextended period is too late', async () => {
      const test = await open();
      await test.repos.kickstart.startPeriod();
      at(test, 3);
      await expect(test.repos.kickstart.recordCheck(yes)).rejects.toMatchObject({
        rule: 'kickstart-check-window',
      });
      at(test, 19);
      expect((await test.repos.kickstart.recordCheck(yes)).outcome).toBe('extended');
      const other = await open();
      await other.repos.kickstart.startPeriod();
      at(other, 22);
      await expect(other.repos.kickstart.recordCheck(yes)).rejects.toMatchObject({
        rule: 'kickstart-check-window',
      });
    });

    it('palpitations yes is a stop-sign, the extension count is unchanged, and no check follows it', async () => {
      const test = await open();
      await test.repos.kickstart.startPeriod();
      at(test, 19);
      const check = await test.repos.kickstart.recordCheck({ ...yes, palpitations: 'yes' });
      expect(check.outcome).toBe('stop-sign');
      expect(
        (await test.repos.kickstart.listChecks()).filter((c) => c.outcome === 'extended'),
      ).toEqual([]);
      at(test, 20);
      await expect(test.repos.kickstart.recordCheck(yes)).rejects.toMatchObject({
        rule: 'kickstart-stop-sign',
      });
    });

    it('three extensions use the 42 days: a 4th extension and a new period are refused', async () => {
      const test = await open();
      await test.repos.kickstart.startPeriod();
      for (const n of [19, 26, 33]) {
        at(test, n);
        expect((await test.repos.kickstart.recordCheck(yes)).outcome).toBe('extended');
      }
      at(test, 40);
      await expect(test.repos.kickstart.recordCheck(yes)).rejects.toMatchObject({
        rule: 'kickstart-extensions',
      });
      at(test, 43);
      await expect(test.repos.kickstart.startPeriod()).rejects.toMatchObject({
        rule: 'kickstart-days',
      });
    });

    it('two 21-day periods are allowed (42 days); a 28-day first period refuses a new one', async () => {
      const two = await open();
      await two.repos.kickstart.startPeriod();
      at(two, 22);
      await two.repos.kickstart.startPeriod();
      expect(await two.repos.kickstart.listPeriods()).toHaveLength(2);
      const long = await open();
      await long.repos.kickstart.startPeriod();
      at(long, 19);
      await long.repos.kickstart.recordCheck(yes);
      at(long, 29);
      await expect(long.repos.kickstart.startPeriod()).rejects.toMatchObject({
        rule: 'kickstart-days',
      });
    });

    it('an early end on day 10, then a 21-day period with one extension (38) is allowed and a second (45) is refused', async () => {
      const test = await open();
      await test.repos.kickstart.startPeriod();
      at(test, 10);
      const ended = await test.repos.kickstart.endPeriod('user-ended');
      expect(ended).toMatchObject({ endReason: 'user-ended', endedTimeZone: 'UTC' });
      await expect(test.repos.kickstart.endPeriod('user-ended')).rejects.toMatchObject({
        rule: 'kickstart-end',
      });
      at(test, 11);
      await test.repos.kickstart.startPeriod();
      at(test, 29);
      expect((await test.repos.kickstart.recordCheck(yes)).outcome).toBe('extended');
      at(test, 36);
      await expect(test.repos.kickstart.recordCheck(yes)).rejects.toMatchObject({
        rule: 'kickstart-days',
      });
    });

    it('a second period cannot start while one is running', async () => {
      const test = await open();
      await test.repos.kickstart.startPeriod();
      at(test, 5);
      await expect(test.repos.kickstart.startPeriod()).rejects.toMatchObject({
        rule: 'kickstart-overlap',
      });
    });
  });

  it('readiness: a confirmation needs its question answered, and re-answering q3 deletes it in the same transaction', async () => {
    const test = await openTestDb();
    await expect(test.repos.readiness.answer('prescriberAgreed', 'yes')).rejects.toMatchObject({
      rule: 'confirmation-without-answer',
    });
    await test.repos.readiness.answer('q3', 'yes');
    await test.repos.readiness.answer('prescriberAgreed', 'yes');
    expect((await test.repos.readiness.list()).map((r) => r.questionId).sort()).toEqual([
      'prescriberAgreed',
      'q3',
    ]);
    await test.repos.readiness.answer('q3', 'yes');
    expect((await test.repos.readiness.list()).map((r) => r.questionId)).toEqual(['q3']);
    await test.repos.readiness.answer('q6', 'yes');
    await test.repos.readiness.answer('gpExerciseDiscussed', 'yes');
    await test.repos.readiness.answer('q6', 'no');
    expect((await test.repos.readiness.list()).map((r) => r.questionId).sort()).toEqual([
      'q3',
      'q6',
    ]);
    const row = (await test.repos.readiness.list())[0];
    expect(row).toMatchObject({ wordingVersion: 1, answeredAt: test.env.now() });
    await test.repos.readiness.clear('q3');
    expect((await test.repos.readiness.list()).map((r) => r.questionId)).toEqual(['q6']);
  });

  it('drinks: log computes the figures with core, update recomputes them, and forDrinkingDays crosses midnight', async () => {
    const test = await openTestDb();
    const label = {
      volumeMl: 330,
      abvPercent: 5,
      standardDrinks: null,
      kcal: 94,
      energyAsEntered: { value: 94, unit: 'kcal' as const },
      origin: 'owner' as const,
    };
    const beverage = { volumeMl: 330, abvPercent: 5, label };
    const logged = await test.repos.drinks.log({
      beverageId: null,
      name: 'Example premix',
      beverage,
      count: 2,
      at: '2000-01-01T10:30:00.000Z', // 23:30 on 1 January in Auckland
    });
    expect(logged.stdSource).toBe('calculated');
    expect(logged.stdDrinksPerServe).toBeCloseTo(1.30185, 5);
    expect(logged.kcalPerServe).toBe(94);
    const printed = await test.repos.drinks.log({
      beverageId: null,
      name: 'Example lager',
      beverage: { ...beverage, label: { ...label, standardDrinks: 1.4 } },
      count: 1,
      at: '2000-01-01T12:30:00.000Z', // 01:30 on 2 January: still the evening of 1 January
    });
    expect(printed).toMatchObject({ stdSource: 'label', stdDrinksPerServe: 1.4 });
    const later = await test.repos.drinks.log({
      beverageId: null,
      name: 'Example premix',
      beverage,
      count: 1,
      at: '2000-01-01T17:00:00.000Z', // 06:00 on 2 January
    });
    const edited = await test.repos.drinks.update(logged.id, {
      count: 3,
      beverage: { ...beverage, volumeMl: 440 },
    });
    expect(edited).toMatchObject({ count: 3, stdSource: 'calculated', kcalPerServe: null });
    expect(edited.stdDrinksPerServe).toBeCloseTo(1.7358, 4);
    const firstEvening = await test.repos.drinks.forDrinkingDays('2000-01-01', '2000-01-01');
    expect(firstEvening.map((d) => d.id).sort()).toEqual([logged.id, printed.id].sort());
    expect(
      (await test.repos.drinks.forDrinkingDays('2000-01-02', '2000-01-02')).map((d) => d.id),
    ).toEqual([later.id]);
    await test.repos.drinks.remove(later.id);
    expect(await test.repos.drinks.get(later.id)).toBeUndefined();
  });

  it('card state: upserts by card and trigger, and a dismissal stores its zone', async () => {
    const test = await openTestDb();
    const dismissed = await test.repos.cardState.dismiss('backup-reminder', 'weekly');
    expect(dismissed).toEqual({
      cardId: 'backup-reminder',
      trigger: 'weekly',
      firstShownAt: test.env.now(),
      dismissedAt: test.env.now(),
      dismissedTimeZone: 'Pacific/Auckland',
      doneAt: null,
    });
    test.env.advanceDays(1);
    const shown = await test.repos.cardState.markShown('backup-reminder', 'weekly');
    expect(shown.firstShownAt).toBe(dismissed.firstShownAt);
    await test.repos.cardState.done('update-notice', 'v2');
    expect(await test.repos.cardState.get('update-notice', 'v2')).toMatchObject({
      doneAt: test.env.now(),
    });
    expect(await test.db.card_state.count()).toBe(2);
    await expect(test.repos.cardState.dismiss('backup-reminder', 'daily')).rejects.toBeInstanceOf(
      StorageValidationError,
    );
  });

  it('garden photos: refused for an unknown garden row; removing a garden row removes its photo', async () => {
    const test = await openTestDb();
    await expect(
      test.repos.gardenPhotos.put(test.env.randomId(), photoRow('unused')),
    ).rejects.toMatchObject({ rule: 'garden-photo' });
    const [silverbeet] = await test.repos.garden.list();
    if (silverbeet === undefined) throw new Error('no seeded garden row');
    await test.repos.gardenPhotos.put(silverbeet.id, photoRow('ignored'));
    expect((await test.db.garden_photos.toArray()).map((p) => p.gardenId)).toEqual([silverbeet.id]);
    expect(await test.repos.gardenPhotos.get(silverbeet.id)).toMatchObject({ width: 640 });
    await test.repos.garden.remove(silverbeet.id);
    expect(await test.db.garden_photos.count()).toBe(0);
  });

  it('weights: one onboarding weight only, and between() reads local dates in each row’s own zone', async () => {
    const test = await openTestDb();
    await test.repos.weights.addOnboardingWeight({
      kg: 100,
      note: null,
      at: '2000-01-01T11:30:00.000Z',
    });
    await expect(
      test.repos.weights.addOnboardingWeight({ kg: 99, note: null }),
    ).rejects.toMatchObject({ rule: 'weight-onboarding' });
    await test.repos.weights.create({
      kg: 99,
      source: 'manual',
      note: null,
      at: '2000-01-02T10:00:00.000Z',
      timeZone: 'Pacific/Honolulu',
    });
    // 11:30Z on 1 January is 00:30 on 2 January in Auckland; 10:00Z on 2 January is 00:00 in Honolulu.
    const kgs = (await test.repos.weights.between('2000-01-02', '2000-01-02')).map((w) => w.kg);
    expect(kgs.sort((a, b) => a - b)).toEqual([99, 100]);
    expect(await test.repos.weights.between('2000-01-01', '2000-01-01')).toEqual([]);
  });
});

describe('normalisation and write-time checks (section 8.3; section 16 test 25)', () => {
  it('a note with Windows line endings and a tab saves with \\n and a space; a name with a newline saves with a space; -0 saves as 0', async () => {
    const test = await openTestDb();
    const weight = await test.repos.weights.create({
      kg: 100,
      source: 'manual',
      note: '  First line\r\nSecond\tline  ',
    });
    expect(weight.note).toBe('First line\nSecond line');
    const blank = await test.repos.weights.create({ kg: 100, source: 'manual', note: ' \r\n ' });
    expect(blank.note).toBeNull();
    const food = await test.repos.pantry.create({
      ingredientId: null,
      name: 'Example\nflour',
      amount: -0,
      unit: 'g',
    });
    expect(food.name).toBe('Example flour');
    expect(Object.is(food.amount, 0)).toBe(true);
  });

  it('a zone this Intl does not know is refused on write, but an old row in such a zone can still be edited', async () => {
    const test = await openTestDb();
    await expect(
      test.repos.weights.create({
        kg: 100,
        source: 'manual',
        note: null,
        timeZone: 'Example/Nowhere',
      }),
    ).rejects.toMatchObject({ table: 'weights', field: 'timeZone', rule: 'zone-unknown' });
    const id = test.env.randomId();
    await test.db.weights.add({
      id,
      at: '2000-01-01T00:00:00.000Z',
      timeZone: 'Example/Nowhere',
      kg: 100,
      source: 'manual',
      note: null,
    });
    const edited = await test.repos.weights.update(id, { note: 'Example edit' });
    expect(edited).toMatchObject({ timeZone: 'Example/Nowhere', note: 'Example edit' });
  });

  it('a birth year after this year is refused with future-year', async () => {
    const test = await openTestDb();
    await expect(test.repos.profile.update({ birthYear: 2001 })).rejects.toMatchObject({
      table: 'profile',
      field: 'birthYear',
      rule: 'future-year',
    });
    expect((await test.repos.profile.update({ birthYear: 1970 })).birthYear).toBe(1970);
  });
});

describe('storage edge cases', () => {
  it('a full phone aborts the write, saves nothing, and says so in plain words (section 7.6)', async () => {
    const quota = failingWrite(
      'weights',
      'add',
      () => new DOMException('full', 'QuotaExceededError'),
    );
    const test = await openTestDb({ extraMiddleware: [quota.middleware] });
    quota.arm();
    const failure = test.repos.weights.create({ kg: 100, source: 'manual', note: null });
    await expect(failure).rejects.toBeInstanceOf(StorageFullError);
    await expect(failure).rejects.toThrow(privacy.storageFull);
    expect(await test.db.weights.count()).toBe(0);
  });

  it('PWA-06: setting onboardingCompletedAt the first time asks for persistent storage, and only then', async () => {
    const onOnboardingCompleted = vi.fn();
    const test = await openTestDb({ hooks: { onOnboardingCompleted } });
    await test.repos.settings.update({ theme: 'dark' });
    expect(onOnboardingCompleted).not.toHaveBeenCalled();
    await test.repos.settings.update({ onboardingCompletedAt: test.env.now() });
    expect(onOnboardingCompleted).toHaveBeenCalledOnce();
    test.env.advanceDays(1);
    await test.repos.settings.update({ onboardingCompletedAt: test.env.now() });
    await test.repos.settings.recordBackup(test.env.now());
    expect(onOnboardingCompleted).toHaveBeenCalledOnce();
  });

  it('sessions: completedAt and its zone are set when the status becomes done, and cleared otherwise', async () => {
    const test = await openTestDb();
    const planned = await test.repos.sessions.create({
      date: '2000-03-01',
      templateId: 'seed:example-session',
      status: 'planned',
      movements: [],
      preCheck: null,
      exertion: null,
      soreness: null,
      energy: null,
      durationMinutes: null,
      note: null,
    });
    expect(planned).toMatchObject({ completedAt: null, timeZone: null });
    test.env.advanceDays(1);
    const done = await test.repos.sessions.update(planned.id, { status: 'done', exertion: 3 });
    expect(done).toMatchObject({ completedAt: test.env.now(), timeZone: 'Pacific/Auckland' });
    test.env.advanceDays(1);
    const edited = await test.repos.sessions.update(planned.id, { note: 'Example note' });
    expect(edited.completedAt).toBe(done.completedAt);
    const rested = await test.repos.sessions.update(planned.id, {
      status: 'rested',
      exertion: null,
    });
    expect(rested).toMatchObject({ completedAt: null, timeZone: null });
  });

  it('recordBackup changes only lastBackupAt', async () => {
    const test = await openTestDb();
    const before = await test.repos.settings.get();
    const after = await test.repos.settings.recordBackup('2000-03-01T00:00:00.000Z');
    expect(after).toEqual({ ...before, lastBackupAt: '2000-03-01T00:00:00.000Z' });
  });

  it('a missing row is reported without its key', async () => {
    const test = await openTestDb();
    const key = test.env.randomId();
    const failure = test.repos.weights.update(key, { note: 'x' });
    await expect(failure).rejects.toBeInstanceOf(StorageRuleError);
    await expect(failure).rejects.not.toThrow(key);
  });

  it('errors carry no values: sentinels written through every repository and middleware failure are absent (section 16 test 21)', async () => {
    const test = await openTestDb();
    const failures: unknown[] = [];
    const capture = async (attempt: () => Promise<unknown>) => {
      try {
        await attempt();
      } catch (error) {
        failures.push(error);
      }
    };
    await capture(() =>
      test.repos.weights.create({
        kg: 123.456,
        source: 'manual',
        note: 'zzsentinel',
        timeZone: 'Example/Nowhere',
      }),
    );
    await capture(() =>
      test.repos.alcoholDayNotes.create({
        date: '2000-02-29',
        note: 'zzsentinel'.repeat(200),
        withdrawalTick: false,
      }),
    );
    await capture(() =>
      test.db.weights.put({
        id: test.env.randomId(),
        at: '2000-01-01T00:00:00.000Z',
        timeZone: 'UTC',
        kg: 123.456,
        source: 'manual',
        note: 'zzsentinel\u0000',
      }),
    );
    await capture(() =>
      test.db.alcohol_day_notes.put({
        date: '2000-02-29',
        note: null,
        withdrawalTick: false,
        enteredAt: '2000-01-01T00:00:00.000Z',
        timeZone: 'UTC',
        updatedAt: '2000-01-01T00:00:00.000Z',
      }),
    );
    expect(failures).toHaveLength(4);
    for (const error of failures) {
      const text = [String(error), (error as Error).message, (error as Error).stack ?? ''].join(
        '\n',
      );
      for (const sentinel of ['123.456', 'zzsentinel', '2000-02-29'])
        expect(text).not.toContain(sentinel);
      expect((error as { cause?: unknown }).cause).toBeUndefined();
    }
  });
});
