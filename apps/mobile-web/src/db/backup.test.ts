// @vitest-environment node
// Backup through the real database (storage spec sections 10 and 9.5; section 16 tests 26 to 30,
// 33 to 35, and import fuzzing through the app's own path; BK-01, BK-02, BK-07, BK-09, BK-10,
// HS-15, RD-08). Real Dexie over fake-indexeddb.
import {
  activeHelpTriggers,
  BackupError,
  backupReminder,
  buildBackupPayload,
  bytesToBase64,
  canStartKickstart,
  checkInvariants,
  createBackupFile,
  createRescueFile,
  elapsedDaysSince,
  FUTURE_INSTANT_TOLERANCE_MS,
  kickstartUsage,
  missingReadinessAnswers,
  migrateSnapshot,
  plainBackupText,
  readinessInputFromRows,
  type Snapshot,
  validateSnapshot,
} from '@diet/core';
import {
  chainB,
  fixtureEnv,
  fixtureId,
  lockedReferenceEnvelopeV1,
  mulberry32,
  mutateBackupText,
  plainReferenceEnvelopeV1,
  REFERENCE_PHRASE_V1,
  snapshotV1,
  SYNTHETIC_PHRASE,
} from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { loadDrinksData } from '../screens/drinks/load';
import { deleteAllData } from './deleteAll';
import { createExport, createRescueCopy } from './exportBackup';
import {
  decodeImport,
  type ImportFile,
  planImport,
  rowsToWrite,
  writeImport,
  type WriteDeps,
} from './importBackup';
import { replaceAll } from './snapshot';
import {
  backupSnapshot,
  counts,
  failingWrite,
  freshDeps,
  memoryStorage,
  onboardForTests,
  openTestDb,
  pairingRow,
  savePairingForTests,
  PHOTO_BYTES,
  photoRow,
  rawWriter,
  type TestDb,
  testEnv,
} from './testKit';
import { STORES_V1 } from '@diet/core';

const asFile = (text: string): ImportFile => ({
  text,
  sizeBytes: new TextEncoder().encode(text).length,
});

const writeDeps = (): WriteDeps & { reloads: number } => {
  const deps = {
    reloads: 0,
    postGate: () => undefined,
    locks: null,
    requestPersistentStorage: () => Promise.resolve(),
    reload: () => {
      deps.reloads += 1;
    },
  };
  return deps;
};

/** Fills every backed-up store from the version-1 fixture (the import writer is the quickest way). */
async function fillWithFixture(test: TestDb): Promise<void> {
  await replaceAll(test.db, snapshotV1);
}

async function deleteEverything(test: TestDb): Promise<void> {
  const result = await deleteAllData({
    db: test.db,
    gate: test.db.gate,
    postGate: () => undefined,
    locks: null,
    indexedDB: test.deps.indexedDB,
    caches: undefined,
    localStorage: () => memoryStorage(),
    sessionStorage: () => memoryStorage(),
    revokeObjectUrls: () => undefined,
    reload: () => undefined,
  });
  expect(result).toEqual({ ok: true, failed: [], blocked: false, recordsDeleted: true });
}

/** Imports a file into the database of `test`, then opens it again as the reload would. */
async function importAndReload(
  test: TestDb,
  text: string,
  password: string | null,
): Promise<TestDb> {
  const decoded = await decodeImport(asFile(text), password, test.env);
  const plan = await planImport(test.db, decoded);
  const deps = writeDeps();
  expect(await writeImport(test.db, plan, test.env, deps)).toEqual({ ok: true });
  expect(deps.reloads).toBe(1);
  test.db.shutDown();
  return openTestDb({ deps: test.deps, env: test.env });
}

function expectNoDeviceData(text: string): void {
  const raw = String.fromCharCode(...PHOTO_BYTES);
  for (const leak of [
    'ExampleRoomId00000000A',
    'https://relay.example.com/room',
    bytesToBase64(PHOTO_BYTES),
    raw,
    '"bytes":',
    '"key":',
    '"roomId":',
    '"relayUrl":',
  ]) {
    expect(text.includes(leak), leak).toBe(false);
  }
}

describe('BK-01 / HS-15: round trip through the real database (section 10.8; section 16 test 26)', () => {
  it.each([
    ['plain', null],
    ['locked', SYNTHETIC_PHRASE],
  ] as const)(
    '%s: export, Yes, delete all, import gives every record back exactly; pairing and photos are gone',
    async (_name, password) => {
      const test = await openTestDb();
      await fillWithFixture(test);
      // The fixture holds a sent and acknowledged grocery list with a transferId.
      expect(
        snapshotV1.grocery_lists.some((l) => l.transferId !== null && l.receivedVersion !== null),
      ).toBe(true);
      await savePairingForTests(test);
      const gardenId = snapshotV1.garden[0]?.id ?? '';
      await test.db.garden_photos.put(photoRow(gardenId));

      const exported = await createExport(test.db, test.env, password);
      if (!exported.ok) throw exported.error;
      expect(exported.fileName).toBe(
        password === null ? 'diet-backup-2000-03-01.json' : 'diet-backup-2000-03-01-locked.json',
      );
      await test.repos.settings.recordBackup(exported.file.exportedAt);
      const before = await backupSnapshot(test.db);
      expect(before.settings[0]?.lastBackupAt).toBe(exported.file.exportedAt);
      if (password === null) expectNoDeviceData(exported.file.text);

      await deleteEverything(test);
      const fresh = await openTestDb({ deps: test.deps, env: test.env });
      expect((await counts(fresh.db))['weights']).toBe(0);
      const after = await importAndReload(fresh, exported.file.text, password);

      expect(await backupSnapshot(after.db)).toStrictEqual(before);
      expect(await after.db.transfer_pairings.count()).toBe(0);
      expect(await after.db.garden_photos.count()).toBe(0);
    },
  );
});

describe('BK-02: a wrong password imports nothing (section 16 test 27)', () => {
  it('leaves dataset B exactly as it was, lastBackupAt included, and a retry with the right password gives A', async () => {
    const a = await openTestDb();
    await fillWithFixture(a);
    const exported = await createExport(a.db, a.env, SYNTHETIC_PHRASE);
    if (!exported.ok) throw exported.error;

    const b = await openTestDb({ env: testEnv('2000-04-01T00:00:00.000Z') });
    await b.repos.weights.create({ kg: 100, source: 'manual', note: null });
    await b.repos.settings.recordBackup('2000-03-31T00:00:00.000Z');
    const datasetB = await backupSnapshot(b.db);

    const wrong = 'not the phrase used here';
    await expect(decodeImport(asFile(exported.file.text), wrong, b.env)).rejects.toMatchObject({
      code: 'wrong-password-or-damaged',
      message: 'Wrong password, or the file is damaged. Nothing was imported.',
    });
    expect(await backupSnapshot(b.db)).toStrictEqual(datasetB);

    const after = await importAndReload(b, exported.file.text, SYNTHETIC_PHRASE);
    const datasetA = await backupSnapshot(after.db);
    expect(datasetA.weights).toEqual(snapshotV1.weights);
    expect(datasetA.settings[0]?.lastBackupAt).toBe(exported.file.exportedAt);
  });
});

describe('all or nothing (BK-07; section 16 test 28)', () => {
  it.each([
    ['a failure on the last store written (audit)', 'audit', () => new Error('Example failure')],
    ['a full phone', 'weights', () => new DOMException('full', 'QuotaExceededError')],
  ] as const)(
    '%s: write-failed, nothing changed, and the snapshot shown is offered as a rescue copy',
    async (_name, table, error) => {
      const failing = failingWrite(table, 'add', error);
      const test = await openTestDb({ extraMiddleware: [failing.middleware] });
      await test.repos.weights.create({ kg: 100, source: 'manual', note: null });
      const before = await backupSnapshot(test.db);
      const decoded = await decodeImport(asFile(plainReferenceEnvelopeV1()), null, test.env);
      const plan = await planImport(test.db, decoded);
      failing.arm();
      const deps = writeDeps();
      const outcome = await writeImport(test.db, plan, test.env, deps);
      expect(outcome.ok).toBe(false);
      if (outcome.ok || outcome.blocked || outcome.changed)
        throw new Error('expected a failed write');
      expect(outcome.error).toBeInstanceOf(BackupError);
      expect(outcome.error.code).toBe('write-failed');
      expect(outcome.error.message).toBe(
        'The backup could not be written to this phone. Nothing was changed.',
      );
      expect(deps.reloads).toBe(0);
      expect(await backupSnapshot(test.db)).toStrictEqual(before);
      expect(outcome.phone).toStrictEqual(before);
      const rescue = await createRescueCopy(
        { snapshot: outcome.phone, exportedAt: test.env.now() },
        test.env,
        SYNTHETIC_PHRASE,
      );
      expect(rescue.fileName).toBe('diet-backup-2000-03-01-rescue-locked.json');
      const reread = await decodeImport(asFile(rescue.file.text), SYNTHETIC_PHRASE, test.env);
      expect(reread.snapshot.weights).toEqual(before.weights);
    },
  );
});

describe('replace semantics and the confirmation (D17; section 16 test 29)', () => {
  it('counts what the phone would lose, defaults to exporting first, and replaces everything', async () => {
    const test = await openTestDb();
    await fillWithFixture(test);
    const exported = await createExport(test.db, test.env, null);
    if (!exported.ok) throw exported.error;
    await test.repos.settings.recordBackup(exported.file.exportedAt);

    test.env.advanceDays(1);
    const extraWeight = await test.repos.weights.create({ kg: 100, source: 'manual', note: null });
    const extraGarden = await test.repos.garden.create({
      ingredientId: null,
      name: 'Example herb',
      amount: null,
      unit: null,
      gramsPerUnit: null,
      harvestReady: false,
      harvestedAt: null,
      perishabilityDays: null,
    });
    const recipe = snapshotV1.recipes[0];
    if (recipe === undefined) throw new Error('no fixture recipe');
    await test.repos.recipes.update(recipe.id, { title: 'Example renamed recipe' });
    const keptGarden = snapshotV1.garden[0]?.id ?? '';
    await test.db.garden_photos.bulkPut([photoRow(keptGarden), photoRow(extraGarden.id)]);
    await savePairingForTests(test);

    const decoded = await decodeImport(asFile(exported.file.text), null, test.env);
    const plan = await planImport(test.db, decoded);
    // The confirmation says "The laptop pairing will be removed." only for a paired phone (A2).
    expect(plan.paired).toBe(true);
    expect(plan.confirmation).toEqual({
      missingFromFile: 2,
      differFromFile: 1,
      phoneNewest: test.env.now(),
      fileNewest: expect.any(String) as string,
      phoneHasOwnRecords: true,
      exportFirst: true,
    });
    expect((plan.confirmation.fileNewest ?? '') < test.env.now()).toBe(true);
    expect(plan.counts.find((c) => c.table === 'weights')?.count).toBe(snapshotV1.weights.length);

    const deps = writeDeps();
    expect(await writeImport(test.db, plan, test.env, deps)).toEqual({ ok: true });
    test.db.shutDown();
    const after = await openTestDb({ deps: test.deps, env: test.env });
    expect(await after.db.weights.get(extraWeight.id)).toBeUndefined();
    expect((await after.db.recipes.get(recipe.id))?.title).toBe(recipe.title);
    expect(await after.db.transfer_pairings.count()).toBe(0);
    expect((await after.db.garden_photos.toArray()).map((p) => p.gardenId)).toEqual([keptGarden]);
  });

  it('a brand-new phone, or one just cleared by delete-all, holds nothing of the owner\u2019s: no loss is counted and Replace is the default', async () => {
    const test = await openTestDb({ env: testEnv('2026-10-19T00:00:00.000Z') });
    // Setup offers a restore only after the alcohol notice, whose acknowledgement it stores (C53;
    // full review F14): that is not a record of the owner's.
    await test.repos.settings.update({ alcoholNoticeAckAt: test.env.now() });
    const decoded = await decodeImport(asFile(plainReferenceEnvelopeV1()), null, test.env);
    const fresh = await planImport(test.db, decoded);
    expect(fresh.confirmation).toEqual({
      missingFromFile: 0,
      differFromFile: 0,
      phoneNewest: null,
      fileNewest: expect.any(String) as string,
      phoneHasOwnRecords: false,
      exportFirst: false,
    });
    await replaceAll(test.db, decoded.snapshot);
    await deleteEverything(test);
    const cleared = await openTestDb({ deps: test.deps, env: test.env });
    await cleared.repos.settings.update({ alcoholNoticeAckAt: cleared.env.now() });
    expect((await planImport(cleared.db, decoded)).confirmation).toMatchObject({
      missingFromFile: 0,
      differFromFile: 0,
      phoneHasOwnRecords: false,
      exportFirst: false,
    });
    // Once the owner changes a seed row, it is theirs. Delete-all cleared the alcohol notice, which
    // a preset write needs first (item 28).
    await onboardForTests(cleared, { weightKg: null });
    const [drink] = await cleared.repos.beverages.list();
    if (drink === undefined) throw new Error('no seeded drink');
    await cleared.repos.beverages.update(drink.id, { name: 'Example lager' });
    expect((await planImport(cleared.db, decoded)).confirmation).toMatchObject({
      missingFromFile: 1,
      phoneHasOwnRecords: true,
      exportFirst: true,
    });
  });

  it('a phone that matches the file makes Replace the default', async () => {
    const decoded = await decodeImport(
      asFile(plainReferenceEnvelopeV1()),
      null,
      (await openTestDb()).env,
    );
    const same = await openTestDb();
    await replaceAll(same.db, decoded.snapshot);
    // A backup confirmed since is bookkeeping, not a change to the records.
    await same.repos.settings.recordBackup('2000-03-01T00:00:00.000Z');
    expect((await planImport(same.db, decoded)).confirmation).toMatchObject({
      missingFromFile: 0,
      differFromFile: 0,
      exportFirst: false,
    });
  });

  it.each([
    [
      'an edited weigh-in (no updatedAt)',
      async (t: TestDb) => {
        const weight = snapshotV1.weights[1];
        if (weight === undefined) throw new Error('fixture');
        await t.repos.weights.update(weight.id, { kg: 88.8 });
      },
    ],
    [
      'an edited fast note',
      async (t: TestDb) => {
        const fast = snapshotV1.fasts.find((f) => f.endedAt !== null);
        if (fast === undefined) throw new Error('fixture');
        await t.repos.fasts.update(fast.id, { note: 'Example changed note' });
      },
    ],
    [
      'a changed setting',
      async (t: TestDb) => {
        await t.repos.settings.update({ drinkingDayCutoverMinutes: 0 });
      },
    ],
  ] as const)(
    '%s after the export counts as a record that differs, and exporting first becomes the default (data-loss review)',
    async (_name, edit) => {
      const test = await openTestDb();
      await fillWithFixture(test);
      const exported = await createExport(test.db, test.env, null);
      if (!exported.ok) throw exported.error;
      test.env.advanceDays(7);
      await edit(test);
      const decoded = await decodeImport(asFile(exported.file.text), null, test.env);
      expect((await planImport(test.db, decoded)).confirmation).toMatchObject({
        missingFromFile: 0,
        differFromFile: 1,
        exportFirst: true,
      });
    },
  );
});

describe('an import whose migration changed values (section 9.2; D13)', () => {
  it('marks the update-notice card shown, so Today lists what changed', async () => {
    const test = await openTestDb();
    const tables = structuredClone(snapshotV1) as unknown as Record<
      string,
      Record<string, unknown>[]
    >;
    for (const t of tables['targets'] ?? []) t['steadyDeficitPct'] = 20;
    // The fixture already holds a v2 notice; this file comes from before it.
    tables['card_state'] = (tables['card_state'] ?? []).filter(
      (c) => c['cardId'] !== 'update-notice',
    );
    const file = await createRescueFile({
      tables,
      schemaVersion: 1,
      exportedAt: '2000-03-01T00:00:00.000Z',
      appVersion: '0.1.0',
      password: null,
    });
    const decoded = await decodeImport(asFile(file.text), null, test.env, chainB);
    expect(decoded.updateNotice).toBe('v2');
    const rows = rowsToWrite(decoded, test.env);
    expect(rows.card_state.filter((c) => c.cardId === 'update-notice')).toEqual([
      expect.objectContaining({ trigger: 'v2', firstShownAt: test.env.now(), doneAt: null }),
    ]);
    expect(rowsToWrite({ ...decoded, updateNotice: null }, test.env)).toBe(decoded.snapshot);
  });
});

describe('RD-08: readiness after an import (section 16 test 30)', () => {
  it('a backup with no readiness rows leaves every gate input gated', async () => {
    const test = await openTestDb();
    await test.repos.readiness.answer('q1', 'no');
    const tables = { ...structuredClone(snapshotV1), readiness: [] } as Snapshot;
    const exported = await createExport(
      await (async () => {
        const source = await openTestDb();
        await replaceAll(source.db, tables);
        return source.db;
      })(),
      test.env,
      null,
    );
    if (!exported.ok) throw exported.error;
    const after = await importAndReload(test, exported.file.text, null);
    const rows = await after.repos.readiness.list();
    expect(rows).toEqual([]);
    const input = readinessInputFromRows(rows, 1970, '2000-03-01');
    expect(Object.values(input.answers)).toEqual([null, null, null, null, null, null, null]);
    expect(missingReadinessAnswers(input)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  });
});

describe('BK-09: the fixed version-1 reference files (C99; section 16 test 33)', () => {
  it.each([
    ['plain', plainReferenceEnvelopeV1, null],
    ['locked', lockedReferenceEnvelopeV1, 'reference'],
  ] as const)(
    'the %s reference file decodes, imports, and equals migrateSnapshot(1, snapshotV1)',
    async (_name, envelope, needs) => {
      const test = await openTestDb();
      const phrase = needs === null ? null : REFERENCE_PHRASE_V1;
      const after = await importAndReload(test, envelope(), phrase);
      const expected = migrateSnapshot(
        1,
        structuredClone(snapshotV1) as never,
        fixtureEnv(),
      ).snapshot;
      expect(await backupSnapshot(after.db)).toStrictEqual(expected);
    },
  );
});

describe('BK-10: the rescue copy (section 9.5; section 16 test 34)', () => {
  it('is named -rescue-locked.json when locked, is built from the allow-list, and never sets lastBackupAt', async () => {
    const test = await openTestDb();
    await fillWithFixture(test);
    const snapshot = await backupSnapshot(test.db);
    const withStray = {
      ...snapshot,
      weights: snapshot.weights.map((w) => ({ ...w, stray: 'Example stray field' })),
    } as unknown as Snapshot;
    const locked = await createRescueCopy(
      { snapshot: withStray, exportedAt: test.env.now() },
      test.env,
      SYNTHETIC_PHRASE,
    );
    expect(locked.fileName).toMatch(/-rescue-locked\.json$/);
    expect(locked.file).toMatchObject({ kind: 'rescue', locked: true });
    const plain = await createRescueCopy(
      { snapshot: withStray, exportedAt: test.env.now() },
      test.env,
      null,
    );
    expect(plain.file.text).not.toContain('stray');
    expect((await test.repos.settings.get()).lastBackupAt).toBe(
      snapshotV1.settings[0]?.lastBackupAt,
    );
  });

  it('a rescue file with one invalid weight imports the rest, listing the set-aside row by store and position only', async () => {
    const tables = structuredClone(snapshotV1) as unknown as Record<
      string,
      Record<string, unknown>[]
    >;
    const weights = tables['weights'] ?? [];
    const bad = weights[1];
    if (bad === undefined) throw new Error('fixture has fewer than two weights');
    bad['kg'] = 5;
    const file = await createRescueFile({
      tables,
      schemaVersion: 1,
      exportedAt: '2000-03-01T00:00:00.000Z',
      appVersion: '0.1.0',
      password: null,
    });
    const test = await openTestDb();
    const decoded = await decodeImport(asFile(file.text), null, test.env);
    expect(decoded.kind).toBe('rescue');
    expect(decoded.setAside).toEqual([
      { table: 'weights', index: 1, field: 'kg', rule: 'range', allowed: '20–400' },
    ]);
    const after = await importAndReload(test, file.text, null);
    const imported = await backupSnapshot(after.db);
    expect(imported.weights).toHaveLength(snapshotV1.weights.length - 1);
    expect(imported.weights.some((w) => w.kg === 5)).toBe(false);
    expect(imported.settings[0]?.lastBackupAt).toBe(snapshotV1.settings[0]?.lastBackupAt);
  });
});

describe('rescue imports through the app (data-loss and health-rules reviews)', () => {
  /** The fixture on the phone, with `rows` written raw (rows the app itself would refuse). */
  async function phoneWithRaw(rows: Record<string, unknown[]>): Promise<TestDb> {
    const test = await openTestDb();
    await fillWithFixture(test);
    test.db.shutDown();
    const raw = await rawWriter(test.deps, STORES_V1);
    for (const [table, list] of Object.entries(rows)) await raw.table(table).bulkPut(list);
    raw.close();
    return openTestDb({ deps: test.deps, env: test.env });
  }

  async function uncheckedCopy(test: TestDb): Promise<string> {
    const outcome = await createExport(test.db, test.env, null);
    if (outcome.ok || outcome.unchecked === null) throw new Error('expected a failed self-check');
    return (await createRescueCopy(outcome.unchecked, test.env, null)).file.text;
  }

  it('an unchecked copy of a phone with two running fasts imports with the earlier one set aside', async () => {
    const running = snapshotV1.fasts.find((f) => f.endedAt === null);
    if (running === undefined) throw new Error('fixture has no running fast');
    const extra = { ...running, id: fixtureId(3901), startedAt: '2000-02-27T00:00:00.000Z' };
    const test = await phoneWithRaw({ fasts: [extra] });
    const text = await uncheckedCopy(test);
    const decoded = await decodeImport(asFile(text), null, test.env);
    expect(decoded.setAside.map((r) => [r.table, r.rule])).toEqual([['fasts', 'fast-running']]);
    const after = await importAndReload(test, text, null);
    const fasts = (await backupSnapshot(after.db)).fasts;
    expect(fasts.map((f) => f.id).sort()).toEqual(snapshotV1.fasts.map((f) => f.id).sort());
  });

  it('an unchecked copy whose Kickstart history fails is refused whole, in plain words, and changes nothing', async () => {
    const period = snapshotV1.kickstart_periods[0];
    if (period === undefined) throw new Error('fixture has no Kickstart period');
    const test = await phoneWithRaw({
      kickstart_periods: [{ ...period, endReason: 'example-unknown-reason' }],
    });
    const before = await backupSnapshot(test.db);
    const text = await uncheckedCopy(test);
    const error = await decodeImport(asFile(text), null, test.env).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BackupError);
    expect(error).toMatchObject({ code: 'invalid-record', rule: 'kickstart-history' });
    expect((error as BackupError).message).not.toMatch(/kickstart_|endReason|-history/);
    expect(await backupSnapshot(test.db)).toEqual(before);
  });

  it('keeps the more cautious safety setting of the phone and the file, lists what it kept from the phone, and resets a bad theme', async () => {
    const tables = structuredClone(snapshotV1) as unknown as Record<
      string,
      Record<string, unknown>[]
    >;
    Object.assign(tables['targets']?.[0] ?? {}, { energyFloorKj: 6000, kickstartDeficitPct: 25 });
    Object.assign(tables['settings']?.[0] ?? {}, {
      theme: 'neon',
      rapidLossThresholdGPerWeek: 1000,
      rapidLossConsecutiveWeeks: 3,
    });
    const file = await createRescueFile({
      tables,
      schemaVersion: 1,
      exportedAt: '2000-03-01T00:00:00.000Z',
      appVersion: '0.1.0',
      password: null,
    });
    const test = await openTestDb();
    await test.repos.targets.update({ energyFloorKj: 8000, steadyDeficitPct: 20 });
    await test.repos.settings.update({
      rapidLossThresholdGPerWeek: 800,
      rapidLossConsecutiveWeeks: 2,
      rapidLossExplanationReadAt: test.env.now(),
    });
    const decoded = await decodeImport(asFile(file.text), null, test.env);
    expect(decoded.replacedFields).toEqual([{ table: 'settings', field: 'theme' }]);
    const plan = await planImport(test.db, decoded);
    expect(plan.keptStricter).toEqual([
      { table: 'targets', field: 'energyFloorKj' },
      { table: 'settings', field: 'rapidLossThresholdGPerWeek' },
      { table: 'settings', field: 'rapidLossConsecutiveWeeks' },
    ]);
    const after = await importAndReload(test, file.text, null);
    const written = await backupSnapshot(after.db);
    expect(written.targets[0]).toMatchObject({
      energyFloorKj: 8000,
      kickstartDeficitPct: 25,
      steadyDeficitPct: 15,
    });
    expect(written.settings[0]).toMatchObject({
      theme: 'system',
      rapidLossThresholdGPerWeek: 800,
      rapidLossConsecutiveWeeks: 2,
      rapidLossExplanationReadAt: test.env.now(),
      alcoholGuidanceSet: 'nz-women',
    });
  });

  it('a plain backup is never merged: its own values are restored as they are', async () => {
    const test = await openTestDb();
    await test.repos.targets.update({ energyFloorKj: 8000 });
    const after = await importAndReload(test, plainReferenceEnvelopeV1(), null);
    expect((await backupSnapshot(after.db)).targets).toEqual(snapshotV1.targets);
  });

  it('a phone whose own safety settings are damaged: a good rescue copy imports with the file’s values (never 0), and the copy of that same phone is refused in plain words', async () => {
    const settings = { ...snapshotV1.settings[0] } as Record<string, unknown>;
    delete settings['rapidLossThresholdGPerWeek'];
    const targets = { ...snapshotV1.targets[0] } as Record<string, unknown>;
    delete targets['steadyDeficitPct'];
    const weight = { ...snapshotV1.weights[0], kg: 5 };
    const test = await phoneWithRaw({
      settings: [settings],
      targets: [targets],
      weights: [weight],
    });
    // That phone's own unchecked copy lacks a safety setting: refused, nothing changed.
    const before = await backupSnapshot(test.db);
    const own = await decodeImport(asFile(await uncheckedCopy(test)), null, test.env).then(
      () => null,
      (e: unknown) => e,
    );
    expect(own).toMatchObject({ code: 'invalid-record', rule: 'missing' });
    expect((own as BackupError).message).toMatch(/Nothing was imported\.$/);
    expect(await backupSnapshot(test.db)).toEqual(before);
    // A good rescue copy: the damaged phone values are ignored, so the write succeeds.
    const file = await createRescueFile({
      tables: snapshotV1,
      schemaVersion: 1,
      exportedAt: '2000-03-01T00:00:00.000Z',
      appVersion: '0.1.0',
      password: null,
    });
    const plan = await planImport(test.db, await decodeImport(asFile(file.text), null, test.env));
    expect(plan.keptStricter).toEqual([]);
    const after = await importAndReload(test, file.text, null);
    const written = await backupSnapshot(after.db);
    expect(written.settings[0]?.rapidLossThresholdGPerWeek).toBe(
      snapshotV1.settings[0]?.rapidLossThresholdGPerWeek,
    );
    expect(written.targets[0]?.steadyDeficitPct).toBe(snapshotV1.targets[0]?.steadyDeficitPct);
  });
});

describe('restoring never lowers the Kickstart history (D27; orchestrator ruling A)', () => {
  /** The fixture without any Kickstart: an older file made before the periods. */
  const withoutKickstart = () => ({
    ...structuredClone(snapshotV1),
    kickstart_periods: [],
    kickstart_checks: [],
  });

  it.each(['backup', 'rescue'] as const)(
    'a phone at 42 Kickstart days keeps its periods and checks when an older %s has none: the plan says so, and no new period can start',
    async (kind) => {
      const test = await openTestDb();
      await fillWithFixture(test);
      const usage = async (t: TestDb) =>
        kickstartUsage(await t.repos.kickstart.listPeriods(), await t.repos.kickstart.listChecks());
      expect(canStartKickstart(await usage(test))).toBe(false);
      const input = {
        tables: withoutKickstart(),
        exportedAt: '2000-03-01T00:00:00.000Z',
        appVersion: '0.1.0',
        password: null,
      };
      const file =
        kind === 'backup'
          ? await createBackupFile(input)
          : await createRescueFile({ ...input, schemaVersion: 1 });
      const plan = await planImport(test.db, await decodeImport(asFile(file.text), null, test.env));
      expect(plan.keptKickstart).toBe(true);
      expect(plan.snapshot.kickstart_periods).toEqual(snapshotV1.kickstart_periods);
      const after = await importAndReload(test, file.text, null);
      expect(await usage(after)).toEqual({ days: 42, extensions: 1 });
      expect(canStartKickstart(await usage(after))).toBe(false);
      after.env.advanceDays(30);
      await expect(after.repos.kickstart.startPeriod()).rejects.toMatchObject({
        rule: 'kickstart-days',
      });
    },
  );

  it('after delete-all the phone has none, so the file’s history is restored (HS-15)', async () => {
    const test = await openTestDb();
    const decoded = await decodeImport(asFile(plainReferenceEnvelopeV1()), null, test.env);
    const plan = await planImport(test.db, decoded);
    expect(plan.keptKickstart).toBe(false);
    expect(plan.snapshot.kickstart_periods).toEqual(snapshotV1.kickstart_periods);
  });
});

describe('a phone clock that was wrong never blocks a backup or a restore (orchestrator rulings C and D)', () => {
  it('times written with the clock ahead, then the clock corrected: the export passes its own check, and the reminder can still be snoozed', async () => {
    const test = await openTestDb();
    const corrected = test.env.now();
    test.env.advanceDays(30);
    // Setup finished with the clock ahead (item 13 refuses a completion without the notice and
    // the seven answers): every setup time, answers included, is dated ahead.
    await onboardForTests(test, { weightKg: null });
    await test.repos.recipes.create(structuredClone(snapshotV1.recipes[0]) as never);
    await test.repos.cardState.dismiss('rapid-loss', 'steady');
    test.env.set(corrected);
    const outcome = await createExport(test.db, test.env, null);
    if (!outcome.ok) throw outcome.error;
    const limit = new Date(Date.parse(corrected) + FUTURE_INSTANT_TOLERANCE_MS).toISOString();
    // The file itself holds the times put back to the limit (the snapshot the self-check checks).
    const written = (
      JSON.parse(outcome.file.text) as {
        payload: { tables: Record<string, Record<string, unknown>[]> };
      }
    ).payload.tables;
    expect(written['settings']?.[0]?.['onboardingCompletedAt']).toBe(limit);
    expect(written['card_state']?.every((c) => (c['dismissedAt'] as string) <= limit)).toBe(true);
    expect(written['readiness']?.every((r) => (r['answeredAt'] as string) === limit)).toBe(true);
    const decoded = await decodeImport(asFile(outcome.file.text), null, test.env);
    expect(decoded.snapshot.settings[0]?.onboardingCompletedAt).toBe(limit);
    expect(decoded.snapshot.recipes.every((r) => r.updatedAt <= limit)).toBe(true);
    // The phone's own records are not changed by the export.
    expect((await test.repos.settings.get()).onboardingCompletedAt).not.toBe(limit);
    // "Not now" at the correct time snoozes the reminder whose reference is dated ahead.
    await test.repos.cardState.dismiss('backup-reminder', 'weekly');
    const settings = await test.repos.settings.get();
    const card = await test.repos.cardState.get('backup-reminder', 'weekly');
    expect(
      backupReminder({
        lastBackupAt: settings.lastBackupAt,
        onboardingCompletedAt: settings.onboardingCompletedAt,
        dismissedAt: card?.dismissedAt ?? null,
        storage: 'protected',
        now: test.env.now(),
      }).visible,
    ).toBe(false);
  });

  it('an unchecked copy made after a clock correction always imports, with the times put back', async () => {
    const test = await openTestDb();
    await fillWithFixture(test);
    const corrected = test.env.now();
    test.env.set(new Date(Date.parse(corrected) + 3_600_000).toISOString());
    await test.repos.settings.update({
      rapidLossThresholdGPerWeek: 800,
      rapidLossExplanationReadAt: test.env.now(),
    });
    test.env.set(corrected);
    test.db.shutDown();
    const raw = await rawWriter(test.deps, STORES_V1);
    await raw.table('weights').put({ ...snapshotV1.weights[0], kg: 5 });
    raw.close();
    const phone = await openTestDb({ deps: test.deps, env: test.env });
    const outcome = await createExport(phone.db, phone.env, null);
    if (outcome.ok || outcome.unchecked === null) throw new Error('expected a failed self-check');
    const copy = await createRescueCopy(outcome.unchecked, phone.env, null);
    // A day later, on any phone, it still imports.
    phone.env.advanceDays(1);
    const decoded = await decodeImport(asFile(copy.file.text), null, phone.env);
    expect(decoded.setAside.map((r) => [r.table, r.rule])).toEqual([['weights', 'range']]);
    expect(decoded.snapshot.settings[0]).toMatchObject({
      rapidLossThresholdGPerWeek: 800,
      rapidLossExplanationReadAt: new Date(
        Date.parse(corrected) + FUTURE_INSTANT_TOLERANCE_MS,
      ).toISOString(),
    });
    await importAndReload(phone, copy.file.text, null);
  });

  it('a backup with a far-future low-carb start imports, and the check-in timing counts from now', async () => {
    const tables = structuredClone(snapshotV1);
    Object.assign(tables.profile[0] ?? {}, { firstLowCarbAt: '2099-01-01T00:00:00.000Z' });
    const text = plainBackupText(
      buildBackupPayload(tables, {
        kind: 'backup',
        exportedAt: '2000-03-01T00:00:00.000Z',
        appVersion: '0.1.0',
      }),
    );
    const test = await openTestDb();
    const after = await importAndReload(test, text, null);
    const { firstLowCarbAt } = await after.repos.profile.get();
    expect(elapsedDaysSince(firstLowCarbAt, after.env.now())).toBe(0);
    // Put back to the import time (plus the 5-minute tolerance), so day 56 is 56 days from now.
    after.env.set(
      new Date(
        Date.parse(after.env.now()) + 56 * 86_400_000 + FUTURE_INSTANT_TOLERANCE_MS,
      ).toISOString(),
    );
    expect(elapsedDaysSince(firstLowCarbAt, after.env.now())).toBe(56);
  });

  it('a backup holding a Kickstart start dated after it was made is refused in plain words', async () => {
    const tables = structuredClone(snapshotV1);
    Object.assign(tables.kickstart_periods.at(-1) ?? {}, { startedAt: '2099-01-01T00:00:00.000Z' });
    const text = plainBackupText(
      buildBackupPayload(tables, {
        kind: 'backup',
        exportedAt: '2000-03-01T00:00:00.000Z',
        appVersion: '0.1.0',
      }),
    );
    const test = await openTestDb();
    await expect(decodeImport(asFile(text), null, test.env)).rejects.toMatchObject({
      code: 'invalid-record',
      table: 'kickstart_periods',
      field: 'startedAt',
      rule: 'future',
    });
  });
});

describe('the export self-check (D19, D22; section 16 test 35)', () => {
  it('two exports of the same data differ only in exportedAt', async () => {
    const test = await openTestDb();
    await fillWithFixture(test);
    const first = await createExport(test.db, test.env, null);
    test.env.advanceDays(1);
    const second = await createExport(test.db, test.env, null);
    if (!first.ok || !second.ok) throw new Error('export failed');
    const strip = (text: string) => {
      const file = JSON.parse(text) as {
        payload: { exportedAt: string; tables: { settings: { lastBackupAt: unknown }[] } };
      };
      file.payload.exportedAt = '';
      for (const s of file.payload.tables.settings) s.lastBackupAt = null;
      return JSON.stringify(file);
    };
    expect(first.file.text).not.toBe(second.file.text);
    expect(strip(first.file.text)).toBe(strip(second.file.text));
  });

  it('a corrupted row stops the export with the table, field and rule, and an unchecked copy can still be saved', async () => {
    const test = await openTestDb();
    await fillWithFixture(test);
    const weight = snapshotV1.weights[0];
    if (weight === undefined) throw new Error('no fixture weight');
    test.db.shutDown();
    const raw = await rawWriter(test.deps, STORES_V1);
    await raw.table('weights').put({ ...weight, kg: 5 });
    raw.close();
    const reopened = await openTestDb({ deps: test.deps, env: test.env });
    const outcome = await createExport(reopened.db, reopened.env, null);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('self-check-failed');
    expect(outcome.error.message).toBe(
      'The backup could not be checked: Weigh-ins, record 1: the weight is outside the allowed range (20–400).',
    );
    expect(outcome.unchecked).not.toBeNull();
    if (outcome.unchecked === null) return;
    const copy = await createRescueCopy(outcome.unchecked, reopened.env, null);
    expect(copy.file.kind).toBe('rescue');
    expect(copy.fileName).toBe('diet-backup-2000-03-01-rescue.json');
    expect((await reopened.repos.settings.get()).lastBackupAt).toBe(
      snapshotV1.settings[0]?.lastBackupAt,
    );
  });
});

describe('import fuzzing through the app path', () => {
  it('300 mutated files: each is refused with a BackupError and changes nothing, or imports a valid, consistent snapshot', async () => {
    const test = await openTestDb();
    const random = mulberry32(20001019);
    const outcomes = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const text = mutateBackupText(random);
      const before = await counts(test.db);
      let decoded;
      try {
        decoded = await decodeImport(asFile(text), null, test.env);
      } catch (error) {
        if (!(error instanceof BackupError))
          throw new Error(`mutation ${String(i)} threw ${String(error)}`, { cause: error });
        outcomes.set(error.code, (outcomes.get(error.code) ?? 0) + 1);
        expect(await counts(test.db)).toEqual(before);
        continue;
      }
      const plan = await planImport(test.db, decoded);
      expect(await writeImport(test.db, plan, test.env, writeDeps())).toEqual({ ok: true });
      const written = await backupSnapshot(test.db);
      validateSnapshot(written);
      checkInvariants(written);
      outcomes.set('imported', (outcomes.get('imported') ?? 0) + 1);
    }
    for (const code of ['not-a-backup', 'damaged', 'invalid-record']) {
      expect(outcomes.get(code) ?? 0, code).toBeGreaterThan(0);
    }
  }, 120_000);
});

describe('device-only stores', () => {
  it('a non-extractable CryptoKey is stored and read back through the database (fake-indexeddb, Node structured clone)', async () => {
    const test = await openTestDb({ deps: freshDeps() });
    const pairing = await pairingRow();
    await test.db.transfer_pairings.put(pairing);
    const stored = await test.db.transfer_pairings.get('singleton');
    expect(Object.prototype.toString.call(stored?.key)).toBe('[object CryptoKey]');
    expect(stored?.key.extractable).toBe(false);
    const iv = new Uint8Array(12);
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      stored?.key as CryptoKey,
      new Uint8Array([1, 2, 3]),
    );
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      pairing.key as CryptoKey,
      sealed,
    );
    expect([...new Uint8Array(opened)]).toEqual([1, 2, 3]);
  });
});

describe('the withdrawal tick lasts (item 28 D2; AL-08, C05)', () => {
  /** The help card's triggers, fed from the Drinks screens' own read. */
  async function triggers(t: TestDb): Promise<readonly string[]> {
    const data = await loadDrinksData({
      gate: t.db.gate,
      storage: t.storage,
      from: '2000-01-01',
      to: '2000-03-01',
    });
    return activeHelpTriggers({
      now: t.env.now(),
      deviceZone: 'Pacific/Auckland',
      ctx: { homeTimeZone: data.settings.homeTimeZone, cutoverMinutes: 300 },
      rows: data.drinks,
      weeklyGuidance: 10,
      withdrawalTickDates: data.notes.filter((n) => n.withdrawalTick).map((n) => n.date),
      noteToday: '2000-03-01',
      q7Gated: false,
    });
  }

  it('a ticked note still brings up the card after a reload, and after export, delete all and import', async () => {
    const test = await openTestDb();
    await onboardForTests(test, { weightKg: null });
    await test.repos.alcoholDayNotes.create({
      date: '2000-03-01',
      note: null,
      withdrawalTick: true,
    });
    expect(await triggers(test)).toEqual(['withdrawal-tick']);
    test.db.shutDown();
    const reopened = await openTestDb({ deps: test.deps, env: test.env });
    expect(await triggers(reopened)).toEqual(['withdrawal-tick']);

    const exported = await createExport(reopened.db, reopened.env, null);
    if (!exported.ok) throw exported.error;
    await deleteEverything(reopened);
    const fresh = await openTestDb({ deps: test.deps, env: test.env });
    await onboardForTests(fresh, { weightKg: null });
    expect(await triggers(fresh)).toEqual([]);
    const after = await importAndReload(fresh, exported.file.text, null);
    expect(await triggers(after)).toEqual(['withdrawal-tick']);
  });
});
