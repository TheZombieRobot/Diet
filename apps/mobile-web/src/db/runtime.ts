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
import { browserEnv, type StorageEnv } from './env';
import { type GateReason, openTabChannel, type WriteGate, writeGate } from './gate';
import { createRepos, type Repos } from './repos';

/** The browser features the storage flows use, injectable for tests. */
export interface Platform {
  /** Offers a file as a download (files.ts). */
  readonly download: (text: string, fileName: string) => void;
  /** Loads the app again, on Today. */
  readonly reload: () => void;
  readonly postGate: (reason: GateReason) => void;
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
let tabChannel: { post: (reason: GateReason) => void } | null = null;

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

/**
 * Opens the database (section 7.1) and starts listening for other tabs' gate messages. The open
 * status store says what happened; a failure shows a storage failure screen (section 7.4).
 */
export async function startStorage(env: StorageEnv = browserEnv()): Promise<OpenStatus> {
  const deps = browserDeps();
  if (deps === null) {
    openStatusStore.set('unavailable');
    return 'unavailable';
  }
  const { status, db } = await openDietDb(env, deps, { gate: writeGate, status: openStatusStore });
  if (db === null) return status;
  tabChannel = openTabChannel(() => {
    db.closeForGood('reload-needed');
  });
  const storage = createAppStorage(db, deps);
  appStorageStore.set(storage);
  // Remembers the home zone for new records (section 3.4).
  await storage.repos.settings.get().catch(() => undefined);
  return status;
}
