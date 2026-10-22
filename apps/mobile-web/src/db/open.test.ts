// @vitest-environment node
// Opening the database (storage spec section 7; section 16 tests 22 and 36; BK-11): real Dexie
// 4.4.6 over a fresh fake-indexeddb factory for every test.
import { DB_NAME, MIGRATIONS, SCHEMA_VERSION, STORE_NAMES, STORES_V1 } from '@diet/core';
import { chainD } from '@diet/test-fixtures';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../store';
import {
  DietDb,
  type DietDbOptions,
  installedNativeVersion,
  mapOpenError,
  openAndVerify,
  openDietDb,
  type OpenStatus,
} from './db';
import { StorageClosedError } from './errors';
import { createWriteGate, openTabChannel } from './gate';
import { planImport, writeImport } from './importBackup';
import { backupSnapshot, freshDeps, openTestDb, testEnv } from './testKit';
import { decodeImport } from './importBackup';
import { createExport } from './exportBackup';

/** Dexie stores schema version n as native version n × 10. */
const NATIVE_VERSION = SCHEMA_VERSION * 10;

const stopListening: (() => void)[] = [];
afterEach(() => {
  for (const stop of stopListening.splice(0)) stop();
});

/** Each store's schema as Dexie reports it, written the way STORES_V1 writes it. */
function schemaOf(db: Dexie): Record<string, string> {
  return Object.fromEntries(
    db.tables.map((t) => [
      t.name,
      [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', '),
    ]),
  );
}

/** The installed stores and their indexes, read with raw IndexedDB. */
async function rawShape(
  factory: IDBFactory,
): Promise<{ version: number; stores: Record<string, string[]> }> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME);
    request.onsuccess = () => {
      const idb = request.result;
      const names = Array.from(idb.objectStoreNames);
      const tx = idb.transaction(names, 'readonly');
      const stores = Object.fromEntries(
        names.map((n) => [n, Array.from(tx.objectStore(n).indexNames).sort()]),
      );
      const version = idb.version;
      idb.close();
      resolve({ version, stores });
    };
    request.onerror = () => {
      reject(request.error ?? new Error('open failed'));
    };
  });
}

describe('open (section 16 test 22; BK-11)', () => {
  it('creates 28 stores with the section 4.2 keys and indexes, at the current native version, and populates them', async () => {
    const { db, repos } = await openTestDb();
    expect(db.tables).toHaveLength(28);
    expect(schemaOf(db)).toEqual(STORES_V1);
    expect(db.backendDB().version).toBe(NATIVE_VERSION);
    expect(await repos.profile.get()).toMatchObject({ id: 'singleton', sex: null });
    expect(await repos.targets.get()).toMatchObject({ id: 'singleton', energyFloorKj: 5000 });
    expect(await repos.settings.get()).toMatchObject({ id: 'singleton', lastBackupAt: null });
    const beverages = await repos.beverages.list();
    expect(beverages).toHaveLength(1);
    expect(beverages[0]).toMatchObject({
      name: 'Zero-sugar premix',
      label: { origin: 'preset-default' },
    });
    const garden = await repos.garden.list();
    expect(garden).toHaveLength(1);
    expect(garden[0]).toMatchObject({ name: 'Silverbeet', amount: null });
    expect(await repos.readiness.list()).toEqual([]);
    expect(await db.card_state.count()).toBe(0);
    expect(await db.alcohol_milestones.count()).toBe(0);
  });

  it('the pre-check never creates the database, and the first real open still populates it', async () => {
    const deps = freshDeps();
    expect(await installedNativeVersion(deps.indexedDB)).toBeNull();
    expect(await deps.indexedDB.databases()).toEqual([]);
    const { repos } = await openTestDb({ deps });
    expect((await repos.beverages.list()).map((b) => b.name)).toEqual(['Zero-sugar premix']);
  });

  it('the raw-open fallback (no databases()) creates nothing either, and the first open populates', async () => {
    const deps = freshDeps();
    const real = deps.indexedDB;
    const stripped = {
      open: real.open.bind(real),
      deleteDatabase: real.deleteDatabase.bind(real),
      cmp: real.cmp.bind(real),
    } as unknown as IDBFactory;
    expect(await installedNativeVersion(stripped)).toBeNull();
    expect(await real.databases()).toEqual([]);
    const { repos } = await openTestDb({ deps: { ...deps, indexedDB: stripped } });
    expect((await repos.garden.list()).map((g) => g.name)).toEqual(['Silverbeet']);
    expect(await installedNativeVersion(stripped)).toBe(NATIVE_VERSION);
  });

  it('a newer database (the released chain, then the step of test chain d) is reported, DietDb is never made, and nothing changes', async () => {
    const deps = freshDeps();
    const newer = new Dexie(DB_NAME, { indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange });
    for (const step of MIGRATIONS) newer.version(step.version).stores(step.stores);
    newer.version(SCHEMA_VERSION + 1).stores(chainD[1]?.stores ?? {});
    await newer.open();
    newer.close();
    const before = await rawShape(deps.indexedDB);
    expect(before.version).toBe(NATIVE_VERSION + 10);
    expect(before.stores['weights']).toEqual([]);

    const createDb = vi.fn((options: DietDbOptions) => new DietDb(options));
    const status = createStore<OpenStatus>('opening');
    const result = await openDietDb(testEnv(), deps, { createDb, status, gate: createWriteGate() });
    expect(result).toEqual({ status: 'newer-version', db: null });
    expect(status.get()).toBe('newer-version');
    expect(createDb).not.toHaveBeenCalled();
    const after = await rawShape(deps.indexedDB);
    expect(after).toEqual(before);
    expect(Object.keys(after.stores)).not.toContain('$meta');
  });

  it('the post-open check: a DietDb opened straight against a newer database closes as newer-version, changing nothing', async () => {
    const deps = freshDeps();
    const newer = new Dexie(DB_NAME, { indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange });
    for (const step of MIGRATIONS) newer.version(step.version).stores(step.stores);
    newer.version(SCHEMA_VERSION + 1).stores({ example_extra: 'id' });
    await newer.open();
    newer.close();
    const before = await rawShape(deps.indexedDB);
    const status = createStore<OpenStatus>('opening');
    const gate = createWriteGate();
    const db = new DietDb({ ...deps, env: testEnv(), status, gate });
    const result = await openAndVerify(db, null);
    expect(result).toEqual({ status: 'newer-version', db: null });
    expect(status.get()).toBe('newer-version');
    expect(db.isOpen()).toBe(false);
    expect(gate.isOpen()).toBe(false);
    expect(await rawShape(deps.indexedDB)).toEqual(before);
    await expect(db.weights.count()).rejects.toMatchObject({ name: 'DatabaseClosedError' });
  });

  /** A raw 'diet' database at the current native version with its stores, changed by `adjust`. */
  async function rawCurrentVersion(
    factory: IDBFactory,
    adjust: (db: IDBDatabase, name: string, store: IDBObjectStore) => void,
    extra: (db: IDBDatabase) => void = () => undefined,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(DB_NAME, NATIVE_VERSION);
      request.onupgradeneeded = () => {
        const idb = request.result;
        for (const [name, schema] of Object.entries(STORES_V1)) {
          const [key = 'id', ...indexes] = schema.split(',').map((p) => p.trim());
          const compound = /^\[(.+)\]$/.exec(key);
          const store = idb.createObjectStore(name, {
            keyPath: compound?.[1] === undefined ? key : compound[1].split('+'),
          });
          for (const index of indexes) {
            const multi = /^\[(.+)\]$/.exec(index);
            store.createIndex(index, multi?.[1] === undefined ? index : multi[1].split('+'));
          }
          adjust(idb, name, store);
        }
        extra(idb);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
    });
  }

  it('the post-open check refuses a current-version database missing an index (Dexie would patch it to the next native version): not ready, gate closed', async () => {
    const deps = freshDeps();
    await rawCurrentVersion(deps.indexedDB, (_db, name, store) => {
      if (name === 'weights') store.deleteIndex('at');
    });
    const status = createStore<OpenStatus>('opening');
    const gate = createWriteGate();
    const result = await openDietDb(testEnv(), deps, { status, gate });
    expect(result.db).toBeNull();
    expect(result.status).not.toBe('ready');
    expect(status.get()).toBe(result.status);
    expect(gate.isOpen()).toBe(false);
  });

  it('the post-open check refuses a current-version database with an extra store (such as a Dexie $meta store): not ready, gate closed', async () => {
    for (const extraStore of ['$meta', 'example_extra']) {
      const deps = freshDeps();
      await rawCurrentVersion(
        deps.indexedDB,
        () => undefined,
        (idb) => {
          idb.createObjectStore(extraStore);
        },
      );
      const status = createStore<OpenStatus>('opening');
      const gate = createWriteGate();
      const result = await openDietDb(testEnv(), deps, { status, gate });
      expect(result, extraStore).toEqual({ status: 'unavailable', db: null });
      expect(gate.isOpen(), extraStore).toBe(false);
    }
  });

  it('maps open errors to the section 7.4 statuses', () => {
    const named = (name: string) => Object.assign(new Error('x'), { name });
    expect(mapOpenError(named('VersionError'), false)).toBe('newer-version');
    expect(mapOpenError(named('UpgradeError'), true)).toBe('upgrade-failed');
    expect(mapOpenError(named('StorageValidationError'), true)).toBe('upgrade-failed');
    expect(mapOpenError(named('StorageInvariantError'), true)).toBe('upgrade-failed');
    expect(mapOpenError(named('AbortError'), true)).toBe('upgrade-failed');
    expect(mapOpenError(named('AbortError'), false)).toBe('unavailable');
    expect(mapOpenError(named('DatabaseClosedError'), false)).toBe('reload-needed');
    for (const name of ['MissingAPIError', 'OpenFailedError', 'InvalidStateError', 'Other']) {
      expect(mapOpenError(named(name), false)).toBe('unavailable');
    }
    expect(mapOpenError('not an error', false)).toBe('unavailable');
  });

  it('a missing IndexedDB (private mode or storage blocked) is unavailable', async () => {
    const deps = freshDeps();
    const broken = {
      ...deps,
      indexedDB: {
        databases: () => Promise.reject(new Error('blocked')),
      } as unknown as IDBFactory,
    };
    const status = createStore<OpenStatus>('opening');
    expect(await openDietDb(testEnv(), broken, { status })).toEqual({
      status: 'unavailable',
      db: null,
    });
    expect(status.get()).toBe('unavailable');
  });

  it('the store set is exactly STORE_NAMES', async () => {
    const { db } = await openTestDb();
    expect(Array.from(db.backendDB().objectStoreNames).sort()).toEqual([...STORE_NAMES].sort());
  });
});

describe('other tabs (section 7.5; section 16 test 36)', () => {
  it('a versionchange from a second connection closes this one for good: reload-needed, gate closed, later queries fail', async () => {
    const { db, deps, repos, status } = await openTestDb();
    expect(status.get()).toBe('ready');
    await new Promise<void>((resolve, reject) => {
      const request = deps.indexedDB.open(DB_NAME, NATIVE_VERSION + 10);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
    });
    expect(status.get()).toBe('reload-needed');
    expect(db.gate.isOpen()).toBe(false);
    expect(db.isOpen()).toBe(false);
    await expect(db.weights.count()).rejects.toMatchObject({ name: 'DatabaseClosedError' });
    await expect(repos.water.create({ ml: 250, electrolyte: false })).rejects.toBeInstanceOf(
      StorageClosedError,
    );
    // It never reopened: the version the other connection made is still there.
    expect(await installedNativeVersion(deps.indexedDB)).toBe(NATIVE_VERSION + 10);
  });

  it('a gate message on the diet-db channel closes this tab for good', async () => {
    const { db, status } = await openTestDb();
    const thisTab = openTabChannel(() => {
      db.closeForGood('reload-needed');
    });
    const otherTab = openTabChannel(() => undefined);
    stopListening.push(thisTab.stop, otherTab.stop);
    // A tab never hears its own message, so the acting tab keeps its database open to write.
    thisTab.post('import');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(status.get()).toBe('ready');
    otherTab.post('delete-all');
    await vi.waitFor(() => {
      expect(status.get()).toBe('reload-needed');
    });
    expect(db.gate.isOpen()).toBe(false);
    await expect(db.settings.get('singleton')).rejects.toMatchObject({
      name: 'DatabaseClosedError',
    });
  });

  it('an import in one connection gates the other', async () => {
    const deps = freshDeps();
    const a = await openTestDb({ deps });
    const b = await openTestDb({ deps, env: a.env });
    const tabA = openTabChannel(() => {
      a.db.closeForGood('reload-needed');
    });
    const tabB = openTabChannel(() => {
      b.db.closeForGood('reload-needed');
    });
    stopListening.push(tabA.stop, tabB.stop);
    const exported = await createExport(b.db, b.env, null);
    if (!exported.ok) throw exported.error;
    const decoded = await decodeImport(
      { text: exported.file.text, sizeBytes: exported.file.text.length },
      null,
      b.env,
    );
    const plan = await planImport(b.db, decoded);
    const outcome = await writeImport(b.db, plan, b.env, {
      postGate: tabB.post,
      locks: null,
      requestPersistentStorage: () => Promise.resolve(),
      reload: () => undefined,
    });
    expect(outcome).toEqual({ ok: true });
    await vi.waitFor(() => {
      expect(a.status.get()).toBe('reload-needed');
    });
    await expect(a.repos.water.create({ ml: 250, electrolyte: false })).rejects.toBeInstanceOf(
      StorageClosedError,
    );
    // The acting tab's database stayed open for its own write.
    expect(b.status.get()).toBe('ready');
    expect(b.db.gate.isOpen()).toBe(false);
    expect((await backupSnapshot(b.db)).settings).toHaveLength(1);
  });
});
