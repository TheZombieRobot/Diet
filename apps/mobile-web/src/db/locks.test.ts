// @vitest-environment node
// The cross-tab lock handshake (storage spec section 7.5; data-loss review; locks.ts), over real
// Dexie on fake-indexeddb with the Web Locks fake of testKit: a restore or delete-all writes only
// once every other tab has closed its records, a busy tab can no longer write on top of restored
// records, and a tab that does not let go blocks the write instead of racing it.
import { DB_NAME, STORES_V1 } from '@diet/core';
import { fixtureId, plainReferenceEnvelopeV1, snapshotV1 } from '@diet/test-fixtures';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../store';
import type { OpenStatus } from './db';
import { deleteAllData } from './deleteAll';
import { StorageClosedError } from './errors';
import { createWriteGate, openTabChannel } from './gate';
import { decodeImport, type ImportPlan, planImport, writeImport } from './importBackup';
import { holdOpenLock, type LockManagerLike, type OpenLock, withExclusiveLock } from './locks';
import { type AppStorage, startStorage } from './runtime';
import {
  backupSnapshot,
  FakeLockManager,
  freshDeps,
  locksFor,
  memoryStorage,
  openTestDb,
  rawWriter,
  type TestDb,
  testEnv,
  testPlatform,
} from './testKit';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const clean of cleanups.splice(0)) clean();
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function planFor(test: TestDb): Promise<ImportPlan> {
  const text = plainReferenceEnvelopeV1();
  const decoded = await decodeImport({ text, sizeBytes: text.length }, null, test.env);
  return planImport(test.db, decoded);
}

/**
 * Another tab, busy writing: a raw connection that holds the shared lock and writes weigh-ins in
 * a tight loop. Told about the restore, it takes `noticeMs` to notice, then closes its connection
 * and lets go of the lock, as a tab does on the gate message.
 */
async function busyTab(
  test: TestDb,
  locks: LockManagerLike | null,
  noticeMs: number,
): Promise<{ readonly tell: () => void; readonly done: Promise<number> }> {
  const lock: OpenLock = await holdOpenLock(locks);
  const raw: Dexie = await rawWriter(test.deps, STORES_V1);
  const weight = snapshotV1.weights[3];
  const state = { stop: false };
  const done = (async () => {
    let n = 0;
    while (!state.stop) {
      await raw.table('weights').put({ ...weight, id: fixtureId(9000 + n), kg: 70 });
      n += 1;
    }
    raw.close();
    lock.release();
    return n;
  })();
  return {
    tell: () => {
      setTimeout(() => {
        state.stop = true;
      }, noticeMs);
    },
    done,
  };
}

describe('the lock primitives (locks.ts)', () => {
  it('the exclusive lock waits for every shared holder; work never runs when it is not granted in time', async () => {
    const locks = new FakeLockManager();
    const shared = await holdOpenLock(locks);
    const work = vi.fn(() => Promise.resolve('written'));
    expect(await withExclusiveLock(locks, work, 30)).toEqual({ granted: false });
    expect(work).not.toHaveBeenCalled();
    expect(locks.holders).toEqual({ shared: 1, exclusive: 0 });

    const waiting = withExclusiveLock(locks, work, 1000);
    await sleep(10);
    expect(work).not.toHaveBeenCalled();
    shared.release();
    expect(await waiting).toEqual({ granted: true, value: 'written' });
    expect(locks.holders).toEqual({ shared: 0, exclusive: 0 });
  });

  it('a tab opening while a restore holds the lock waits until the restore is done', async () => {
    const locks = new FakeLockManager();
    let finish: () => void = () => undefined;
    const restore = withExclusiveLock(
      locks,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await sleep(0);
    let opened = false;
    const opening = holdOpenLock(locks).then((lock) => {
      opened = true;
      return lock;
    });
    await sleep(10);
    expect(opened).toBe(false);
    finish();
    await restore;
    (await opening).release();
    expect(opened).toBe(true);
  });

  it('an error inside the exclusive lock is passed on, and without Web Locks the work runs at once', async () => {
    const locks = new FakeLockManager();
    await expect(
      withExclusiveLock(locks, () => Promise.reject(new Error('example failure'))),
    ).rejects.toThrow('example failure');
    expect(locks.holders).toEqual({ shared: 0, exclusive: 0 });
    expect(await withExclusiveLock(null, () => Promise.resolve(1))).toEqual({
      granted: true,
      value: 1,
    });
  });
});

describe('restore and delete-all against another tab (section 7.5; data-loss review)', () => {
  it('a restore waits for a busy tab to stop writing: the records afterwards are exactly the file', async () => {
    const test = await openTestDb();
    const locks = locksFor(test.deps.indexedDB);
    const plan = await planFor(test);
    const other = await busyTab(test, locks, 30);
    const outcome = await writeImport(test.db, plan, test.env, {
      postGate: other.tell,
      locks,
      requestPersistentStorage: () => Promise.resolve(),
      reload: () => undefined,
    });
    expect(outcome).toEqual({ ok: true });
    expect(await other.done).toBeGreaterThan(0);
    expect(await backupSnapshot(test.db)).toEqual(plan.snapshot);
    test.db.shutDown();
  });

  it('control: without the lock, the same busy tab writes on top of the restored records', async () => {
    const test = await openTestDb();
    const plan = await planFor(test);
    const other = await busyTab(test, null, 30);
    const outcome = await writeImport(test.db, plan, test.env, {
      postGate: other.tell,
      locks: null,
      requestPersistentStorage: () => Promise.resolve(),
      reload: () => undefined,
    });
    expect(outcome).toEqual({ ok: true });
    await other.done;
    expect((await backupSnapshot(test.db)).weights.length).toBeGreaterThan(
      plan.snapshot.weights.length,
    );
    test.db.shutDown();
  });

  it('a tab that does not let go blocks the restore: nothing is written, and it can be tried again', async () => {
    const test = await openTestDb();
    const locks = locksFor(test.deps.indexedDB);
    await test.repos.weights.create({ kg: 81, source: 'manual', note: null });
    const before = await backupSnapshot(test.db);
    const plan = await planFor(test);
    const stuck = await holdOpenLock(locks);
    const deps = {
      postGate: vi.fn(),
      locks,
      lockWaitMs: 50,
      requestPersistentStorage: vi.fn(() => Promise.resolve()),
      reload: vi.fn(),
    };
    const outcome = await writeImport(test.db, plan, test.env, deps);
    expect(outcome).toMatchObject({ ok: false, blocked: true });
    expect(deps.reload).not.toHaveBeenCalled();
    expect(deps.requestPersistentStorage).not.toHaveBeenCalled();
    expect(test.db.gate.isOpen()).toBe(false);
    expect(await backupSnapshot(test.db)).toEqual(before);

    stuck.release();
    expect(await writeImport(test.db, plan, test.env, deps)).toEqual({ ok: true });
    expect(await backupSnapshot(test.db)).toEqual(plan.snapshot);
    test.db.shutDown();
  });

  it('a tab that does not let go blocks delete-all: the records stay and no success is claimed', async () => {
    const test = await openTestDb();
    const locks = locksFor(test.deps.indexedDB);
    const stuck = await holdOpenLock(locks);
    cleanups.push(stuck.release);
    const reload = vi.fn();
    const result = await deleteAllData({
      db: test.db,
      gate: test.db.gate,
      postGate: vi.fn(),
      locks,
      indexedDB: test.deps.indexedDB,
      caches: undefined,
      localStorage: () => memoryStorage(),
      sessionStorage: () => memoryStorage(),
      revokeObjectUrls: vi.fn(),
      reload,
      blockedTimeoutMs: 50,
    });
    expect(result).toEqual({ ok: false, failed: ['databases'], blocked: true });
    expect(reload).not.toHaveBeenCalled();
    expect((await test.deps.indexedDB.databases()).map((d) => d.name)).toEqual([DB_NAME]);
  });
});

describe('startStorage holds the lock and listens for other tabs (runtime.ts)', () => {
  async function start(deps = freshDeps(), locks = locksFor(deps.indexedDB)) {
    const status = createStore<OpenStatus>('opening');
    const store = createStore<AppStorage | null>(null);
    const started = await startStorage({
      env: testEnv(),
      deps,
      locks,
      gate: createWriteGate(),
      status,
      platform: testPlatform(),
      store,
    });
    cleanups.push(() => started.channel?.stop());
    return { ...started, status, store, locks, deps };
  }

  it('an open tab holds the shared lock; a gate message from another tab closes it for good and lets go', async () => {
    const tab = await start();
    expect(tab.status.get()).toBe('ready');
    expect(tab.store.get()).toBe(tab.storage);
    expect(tab.locks.holders).toEqual({ shared: 1, exclusive: 0 });
    const storage = tab.storage;
    if (storage === null) throw new Error('not opened');

    const other = openTabChannel(() => undefined);
    cleanups.push(other.stop);
    other.post('import');
    await vi.waitFor(() => {
      expect(tab.status.get()).toBe('reload-needed');
    });
    await expect(
      storage.repos.water.create({ ml: 250, electrolyte: false }),
    ).rejects.toBeInstanceOf(StorageClosedError);
    expect(tab.locks.holders).toEqual({ shared: 0, exclusive: 0 });
    // The exclusive lock is now granted at once.
    expect(await withExclusiveLock(tab.locks, () => Promise.resolve('ok'), 50)).toEqual({
      granted: true,
      value: 'ok',
    });
  });

  it('a restore in a started tab first gives up that tab’s own shared lock, so it is not blocked by itself', async () => {
    const tab = await start();
    const storage = tab.storage;
    if (storage === null) throw new Error('not opened');
    const text = plainReferenceEnvelopeV1();
    const decoded = await decodeImport({ text, sizeBytes: text.length }, null, storage.env);
    const plan = await planImport(storage.db, decoded);
    const outcome = await writeImport(storage.db, plan, storage.env, {
      postGate: vi.fn(),
      locks: tab.locks,
      lockWaitMs: 300,
      requestPersistentStorage: () => Promise.resolve(),
      reload: vi.fn(),
    });
    expect(outcome).toEqual({ ok: true });
    expect(await backupSnapshot(storage.db)).toEqual(plan.snapshot);
    storage.db.shutDown();
  });

  it('a database that does not open lets go of the lock', async () => {
    const deps = freshDeps();
    const newer = new Dexie(DB_NAME, { indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange });
    newer.version(1).stores(STORES_V1);
    newer.version(2).stores({ example_extra: 'id' });
    await newer.open();
    newer.close();
    const tab = await start(deps);
    expect(tab.status.get()).toBe('newer-version');
    expect(tab.storage).toBeNull();
    expect(tab.locks.holders).toEqual({ shared: 0, exclusive: 0 });
  });
});
