// @vitest-environment node
// Backup through the real database (storage spec sections 10 and 9.5; section 16 tests 26 to 30,
// 33 to 35, and import fuzzing through the app's own path; BK-01, BK-02, BK-07, BK-09, BK-10,
// HS-15, RD-08). Real Dexie over fake-indexeddb.
import {
  BackupError,
  bytesToBase64,
  checkInvariants,
  createRescueFile,
  missingReadinessAnswers,
  migrateSnapshot,
  readinessInputFromRows,
  type Snapshot,
  validateSnapshot,
} from '@diet/core';
import {
  chainB,
  fixtureEnv,
  lockedReferenceEnvelopeV1,
  mulberry32,
  mutateBackupText,
  plainReferenceEnvelopeV1,
  REFERENCE_PHRASE_V1,
  snapshotV1,
  SYNTHETIC_PHRASE,
} from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
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
  openTestDb,
  pairingRow,
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
    indexedDB: test.deps.indexedDB,
    caches: undefined,
    localStorage: () => memoryStorage(),
    sessionStorage: () => memoryStorage(),
    revokeObjectUrls: () => undefined,
    reload: () => undefined,
  });
  expect(result).toEqual({ ok: true, failed: [], blocked: false });
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
      await test.db.transfer_pairings.put(await pairingRow());
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
      if (outcome.ok) return;
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
    await test.db.transfer_pairings.put(await pairingRow());

    const decoded = await decodeImport(asFile(exported.file.text), null, test.env);
    const plan = await planImport(test.db, decoded);
    expect(plan.confirmation).toEqual({
      missingFromFile: 2,
      changedAfterExport: 1,
      phoneNewest: test.env.now(),
      fileNewest: expect.any(String) as string,
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

  it('when the phone is no newer than the file, Replace comes first', async () => {
    const test = await openTestDb();
    const decoded = await decodeImport(asFile(plainReferenceEnvelopeV1()), null, test.env);
    const empty = await openTestDb({ env: testEnv('2000-01-01T00:00:00.000Z') });
    const plan = await planImport(empty.db, { ...decoded, exportedAt: '2000-03-01T00:00:00.000Z' });
    expect(plan.confirmation.exportFirst).toBe(true); // the seed rows are not in the file
    const same = await openTestDb();
    await replaceAll(same.db, decoded.snapshot);
    const samePlan = await planImport(same.db, decoded);
    expect(samePlan.confirmation).toMatchObject({
      missingFromFile: 0,
      changedAfterExport: 0,
      exportFirst: false,
    });
  });
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
    expect(decoded.setAside).toEqual([{ table: 'weights', index: 1, field: 'kg', rule: 'range' }]);
    const after = await importAndReload(test, file.text, null);
    const imported = await backupSnapshot(after.db);
    expect(imported.weights).toHaveLength(snapshotV1.weights.length - 1);
    expect(imported.weights.some((w) => w.kg === 5)).toBe(false);
    expect(imported.settings[0]?.lastBackupAt).toBe(snapshotV1.settings[0]?.lastBackupAt);
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
    expect(outcome.error.message).toBe('The backup could not be checked: weights kg failed range');
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
