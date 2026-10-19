/**
 * The cross-tab lock handshake (storage spec section 7.5; data-loss review): Web Locks over the
 * name 'diet-db-open'.
 *
 * - Every tab holds the lock in shared mode for as long as its database is open, from before it
 *   opens the database until closeForGood. A tab opening while a restore or delete-all holds the
 *   lock waits, so it never reads the records the restore is about to replace.
 * - A restore or delete-all first tells the other tabs (the 'diet-db' channel), closes its own
 *   write gate and gives up its own shared lock, then writes only inside the lock in exclusive
 *   mode. Another tab gives up its shared lock only after closing its write gate and its
 *   connection, so any transaction it started before that was created before the restore's and
 *   commits first: a busy tab can no longer write on top of restored records.
 * - When the exclusive lock is not granted within 3 seconds (a tab that does not answer), nothing
 *   is written and the owner is asked to close the app's other tabs.
 * Where Web Locks are missing (an older browser), the handshake is skipped and the channel and
 * versionchange still close the other tabs, as before.
 */

/** The parts of navigator.locks the handshake uses (a fake in unit tests). */
export interface LockManagerLike {
  request(
    name: string,
    options: { mode: 'shared' | 'exclusive'; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<unknown>,
  ): Promise<unknown>;
}

export const OPEN_LOCK = 'diet-db-open';
/** How long a restore or delete-all waits for the other tabs to let go (section 7.5). */
export const EXCLUSIVE_WAIT_MS = 3000;

/** The browser's lock manager, or null where Web Locks are not available. */
export function browserLocks(): LockManagerLike | null {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
  return nav?.locks ?? null;
}

/** This tab's shared lock. release() is idempotent. */
export interface OpenLock {
  readonly release: () => void;
}

const NO_LOCK: OpenLock = { release: () => undefined };

/**
 * Takes the shared lock and keeps it until release(). Resolves once it is granted (at once,
 * unless a restore or delete-all is holding it in exclusive mode).
 */
export function holdOpenLock(locks: LockManagerLike | null): Promise<OpenLock> {
  if (locks === null) return Promise.resolve(NO_LOCK);
  return new Promise((granted, failed) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks
      .request(OPEN_LOCK, { mode: 'shared' }, () => {
        granted({ release });
        return held;
      })
      .catch((error: unknown) => {
        failed(error instanceof Error ? error : new Error('The records lock failed'));
      });
  });
}

export type ExclusiveOutcome<T> =
  { readonly granted: true; readonly value: T } | { readonly granted: false };

/**
 * Runs `work` inside the lock in exclusive mode, once every other tab has let go of its shared
 * lock. If that does not happen within `waitMs`, `work` never runs and the result says so. An
 * error from `work` itself is passed on.
 */
export async function withExclusiveLock<T>(
  locks: LockManagerLike | null,
  work: () => Promise<T>,
  waitMs: number = EXCLUSIVE_WAIT_MS,
): Promise<ExclusiveOutcome<T>> {
  if (locks === null) return { granted: true, value: await work() };
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, waitMs);
  // An object, so the callback's change is seen after the await.
  const progress = { entered: false };
  try {
    const value = await locks.request(
      OPEN_LOCK,
      { mode: 'exclusive', signal: controller.signal },
      () => {
        progress.entered = true;
        clearTimeout(timer);
        return work();
      },
    );
    return { granted: true, value: value as T };
  } catch (error) {
    if (!progress.entered) return { granted: false };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
