/**
 * Delete all data (storage spec section 11; HEALTH_SAFETY section 7; HS-30; D45). Reached from
 * Settings, then Backup and data, after two confirmations; never from the upgrade-failed screen.
 *
 * 0. Close this tab's write gate and tell the other tabs, so no autosave, live query or other tab
 *    can write to, or reopen, the database from here on.
 * 1. Close the connection with reopening off.
 * 2. Delete every IndexedDB database on the origin (always including 'diet'). That covers every
 *    store, the laptop pairing (its key) and every photo. Other connections close on versionchange;
 *    if the deletion is still blocked after 3 s, this reports it and claims no success.
 * 3. Delete every cache except the app's own precache, so the app still opens offline.
 * 4. Clear localStorage and sessionStorage.
 * 5. Revoke every object URL the app made.
 * 6. Reload: the fresh database is created and populated, and the first-run flow starts.
 * Each step is idempotent, so a failed run can simply be repeated. Nothing here touches the network.
 */
import { DB_NAME } from '@diet/core';
import type { DietDb } from './db';
import type { GateReason, WriteGate } from './gate';

export type DeleteStep =
  'gate' | 'databases' | 'caches' | 'local-storage' | 'session-storage' | 'files';

export interface DeleteAllDeps {
  readonly db: DietDb | null;
  readonly gate: WriteGate;
  readonly postGate: (reason: GateReason) => void;
  readonly indexedDB: IDBFactory;
  readonly caches: CacheStorage | undefined;
  readonly localStorage: () => Storage;
  readonly sessionStorage: () => Storage;
  readonly revokeObjectUrls: () => void;
  readonly reload: () => void;
  /** How long a blocked deletion may wait before it is reported (3 s). */
  readonly blockedTimeoutMs?: number;
}

export interface DeleteAllResult {
  readonly ok: boolean;
  /** Steps that failed (empty on success). */
  readonly failed: readonly DeleteStep[];
  /** Another tab kept the database open: "Close the app's other tabs, then try again." */
  readonly blocked: boolean;
}

/** The app's precache, kept so the app still opens offline (vite.config.ts: Workbox). */
export const PRECACHE_PREFIX = 'workbox-precache';

/** Deletes one database; 'blocked' when other connections still hold it after the timeout. */
function deleteDatabase(
  factory: IDBFactory,
  name: string,
  timeoutMs: number,
): Promise<'deleted' | 'blocked' | 'failed'> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: 'deleted' | 'blocked' | 'failed'): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      settle('blocked');
    }, timeoutMs);
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => {
      settle('deleted');
    };
    request.onerror = () => {
      settle('failed');
    };
  });
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  const names = new Set<string>([DB_NAME]);
  if (typeof factory.databases === 'function') {
    for (const info of await factory.databases()) if (info.name !== undefined) names.add(info.name);
  }
  return [...names];
}

export async function deleteAllData(deps: DeleteAllDeps): Promise<DeleteAllResult> {
  const failed: DeleteStep[] = [];
  let blocked = false;

  // 0 and 1.
  try {
    deps.gate.close();
    deps.postGate('delete-all');
    deps.db?.shutDown();
  } catch {
    failed.push('gate');
  }

  // 2.
  try {
    const names = await databaseNames(deps.indexedDB);
    const results = await Promise.all(
      names.map((name) => deleteDatabase(deps.indexedDB, name, deps.blockedTimeoutMs ?? 3000)),
    );
    if (results.includes('blocked')) blocked = true;
    if (results.some((r) => r !== 'deleted')) failed.push('databases');
  } catch {
    failed.push('databases');
  }

  // 3.
  try {
    const { caches } = deps;
    if (caches !== undefined) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(PRECACHE_PREFIX)).map((key) => caches.delete(key)),
      );
    }
  } catch {
    failed.push('caches');
  }

  // 4.
  try {
    deps.localStorage().clear();
  } catch {
    failed.push('local-storage');
  }
  try {
    deps.sessionStorage().clear();
  } catch {
    failed.push('session-storage');
  }

  // 5.
  try {
    deps.revokeObjectUrls();
  } catch {
    failed.push('files');
  }

  // 6.
  const ok = failed.length === 0;
  if (ok) deps.reload();
  return { ok, failed, blocked };
}
