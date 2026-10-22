/**
 * The app's storage at run time: the opened database, its repositories, and the few browser
 * features the backup and delete-all flows use. main.tsx starts it once; screens read it from
 * appStorageStore (null until the database is open, and for good when it could not be opened).
 * Tests set appStorageStore to a runtime over a fresh fake-indexeddb factory with a fake platform.
 */
import { createStore, type Store } from '../store';
import { onOnboardingCompleted, requestPersistentStorage } from '../pwa/storage';
import { revokeAllObjectUrls, offerDownload } from '../files';
import { type DbDeps, type DietDb, openDietDb, openStatusStore, type OpenStatus } from './db';
import { setPendingCheck } from '../screens/backup/pendingCheck';
import { finishDraftStore } from '../screens/move/finishDrafts';
import { preStartSeenStore, preStartStopSignStore } from '../screens/weight/preStartCheck';
import { browserEnv, type StorageEnv } from './env';
import { ensureGeneration } from './generation';
import {
  browserChannel,
  type ChannelFactory,
  type GateReason,
  openTabChannel,
  type TabChannel,
  type WriteGate,
  writeGate,
} from './gate';
import { browserLocks, holdOpenLock, type LockManagerLike } from './locks';
import { createRepos, type Repos } from './repos';

/** The browser features the storage flows use, injectable for tests. */
export interface Platform {
  /** Offers a file as a download (files.ts). */
  readonly download: (text: string, fileName: string) => void;
  /** Loads the app again, on Today. */
  readonly reload: () => void;
  readonly postGate: (reason: GateReason) => void;
  /** Web Locks (locks.ts), or null where the browser has none. */
  readonly locks: () => LockManagerLike | null;
  readonly requestPersistentStorage: () => Promise<unknown>;
  readonly caches: () => CacheStorage | undefined;
  readonly localStorage: () => Storage;
  readonly sessionStorage: () => Storage;
  readonly revokeObjectUrls: () => void;
}

export interface AppStorage {
  readonly db: DietDb;
  readonly repos: Repos;
  readonly env: StorageEnv;
  readonly gate: WriteGate;
  readonly deps: DbDeps;
  readonly platform: Platform;
}

/** This tab's end of the 'diet-db' channel, once the database is open. */
let tabChannel: TabChannel | null = null;

export const browserPlatform: Platform = {
  download: (text, fileName) => {
    offerDownload(text, fileName);
  },
  // After an import or delete-all the app starts again on Today (storage spec sections 10.6, 11).
  reload: () => {
    window.location.replace(`${window.location.pathname}${window.location.search}`);
  },
  postGate: (reason) => {
    tabChannel?.post(reason);
  },
  locks: browserLocks,
  requestPersistentStorage: () => requestPersistentStorage(),
  caches: () => ('caches' in window ? window.caches : undefined),
  localStorage: () => window.localStorage,
  sessionStorage: () => window.sessionStorage,
  revokeObjectUrls: revokeAllObjectUrls,
};

/** This tab's storage, once the database is open. */
export const appStorageStore: Store<AppStorage | null> = createStore<AppStorage | null>(null);

/** The runtime over an opened database. */
export function createAppStorage(
  db: DietDb,
  deps: DbDeps,
  platform: Platform = browserPlatform,
): AppStorage {
  const repos = createRepos({ db, env: db.env, gate: db.gate, hooks: { onOnboardingCompleted } });
  return { db, repos, env: db.env, gate: db.gate, deps, platform };
}

const browserDeps = (): DbDeps | null =>
  typeof indexedDB === 'undefined' || typeof IDBKeyRange === 'undefined'
    ? null
    : { indexedDB, IDBKeyRange };

/** What startStorage uses; each defaults to the browser's (tests pass fakes). */
export interface StartOptions {
  readonly env?: StorageEnv;
  /** IndexedDB; null when the browser has none. */
  readonly deps?: DbDeps | null;
  readonly channels?: ChannelFactory;
  readonly locks?: LockManagerLike | null;
  readonly gate?: WriteGate;
  readonly status?: Store<OpenStatus>;
  readonly platform?: Platform;
  readonly store?: Store<AppStorage | null>;
}

export interface StartedStorage {
  readonly status: OpenStatus;
  readonly storage: AppStorage | null;
  /** This tab's end of the 'diet-db' channel (null when the database did not open). */
  readonly channel: TabChannel | null;
}

/**
 * What a delete-all in another tab also clears here (HS-30; full review F8): this tab's session
 * storage, which delete-all cannot reach from the other tab, and the pre-start answer and the
 * unsaved session ratings and notes this page holds in memory. Each step in its own try, so one
 * failure never stops the other.
 */
function forgetThisTab(platform: Platform): void {
  try {
    platform.sessionStorage().clear();
  } catch {
    // Blocked storage holds nothing to clear.
  }
  preStartStopSignStore.set(null);
  preStartSeenStore.set(null);
  finishDraftStore.set({});
}

/**
 * Opens the database (section 7.1) holding this tab's shared lock (locks.ts), and starts
 * listening for other tabs' gate messages: a restore or delete-all in another tab closes this
 * tab's database for good, which also lets go of the lock, and drops an unanswered "Can you see
 * the file?" (its file no longer matches the records); a delete-all also clears this tab's session
 * storage and in-memory pre-start answer (forgetThisTab). The records' generation is started when
 * the database was just created (generation.ts). The open status store says what happened; a
 * failure shows a storage failure screen (section 7.4).
 */
export async function startStorage(options: StartOptions = {}): Promise<StartedStorage> {
  const status = options.status ?? openStatusStore;
  const deps = options.deps === undefined ? browserDeps() : options.deps;
  if (deps === null) {
    status.set('unavailable');
    return { status: 'unavailable', storage: null, channel: null };
  }
  const env = options.env ?? browserEnv();
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const lock = await holdOpenLock(locks).catch(() => holdOpenLock(null));
  const opened = await openDietDb(env, deps, { gate: options.gate ?? writeGate, status });
  const { db } = opened;
  if (db === null) {
    lock.release();
    return { status: opened.status, storage: null, channel: null };
  }
  db.attachOpenLock(lock);
  const platform = options.platform ?? browserPlatform;
  const channel = openTabChannel((reason) => {
    db.closeForGood('reload-needed');
    setPendingCheck(null);
    if (reason === 'delete-all') forgetThisTab(platform);
  }, options.channels ?? browserChannel);
  if (options.store === undefined) tabChannel = channel;
  const storage = createAppStorage(db, deps, platform);
  ensureGeneration(storage.platform.localStorage, () => env.randomId(), db.populated);
  (options.store ?? appStorageStore).set(storage);
  // Remembers the home zone for new records (section 3.4).
  await storage.repos.settings.get().catch(() => undefined);
  return { status: opened.status, storage, channel };
}
