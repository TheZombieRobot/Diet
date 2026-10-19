/**
 * Shared helpers for the database tests (storage spec section 16, tests 22 to 45): a controllable
 * clock, a fresh fake-indexeddb factory per test (full isolation), a fake platform that records
 * downloads and reloads, and synthetic device-only rows. Imported only by tests; nothing here
 * describes anyone.
 */
import {
  BACKUP_TABLES,
  type GardenPhotoRecord,
  type Instant,
  type Migration,
  READINESS_QUESTION_IDS,
  type ReadinessConfirmationId,
  type ReadinessQuestionId,
  type Snapshot,
  type TransferPairingRecord,
  type YesNo,
} from '@diet/core';
import { fixtureId } from '@diet/test-fixtures';
import Dexie, { type DBCore, type Middleware } from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createStore, type Store } from '../store';
import { type DbDeps, type DietDb, openDietDb, type OpenStatus } from './db';
import type { StorageEnv } from './env';
import { createWriteGate, type GateReason } from './gate';
import type { LockManagerLike } from './locks';
import { createRepos, type Repos, type RepoHooks, type UpdatePatch } from './repos';
import { type AppStorage, type Platform } from './runtime';
import { readBackupSnapshot, replaceAll } from './snapshot';

export interface TestEnv extends StorageEnv {
  readonly set: (at: Instant) => void;
  readonly advanceDays: (days: number) => void;
  readonly setZone: (zone: string) => void;
}

const DAY_MS = 86_400_000;

/** A clock that moves only when told to, a fixed zone, and numbered synthetic ids. */
export function testEnv(
  at: Instant = '2000-03-01T00:00:00.000Z',
  zone = 'Pacific/Auckland',
  firstId = 70_000,
): TestEnv {
  let now = Date.parse(at);
  let timeZone = zone;
  let next = firstId;
  return {
    now: () => new Date(now).toISOString(),
    timeZone: () => timeZone,
    randomId: () => fixtureId(next++),
    randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
    set: (instant) => {
      now = Date.parse(instant);
    },
    advanceDays: (days) => {
      now += days * DAY_MS;
    },
    setZone: (z) => {
      timeZone = z;
    },
  };
}

/** A fresh, empty IndexedDB for one test. */
export function freshDeps(): DbDeps {
  return {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  };
}

export interface TestPlatform extends Platform {
  readonly downloads: { text: string; fileName: string }[];
  readonly posted: GateReason[];
  reloads: number;
  persistRequests: number;
}

/**
 * Web Locks as the browser grants them (locks.ts), for Node: one lock name, shared or exclusive,
 * granted first come first served, and an AbortSignal that withdraws a request still waiting.
 */
export class FakeLockManager implements LockManagerLike {
  private readonly held: ('shared' | 'exclusive')[] = [];
  private readonly queue: { mode: 'shared' | 'exclusive'; grant: () => void }[] = [];

  /** How many tabs hold the lock now, in each mode. */
  get holders(): { shared: number; exclusive: number } {
    return {
      shared: this.held.filter((m) => m === 'shared').length,
      exclusive: this.held.filter((m) => m === 'exclusive').length,
    };
  }

  request(
    _name: string,
    options: { mode: 'shared' | 'exclusive'; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const waiter = {
        mode: options.mode,
        grant: () => {
          this.held.push(options.mode);
          const release = () => {
            const at = this.held.indexOf(options.mode);
            if (at >= 0) this.held.splice(at, 1);
            this.pump();
          };
          Promise.resolve()
            .then(() => callback({ name: _name, mode: options.mode }))
            .then(
              (value) => {
                release();
                resolve(value);
              },
              (error: unknown) => {
                release();
                reject(error instanceof Error ? error : new Error('lock callback failed'));
              },
            );
        },
      };
      const { signal } = options;
      if (signal?.aborted === true) {
        reject(new DOMException('The request was aborted.', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => {
        const at = this.queue.indexOf(waiter);
        if (at < 0) return;
        this.queue.splice(at, 1);
        reject(new DOMException('The request was aborted.', 'AbortError'));
        this.pump();
      });
      this.queue.push(waiter);
      this.pump();
    });
  }

  private pump(): void {
    for (;;) {
      const next = this.queue[0];
      if (next === undefined) return;
      const free =
        next.mode === 'exclusive' ? this.held.length === 0 : !this.held.includes('exclusive');
      if (!free) return;
      this.queue.shift();
      next.grant();
    }
  }
}

const locksByFactory = new WeakMap<IDBFactory, FakeLockManager>();

/** The fake lock manager of one fake IndexedDB, shared by every "tab" that opens it. */
export function locksFor(factory: IDBFactory): FakeLockManager {
  let locks = locksByFactory.get(factory);
  if (locks === undefined) {
    locks = new FakeLockManager();
    locksByFactory.set(factory, locks);
  }
  return locks;
}

/** A platform that records what the app asked the browser to do. */
export function testPlatform(overrides: Partial<Platform> = {}): TestPlatform {
  // One localStorage per platform, as one per origin in the browser (generation.ts).
  const local = memoryStorage();
  const platform: TestPlatform = {
    downloads: [],
    posted: [],
    reloads: 0,
    persistRequests: 0,
    download: (text, fileName) => {
      platform.downloads.push({ text, fileName });
    },
    reload: () => {
      platform.reloads += 1;
    },
    postGate: (reason) => {
      platform.posted.push(reason);
    },
    locks: () => null,
    requestPersistentStorage: () => {
      platform.persistRequests += 1;
      return Promise.resolve('protected');
    },
    caches: () => undefined,
    localStorage: () => local,
    sessionStorage: () => memoryStorage(),
    revokeObjectUrls: () => undefined,
    ...overrides,
  };
  return platform;
}

/** A Storage that keeps its keys in memory. */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

export interface TestDb {
  readonly db: DietDb;
  readonly env: TestEnv;
  readonly deps: DbDeps;
  readonly repos: Repos;
  readonly status: Store<OpenStatus>;
  readonly storage: AppStorage & { readonly platform: TestPlatform };
}

export interface OpenTestOptions {
  readonly deps?: DbDeps;
  readonly env?: TestEnv;
  readonly chain?: readonly Migration[];
  readonly extraMiddleware?: readonly Middleware<DBCore>[];
  readonly hooks?: RepoHooks;
  readonly platform?: TestPlatform;
}

/**
 * Dexie's liveQuery runs only where a global IndexedDB exists (it checks Dexie.dependencies before
 * each query). Node has none, so the tests lend it a fake one; every database here still opens on
 * its own factory.
 */
export function enableLiveQueries(): void {
  const dependencies = Dexie.dependencies as { indexedDB: unknown; IDBKeyRange: unknown };
  dependencies.indexedDB ??= new IDBFactory();
  dependencies.IDBKeyRange ??= IDBKeyRange;
}

/** Opens the real DietDb through the open sequence, over a fresh fake IndexedDB unless given one. */
export async function openTestDb(options: OpenTestOptions = {}): Promise<TestDb> {
  enableLiveQueries();
  const deps = options.deps ?? freshDeps();
  const env = options.env ?? testEnv();
  const status = createStore<OpenStatus>('opening');
  const result = await openDietDb(env, deps, {
    gate: createWriteGate(),
    status,
    ...(options.chain === undefined ? {} : { chain: options.chain }),
    ...(options.extraMiddleware === undefined ? {} : { extraMiddleware: options.extraMiddleware }),
  });
  if (result.db === null) throw new Error(`The test database did not open: ${result.status}`);
  const { db } = result;
  const repos = createRepos({ db, env, gate: db.gate, hooks: options.hooks ?? {} });
  const platform = options.platform ?? testPlatform({ locks: () => locksFor(deps.indexedDB) });
  return {
    db,
    env,
    deps,
    repos,
    status,
    storage: { db, repos, env, gate: db.gate, deps, platform },
  };
}

export interface OnboardOptions {
  /** Answers other than the default "no" (q1 to q7). */
  readonly answers?: Partial<Record<ReadinessQuestionId, YesNo>>;
  /** Confirmations to record after the answers. */
  readonly confirmations?: readonly ReadinessConfirmationId[];
  /** When setup was finished (default: now). */
  readonly completedAt?: Instant;
  /** Profile fields over the default synthetic profile (175 cm, born 1970, female). */
  readonly profile?: UpdatePatch<'profile'>;
  /** The onboarding weight (default 90 kg); null for none. */
  readonly weightKg?: number | null;
}

/**
 * A finished setup, written through the repositories in the order the first-run guard allows
 * (item 13): the alcohol notice acknowledged, seven answers (all "no" unless given), a synthetic
 * profile, an onboarding weight, a 22:2 schedule (17:00–19:00), the garden step and the completion
 * time. The shell appears only after setup, so screen tests call this first.
 */
export async function onboardForTests(test: TestDb, options: OnboardOptions = {}): Promise<void> {
  const { repos, env } = test;
  await repos.settings.update({ alcoholNoticeAckAt: env.now() });
  for (const q of READINESS_QUESTION_IDS)
    await repos.readiness.answer(q, options.answers?.[q] ?? 'no');
  for (const c of options.confirmations ?? []) await repos.readiness.answer(c, 'yes');
  await repos.profile.update({
    heightCm: 175,
    birthYear: 1970,
    sex: 'female',
    kickstartOptIn: false,
    ...options.profile,
  });
  const weightKg = options.weightKg === undefined ? 90 : options.weightKg;
  if (weightKg !== null) await repos.weights.addOnboardingWeight({ kg: weightKg, note: null });
  await repos.targets.update({
    fastingPreset: '22:2',
    eatingWindow: { start: '17:00', end: '19:00' },
    presetChosenBy: 'default',
  });
  const now = env.now();
  await repos.settings.update({
    profileConfirmedAt: now,
    scheduleConfirmedAt: now,
    gardenConfirmedAt: now,
    onboardingCompletedAt: options.completedAt ?? now,
  });
}

/** A test database holding `snapshot` (for example a weight scenario), with the clock at `now`. */
export async function openSnapshotDb(
  snapshot: Snapshot,
  now: Instant,
  zone = 'Pacific/Auckland',
): Promise<TestDb> {
  const test = await openTestDb({ env: testEnv(now, zone) });
  await replaceAll(test.db, snapshot);
  return test;
}

/** S(db) of section 10.8. */
export function backupSnapshot(db: DietDb): Promise<Snapshot> {
  return readBackupSnapshot(db);
}

/** Every backed-up store's row count. */
export async function counts(db: DietDb): Promise<Record<string, number>> {
  const snapshot = await readBackupSnapshot(db);
  return Object.fromEntries(BACKUP_TABLES.map((name) => [name, snapshot[name].length]));
}

/** A real, non-extractable AES-GCM key and a synthetic pairing (C34; device only). */
export async function pairingRow(): Promise<TransferPairingRecord> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return {
    id: 'singleton',
    relayUrl: 'https://relay.example.com/room',
    roomId: 'ExampleRoomId00000000A',
    key,
    pairedAt: '2000-01-05T00:00:00.000Z',
  };
}

/** Synthetic photo bytes: a recognisable byte pattern, never a real image. */
export const PHOTO_BYTES = Uint8Array.from({ length: 64 }, (_, i) => (i * 7 + 3) % 256);

export function photoRow(gardenId: string, width = 640): GardenPhotoRecord {
  return {
    gardenId,
    mimeType: 'image/jpeg',
    bytes: PHOTO_BYTES.slice().buffer,
    width,
    height: 480,
    takenAt: '2000-01-05T00:00:00.000Z',
  };
}

/**
 * A plain Dexie connection with no validation middleware, for writing rows the app itself would
 * refuse (a corrupted row, a photo 5,000 px wide) at the installed version.
 */
export async function rawWriter(
  deps: DbDeps,
  stores: Record<string, string>,
  version = 1,
): Promise<Dexie> {
  const raw = new Dexie('diet', { indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange });
  raw.version(version).stores(stores);
  await raw.open();
  return raw;
}

/** A middleware that fails the chosen write once armed (all-or-nothing tests). */
export function failingWrite(
  table: string,
  type: 'add' | 'put' | 'delete' | 'deleteRange',
  error: () => Error,
): { middleware: Middleware<DBCore>; arm: () => void } {
  let armed = false;
  return {
    arm: () => {
      armed = true;
    },
    middleware: {
      stack: 'dbcore',
      name: 'test-failing-write',
      create: (down) => ({
        ...down,
        table: (name) => {
          const inner = down.table(name);
          return {
            ...inner,
            mutate: (request) =>
              armed && name === table && request.type === type
                ? Promise.reject(error())
                : inner.mutate(request),
          };
        },
      }),
    },
  };
}
