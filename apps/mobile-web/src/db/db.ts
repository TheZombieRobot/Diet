/**
 * The phone's database (storage spec section 7; D16): the DietDb Dexie subclass, the open
 * sequence, version-change handling and the open status.
 *
 * Dexie 4.4.6 does not report a database newer than the code: on a VersionError it opens again at
 * the installed version, and if a store or index is missing it enters "schema patch mode" and
 * changes the newer database. Its own version-change handler also closes with reopening left on.
 * Old code meets a newer database in real ways (a stale tab, a rolled-back deploy, a service
 * worker still serving the old copy), so:
 * - the installed version is checked with raw IndexedDB before Dexie runs, without ever creating
 *   the database (installedNativeVersion);
 * - autoOpen is false, so a query after a close fails instead of quietly reopening;
 * - the version-change handler is replaced, so Dexie never reopens by itself;
 * - after opening, the native version and the store set must match exactly.
 */
import {
  chainInfo,
  DB_NAME,
  type Migration,
  MIGRATIONS,
  type StoreName,
  type StoreRecords,
} from '@diet/core';
import Dexie, { type DBCore, type Middleware, type Table } from 'dexie';
import { createStore, type Store } from '../store';
import { migrationEnv, type StorageEnv } from './env';
import { createWriteGate, type WriteGate } from './gate';
import type { OpenLock } from './locks';
import { validationMiddleware } from './middleware';
import { populate, runUpgrade } from './upgrade';

/** The open status (section 7.4). Every status but 'opening' and 'ready' shows a storage failure screen. */
export type OpenStatus =
  'opening' | 'ready' | 'newer-version' | 'upgrade-failed' | 'unavailable' | 'reload-needed';

export type FailureStatus = Exclude<OpenStatus, 'opening' | 'ready'>;

/** This tab's open status. */
export const openStatusStore: Store<OpenStatus> = createStore<OpenStatus>('opening');

/** What IndexedDB is reached through: the browser's, or a fresh fake-indexeddb factory in tests. */
export interface DbDeps {
  readonly indexedDB: IDBFactory;
  readonly IDBKeyRange: typeof IDBKeyRange;
}

export interface DietDbOptions extends DbDeps {
  readonly env: StorageEnv;
  readonly name?: string;
  readonly gate?: WriteGate;
  readonly status?: Store<OpenStatus>;
  /** A test-only migration chain; the app always uses the released MIGRATIONS. */
  readonly chain?: readonly Migration[];
  /** Test-only middlewares (for example one that fails a chosen write). */
  readonly extraMiddleware?: readonly Middleware<DBCore>[];
}

type KeyOf<K extends StoreName> = K extends 'card_state' ? [string, string] : string;
type Stores = { readonly [K in StoreName]: Table<StoreRecords[K], KeyOf<K>> };

export class DietDb extends Dexie {
  declare readonly profile: Stores['profile'];
  declare readonly readiness: Stores['readiness'];
  declare readonly targets: Stores['targets'];
  declare readonly settings: Stores['settings'];
  declare readonly kickstart_periods: Stores['kickstart_periods'];
  declare readonly kickstart_checks: Stores['kickstart_checks'];
  declare readonly weights: Stores['weights'];
  declare readonly fasts: Stores['fasts'];
  declare readonly symptom_log: Stores['symptom_log'];
  declare readonly water_log: Stores['water_log'];
  declare readonly steps_log: Stores['steps_log'];
  declare readonly ingredients: Stores['ingredients'];
  declare readonly ingredient_overrides: Stores['ingredient_overrides'];
  declare readonly recipes: Stores['recipes'];
  declare readonly plan_days: Stores['plan_days'];
  declare readonly food_log: Stores['food_log'];
  declare readonly garden: Stores['garden'];
  declare readonly garden_photos: Stores['garden_photos'];
  declare readonly pantry: Stores['pantry'];
  declare readonly sessions: Stores['sessions'];
  declare readonly beverages: Stores['beverages'];
  declare readonly drinks_log: Stores['drinks_log'];
  declare readonly alcohol_day_notes: Stores['alcohol_day_notes'];
  declare readonly alcohol_milestones: Stores['alcohol_milestones'];
  declare readonly grocery_lists: Stores['grocery_lists'];
  declare readonly transfer_pairings: Stores['transfer_pairings'];
  declare readonly card_state: Stores['card_state'];
  declare readonly audit: Stores['audit'];

  readonly env: StorageEnv;
  readonly gate: WriteGate;
  readonly status: Store<OpenStatus>;
  readonly chain: readonly Migration[];
  /** Set once the open sequence has finished and every check passed. */
  ready = false;
  private shut = false;
  /** This tab's shared 'diet-db-open' lock (locks.ts), held while the database is open. */
  private openLock: OpenLock | null = null;

  constructor(options: DietDbOptions) {
    super(options.name ?? DB_NAME, {
      indexedDB: options.indexedDB,
      IDBKeyRange: options.IDBKeyRange,
      autoOpen: false,
    });
    this.env = options.env;
    this.gate = options.gate ?? createWriteGate();
    this.status = options.status ?? openStatusStore;
    this.chain = options.chain ?? MIGRATIONS;
    const info = chainInfo(this.chain);
    const specs = info.specsByVersion[info.schemaVersion] ?? {};
    for (const step of this.chain) {
      const version = this.version(step.version).stores(step.stores);
      if (step.upgrade !== null) {
        version.upgrade((tx) =>
          runUpgrade(tx, { step, chain: this.chain, env: migrationEnv(options.env) }),
        );
      }
    }
    this.on('populate', (tx) => populate(tx, options.env, specs));
    // Runs before Dexie's own handler; returning false stops that one, which would close with
    // reopening left on.
    this.on('versionchange', () => {
      this.closeForGood('reload-needed');
      return false;
    });
    // The browser closed the connection (Dexie also fires this for its own closes).
    this.on('close', () => {
      if (this.ready) this.closeForGood('reload-needed');
    });
    this.use(validationMiddleware(specs));
    for (const middleware of options.extraMiddleware ?? []) this.use(middleware);
  }

  /** The current version's store names, in section 4.1 order. */
  get expectedStoreNames(): readonly string[] {
    const info = chainInfo(this.chain);
    return info.storeNamesByVersion[info.schemaVersion] ?? [];
  }

  /**
   * Closes the write gate (which stops live queries) and the connection, with reopening off.
   * Nothing reopens it except a page reload. The status is left alone: delete-all and import
   * use this before they reload the page themselves.
   */
  shutDown(): void {
    if (this.shut) return;
    this.shut = true;
    this.ready = false;
    this.gate.close();
    this.close({ disableAutoOpen: true });
    // Only now, with the gate and the connection closed, may a restore or delete-all in another
    // tab go ahead (section 7.5).
    this.releaseOpenLock();
  }

  /** Keeps this tab's shared lock until shutDown (released at once if already shut down). */
  attachOpenLock(lock: OpenLock): void {
    if (this.shut) {
      lock.release();
      return;
    }
    this.releaseOpenLock();
    this.openLock = lock;
  }

  /**
   * Gives up this tab's shared lock. A restore or delete-all in this tab does this after closing
   * its own write gate, just before it asks for the lock in exclusive mode.
   */
  releaseOpenLock(): void {
    const lock = this.openLock;
    this.openLock = null;
    lock?.release();
  }

  /** shutDown, then the storage failure screen for `status` (section 7.2). */
  closeForGood(status: OpenStatus): void {
    if (this.shut) return;
    this.shutDown();
    this.status.set(status);
  }

  get isShutDown(): boolean {
    return this.shut;
  }
}

/** The installed native IndexedDB version of `name`, or null when there is no such database. Never creates one. */
export async function installedNativeVersion(
  factory: IDBFactory,
  name: string = DB_NAME,
): Promise<number | null> {
  if (typeof factory.databases === 'function') {
    return (await factory.databases()).find((d) => d.name === name)?.version ?? null;
  }
  return new Promise((resolve, reject) => {
    // No version: opens at whatever is installed. A database that does not exist yet would be
    // created at version 1, so its upgrade is aborted, which deletes it again.
    const request = factory.open(name);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) request.transaction?.abort();
    };
    request.onsuccess = () => {
      const { version } = request.result;
      request.result.close();
      resolve(version);
    };
    request.onerror = (event) => {
      if (request.error?.name === 'AbortError') {
        event.preventDefault();
        resolve(null);
      } else {
        reject(request.error ?? new Error('IndexedDB could not be opened'));
      }
    };
  });
}

const UPGRADE_ERRORS = new Set([
  'UpgradeError',
  'AbortError',
  'StorageValidationError',
  'StorageInvariantError',
  'MigrationError',
]);

/** The status for an error from db.open() (section 7.4). */
export function mapOpenError(error: unknown, upgrading: boolean): FailureStatus {
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  if (typeof name === 'string') {
    if (name === 'VersionError') return 'newer-version';
    if (name === 'DatabaseClosedError') return 'reload-needed';
    if (UPGRADE_ERRORS.has(name) && (upgrading || name !== 'AbortError')) return 'upgrade-failed';
  }
  return 'unavailable';
}

/** Exactly the expected stores: a Dexie $meta store, or any extra or missing store, fails. */
export function sameStoreSet(installed: DOMStringList, expected: readonly string[]): boolean {
  const names = Array.from(installed);
  return names.length === expected.length && expected.every((name) => names.includes(name));
}

export interface OpenResult {
  readonly status: OpenStatus;
  readonly db: DietDb | null;
}

/**
 * db.open() and the exact checks after it (section 7.1). The post-open check is defence in depth
 * for the moment between the pre-check and the open, when another tab could upgrade.
 */
export async function openAndVerify(db: DietDb, installed: number | null): Promise<OpenResult> {
  const info = chainInfo(db.chain);
  const expected = info.schemaVersion * 10;
  const upgrading = installed !== null && installed > 0 && installed < expected;
  try {
    await db.open();
  } catch (error) {
    const status = mapOpenError(error, upgrading);
    db.closeForGood(status);
    return { status, db: null };
  }
  const idb = db.backendDB();
  if (idb.version !== expected || !sameStoreSet(idb.objectStoreNames, db.expectedStoreNames)) {
    const status = idb.version > expected ? 'newer-version' : 'unavailable';
    db.closeForGood(status);
    return { status, db: null };
  }
  db.ready = true;
  db.status.set('ready');
  return { status: 'ready', db };
}

export interface OpenOptions extends Omit<DietDbOptions, 'env' | 'indexedDB' | 'IDBKeyRange'> {
  /** Test seam: how the DietDb is made (a test checks it is never made for a newer database). */
  readonly createDb?: (options: DietDbOptions) => DietDb;
}

/** The open sequence (section 7.1). Old code never opens, and never changes, a newer database. */
export async function openDietDb(
  env: StorageEnv,
  deps: DbDeps,
  options: OpenOptions = {},
): Promise<OpenResult> {
  const { createDb = (o: DietDbOptions) => new DietDb(o), ...rest } = options;
  const status = rest.status ?? openStatusStore;
  const info = chainInfo(rest.chain ?? MIGRATIONS);
  let installed: number | null;
  try {
    installed = await installedNativeVersion(deps.indexedDB, rest.name ?? DB_NAME);
  } catch {
    status.set('unavailable');
    return { status: 'unavailable', db: null };
  }
  if (installed !== null && installed > info.schemaVersion * 10) {
    status.set('newer-version');
    return { status: 'newer-version', db: null };
  }
  let db: DietDb;
  try {
    db = createDb({ ...rest, env, indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange });
  } catch {
    status.set('unavailable');
    return { status: 'unavailable', db: null };
  }
  return openAndVerify(db, installed);
}
