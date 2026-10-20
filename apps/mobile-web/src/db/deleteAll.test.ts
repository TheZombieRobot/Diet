// @vitest-environment node
// Delete all data (storage spec section 11; HS-30; section 16 test 31). Real Dexie over
// fake-indexeddb, with a fake Cache Storage and in-memory local and session storage.
import { BACKUP_TABLES, DB_NAME } from '@diet/core';
import { snapshotV1 } from '@diet/test-fixtures';
import { describe, expect, it, vi } from 'vitest';
import { deleteAllData, type DeleteAllDeps } from './deleteAll';
import { StorageClosedError } from './errors';
import { liveStore } from './liveQuery';
import { replaceAll } from './snapshot';
import {
  counts,
  memoryStorage,
  openTestDb,
  photoRow,
  savePairingForTests,
  type TestDb,
} from './testKit';

const PRECACHE = 'workbox-precache-v2-https://example.com/Diet/';

function fakeCaches(names: readonly string[]): CacheStorage & { readonly names: Set<string> } {
  const set = new Set(names);
  return {
    names: set,
    keys: () => Promise.resolve([...set]),
    delete: (name: string) => Promise.resolve(set.delete(name)),
  } as unknown as CacheStorage & { readonly names: Set<string> };
}

function createExtraDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('things');
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

function depsFor(
  test: TestDb,
  overrides: Partial<DeleteAllDeps> = {},
): DeleteAllDeps & {
  readonly reload: ReturnType<typeof vi.fn>;
  readonly revokeObjectUrls: ReturnType<typeof vi.fn>;
  readonly postGate: ReturnType<typeof vi.fn>;
} {
  const deps = {
    db: test.db,
    gate: test.db.gate,
    postGate: vi.fn(),
    locks: null,
    indexedDB: test.deps.indexedDB,
    caches: undefined,
    localStorage: () => memoryStorage(),
    sessionStorage: () => memoryStorage(),
    revokeObjectUrls: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
  return deps as typeof deps & {
    readonly reload: ReturnType<typeof vi.fn>;
    readonly revokeObjectUrls: ReturnType<typeof vi.fn>;
    readonly postGate: ReturnType<typeof vi.fn>;
  };
}

describe('delete all (HS-30; section 16 test 31)', () => {
  it('empties every store, the pairing, every photo, every other database and cache except the precache, and both storages', async () => {
    const test = await openTestDb();
    await replaceAll(test.db, snapshotV1);
    await savePairingForTests(test);
    await test.db.garden_photos.put(photoRow(snapshotV1.garden[0]?.id ?? ''));
    await createExtraDatabase(test.deps.indexedDB, 'example-extra');
    const caches = fakeCaches([PRECACHE, 'example-runtime-cache']);
    const local = memoryStorage({ exampleKey: 'example' });
    const session = memoryStorage({ exampleKey: 'example' });
    const deps = depsFor(test, {
      caches,
      localStorage: () => local,
      sessionStorage: () => session,
    });

    const result = await deleteAllData(deps);
    expect(result).toEqual({ ok: true, failed: [], blocked: false, recordsDeleted: true });
    expect(deps.postGate).toHaveBeenCalledWith('delete-all');
    expect(deps.revokeObjectUrls).toHaveBeenCalledOnce();
    expect(deps.reload).toHaveBeenCalledOnce();
    expect(await test.deps.indexedDB.databases()).toEqual([]);
    expect([...caches.names]).toEqual([PRECACHE]);
    expect(local.length).toBe(0);
    expect(session.length).toBe(0);

    // The reload: a fresh database with the section 6 seed rows only.
    const fresh = await openTestDb({ deps: test.deps, env: test.env });
    const seeded = await counts(fresh.db);
    expect(seeded).toEqual(
      Object.fromEntries(
        BACKUP_TABLES.map((name) => [
          name,
          ['profile', 'targets', 'settings', 'beverages', 'garden'].includes(name) ? 1 : 0,
        ]),
      ),
    );
    expect(await fresh.db.transfer_pairings.count()).toBe(0);
    expect(await fresh.db.garden_photos.count()).toBe(0);
    expect((await test.deps.indexedDB.databases()).map((d) => d.name)).toEqual([DB_NAME]);
  });

  it('a blocked deletion (another tab holding the database) is reported and claims no success', async () => {
    const test = await openTestDb();
    // A connection that ignores versionchange, as an unresponsive tab would.
    const holder = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = test.deps.indexedDB.open(DB_NAME);
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
    });
    const deps = depsFor(test, { blockedTimeoutMs: 50 });
    const result = await deleteAllData(deps);
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.failed).toContain('databases');
    expect(deps.reload).not.toHaveBeenCalled();
    holder.close();
  });

  it('no resurrection: an autosave after step 0 and a live query after step 1 neither reopen the database nor write a row', async () => {
    const test = await openTestDb();
    const query = vi.fn(() => test.db.weights.count());
    const live = liveStore(query, test.db.gate);
    const stop = live.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(live.get()).toBe(0);
    });
    const callsBefore = query.mock.calls.length;

    const autosave: { result: Promise<unknown> | null } = { result: null };
    const deps = depsFor(test, {
      postGate: () => {
        // Step 0 has closed the gate: a debounced autosave that fires now must fail.
        autosave.result = test.repos.water.create({ ml: 250, electrolyte: false }).then(
          () => 'saved',
          (error: unknown) => error,
        );
      },
    });
    const result = await deleteAllData(deps);
    expect(result.ok).toBe(true);
    expect(await autosave.result).toBeInstanceOf(StorageClosedError);
    // A query on the old connection fails rather than reopening.
    await expect(test.db.weights.count()).rejects.toMatchObject({ name: 'DatabaseClosedError' });
    expect(await test.deps.indexedDB.databases()).toEqual([]);

    // The reload: a fresh database, populated, and a weigh-in written through it. Each write
    // tells every live query on 'diet' in this process; the old tab's must not run again.
    const fresh = await openTestDb({ deps: test.deps, env: test.env });
    const control = liveStore(() => fresh.db.weights.count(), fresh.db.gate);
    const stopControl = control.subscribe(() => undefined);
    await fresh.repos.weights.create({ kg: 80, source: 'manual', note: null });
    await vi.waitFor(() => {
      expect(control.get()).toBe(1);
    });
    expect(query.mock.calls.length).toBe(callsBefore);
    stop();
    stopControl();
    expect(await fresh.db.water_log.count()).toBe(0);
    expect((await counts(fresh.db))['weights']).toBe(1);
  });

  it('when the list of databases cannot be read, still deletes the records and says the list failed (privacy review)', async () => {
    const test = await openTestDb();
    await replaceAll(test.db, snapshotV1);
    const real = test.deps.indexedDB;
    const unlistable = {
      databases: () => Promise.reject(new Error('example listing failure')),
      deleteDatabase: (name: string) => real.deleteDatabase(name),
      open: (name: string, version?: number) => real.open(name, version),
      cmp: (a: unknown, b: unknown) => real.cmp(a, b),
    } as unknown as IDBFactory;
    const deps = depsFor(test, { indexedDB: unlistable });
    const result = await deleteAllData(deps);
    expect(result).toEqual({
      ok: false,
      failed: ['list-databases'],
      blocked: false,
      recordsDeleted: true,
    });
    expect(await real.databases()).toEqual([]);
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('every step is idempotent: running it again after a success still succeeds', async () => {
    const test = await openTestDb();
    expect((await deleteAllData(depsFor(test))).ok).toBe(true);
    expect((await deleteAllData(depsFor(test))).ok).toBe(true);
    expect(await test.deps.indexedDB.databases()).toEqual([]);
  });
});
