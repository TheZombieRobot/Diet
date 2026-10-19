// @vitest-environment node
// Upgrades through Dexie (storage spec sections 9.3 and 9.5; section 16 test 32; BK-10, BK-11)
// with the TEST-ONLY version-2 chains from @diet/test-fixtures, never shipped.
import { BACKUP_TABLES_BY_VERSION, DB_NAME, STORES_V1 } from '@diet/core';
import {
  chainA,
  chainB,
  chainC,
  chainDropsStore,
  chainFailing,
  chainIdentity,
  chainInvariant,
  chainKickstartCap,
  chainLosesRows,
  type ProfileV2,
  type SettingsV2,
  snapshotV1,
  SYNTHETIC_PHRASE,
} from '@diet/test-fixtures';
import type { DBCore, Middleware } from 'dexie';
import { describe, expect, it } from 'vitest';
import { createStore } from '../store';
import { installedNativeVersion, openDietDb, type OpenStatus } from './db';
import { createUpgradeRescueCopy } from './exportBackup';
import { decodeImport } from './importBackup';
import { readRescueRows } from './rescue';
import { replaceAll } from './snapshot';
import {
  backupSnapshot,
  freshDeps,
  openTestDb,
  pairingRow,
  photoRow,
  rawWriter,
  type TestDb,
} from './testKit';

/** A version-1 database holding the fixture, closed again, ready for an upgrade. */
async function v1Database(prepare?: (test: TestDb) => Promise<void>): Promise<TestDb> {
  const test = await openTestDb();
  await replaceAll(test.db, snapshotV1);
  if (prepare !== undefined) await prepare(test);
  test.db.shutDown();
  return test;
}

/** Records the stores each write request touches. */
function writeSpy(): { middleware: Middleware<DBCore>; tables: Set<string> } {
  const tables = new Set<string>();
  return {
    tables,
    middleware: {
      stack: 'dbcore',
      name: 'test-write-spy',
      level: 0,
      create: (down) => ({
        ...down,
        table: (name) => {
          const inner = down.table(name);
          return {
            ...inner,
            mutate: (request) => {
              tables.add(name);
              return inner.mutate(request);
            },
          };
        },
      }),
    },
  };
}

describe('upgrades through Dexie (section 16 test 32)', () => {
  it('chain (a) migrates and validates the version-1 database, rewriting only the stores the step changes', async () => {
    const v1 = await v1Database(async (test) => {
      await test.db.settings.put({ ...(await test.repos.settings.get()), textSize: 'largest' });
    });
    const spy = writeSpy();
    const upgraded = await openTestDb({
      deps: v1.deps,
      env: v1.env,
      chain: chainA,
      extraMiddleware: [spy.middleware],
    });
    expect(upgraded.db.backendDB().version).toBe(20);
    const profile = (await upgraded.db.profile.get('singleton')) as unknown as ProfileV2;
    expect(profile.compactView).toBe(false);
    const settings = (await upgraded.db.settings.get('singleton')) as unknown as SettingsV2;
    expect(settings.textSize).toBe('extra-large');
    expect([...spy.tables].sort()).toEqual(['profile', 'settings']);
    expect(await upgraded.db.weights.toArray()).toEqual(snapshotV1.weights);
    expect(await upgraded.db.audit.count()).toBe(snapshotV1.audit.length);
  });

  it('chain (b) maps a stored 20 to 18, writes a migration audit row and marks the v2 update notice', async () => {
    const v1 = await v1Database(async (test) => {
      await test.db.targets.put({ ...(await test.repos.targets.get()), steadyDeficitPct: 20 });
    });
    const upgraded = await openTestDb({ deps: v1.deps, env: v1.env, chain: chainB });
    expect((await upgraded.db.targets.get('singleton'))?.steadyDeficitPct).toBe(18);
    const migrations = (await upgraded.db.audit.toArray()).filter(
      (a) => a.kind === 'migration' && !snapshotV1.audit.some((b) => b.id === a.id),
    );
    expect(migrations).toEqual([
      expect.objectContaining({
        table: 'targets',
        recordId: 'singleton',
        reason: 'Steady deficit was changed to fit the limits of app version 2.',
      }),
    ]);
    expect(await upgraded.db.card_state.get(['update-notice', 'v2'])).toMatchObject({
      firstShownAt: v1.env.now(),
      doneAt: null,
    });
  });

  it('a failing version-2 step reports upgrade-failed, leaves version 1 and its data untouched, and the rescue copy imports into a version-1 app', async () => {
    const v1 = await v1Database();
    const before = await (async () => {
      const again = await openTestDb({ deps: v1.deps, env: v1.env });
      const snapshot = await backupSnapshot(again.db);
      again.db.shutDown();
      return snapshot;
    })();
    const status = createStore<OpenStatus>('opening');
    const result = await openDietDb(v1.env, v1.deps, { chain: chainFailing, status });
    expect(result).toEqual({ status: 'upgrade-failed', db: null });
    expect(status.get()).toBe('upgrade-failed');
    expect(await installedNativeVersion(v1.deps.indexedDB)).toBe(10);

    const rows = await readRescueRows(v1.deps.indexedDB);
    expect(rows?.schemaVersion).toBe(1);
    expect(Object.keys(rows?.tables ?? {})).toEqual(BACKUP_TABLES_BY_VERSION[1]);
    // Locked, as the screen makes it by default, with real WebCrypto.
    const rescue = await createUpgradeRescueCopy(v1.deps.indexedDB, v1.env, SYNTHETIC_PHRASE);
    expect(rescue?.fileName).toBe('diet-backup-2000-03-01-rescue-locked.json');
    expect(rescue?.file.text).not.toContain(snapshotV1.weights[1]?.note ?? 'Example note');

    const unchanged = await openTestDb({ deps: v1.deps, env: v1.env });
    expect(await backupSnapshot(unchanged.db)).toStrictEqual(before);

    const elsewhere = await openTestDb();
    const decoded = await decodeImport(
      { text: rescue?.file.text ?? '', sizeBytes: rescue?.file.text.length ?? 0 },
      SYNTHETIC_PHRASE,
      elsewhere.env,
    );
    expect(decoded.kind).toBe('rescue');
    expect(decoded.locked).toBe(true);
    expect(decoded.setAside).toEqual([]);
    expect(decoded.snapshot.weights).toEqual(before.weights);
  });

  it.each([
    ['leaves out a store it rewrites', chainDropsStore],
    ['loses rows it does not declare it removes', chainLosesRows],
    ['makes valid rows that break the cross-record rules', chainInvariant],
    ['takes the Kickstart history past 42 days', chainKickstartCap],
  ] as const)(
    'a version-2 step that %s reports upgrade-failed and leaves version 1 exactly as it was (data-loss review)',
    async (_, chain) => {
      const v1 = await v1Database();
      const again = await openTestDb({ deps: v1.deps, env: v1.env });
      const before = await backupSnapshot(again.db);
      again.db.shutDown();
      const status = createStore<OpenStatus>('opening');
      const result = await openDietDb(v1.env, v1.deps, { chain, status });
      expect(result).toEqual({ status: 'upgrade-failed', db: null });
      expect(await installedNativeVersion(v1.deps.indexedDB)).toBe(10);
      const unchanged = await openTestDb({ deps: v1.deps, env: v1.env });
      expect(await backupSnapshot(unchanged.db)).toStrictEqual(before);
      unchanged.db.shutDown();
    },
  );

  it('a device-only row that fails the last-step check (a photo 5,000 px wide) is deleted, and the upgrade succeeds', async () => {
    const v1 = await v1Database();
    const raw = await rawWriter(v1.deps, STORES_V1);
    await raw.table('garden_photos').put(photoRow(snapshotV1.garden[0]?.id ?? '', 5000));
    await raw.table('transfer_pairings').put(await pairingRow());
    raw.close();
    const upgraded = await openTestDb({ deps: v1.deps, env: v1.env, chain: chainIdentity });
    expect(upgraded.status.get()).toBe('ready');
    expect(await upgraded.db.garden_photos.count()).toBe(0);
    // The pairing is valid, so it is kept (a changed relay origin is compared only at use).
    expect(await upgraded.db.transfer_pairings.count()).toBe(1);
    expect(await upgraded.db.weights.toArray()).toEqual(snapshotV1.weights);
  });

  it('chain (c) adds a backed-up store and a device-only store to a version-1 database', async () => {
    const v1 = await v1Database();
    const upgraded = await openTestDb({ deps: v1.deps, env: v1.env, chain: chainC });
    const names = Array.from(upgraded.db.backendDB().objectStoreNames);
    expect(names).toContain('example_notes');
    expect(names).toContain('example_cache');
    expect(await upgraded.db.table('example_notes').count()).toBe(0);
  });

  it('the rescue read writes a listed store that does not exist as an empty array, and never reads a device-only store', async () => {
    const deps = freshDeps();
    // A version-1 database (native 10) missing the audit store: the shape a failed step that
    // added a store would leave if the database were ever caught between versions.
    await new Promise<void>((resolve, reject) => {
      const request = deps.indexedDB.open(DB_NAME, 10);
      request.onupgradeneeded = () => {
        for (const [name, schema] of Object.entries(STORES_V1)) {
          if (name === 'audit') continue;
          const key = schema.split(',')[0]?.trim() ?? 'id';
          const compound = /^\[(.+)\]$/.exec(key);
          request.result.createObjectStore(name, {
            keyPath: compound?.[1] === undefined ? key : compound[1].split('+'),
          });
        }
        request.transaction?.objectStore('weights').put(snapshotV1.weights[0]);
        request.transaction?.objectStore('garden_photos').put(photoRow('x'));
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
    });
    const rows = await readRescueRows(deps.indexedDB);
    expect(rows?.tables['audit']).toEqual([]);
    expect(rows?.tables['weights']).toEqual([snapshotV1.weights[0]]);
    expect(Object.hasOwn(rows?.tables ?? {}, 'garden_photos')).toBe(false);
    expect(Object.hasOwn(rows?.tables ?? {}, 'transfer_pairings')).toBe(false);
  });

  it('there is nothing to rescue when no database exists', async () => {
    expect(await readRescueRows(freshDeps().indexedDB)).toBeNull();
  });
});
