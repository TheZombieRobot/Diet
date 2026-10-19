import { markUpdateWaiting } from './update';

/**
 * Finding a new version (PWA-05). The browser checks for one whenever the app is opened from
 * scratch. An installed Android app is usually resumed from the background instead, with no
 * navigation and so no check, so the app also checks each time it comes back into view: one small
 * GET of its own sw.js (HS-14), at most once a minute.
 *
 * vite-plugin-pwa reports an update only through workbox-window, which stops listening after its
 * first update (or one found more than a minute after registering). So the app also watches the
 * registration itself, and after every check looks for a version that is already waiting.
 */

/** At most one check a minute, however often the app comes back into view. */
export const UPDATE_CHECK_THROTTLE_MS = 60_000;

/** The parts of a ServiceWorkerRegistration the checks use (a stand-in in unit tests). */
export type UpdatableRegistration = Pick<
  ServiceWorkerRegistration,
  'update' | 'waiting' | 'installing' | 'addEventListener'
>;

export interface PageEnvironment {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  isOnline: () => boolean;
  /** A service worker already runs the page, so a newly installed one is an update. */
  hasController: () => boolean;
}

export const browserEnvironment = (): PageEnvironment => ({
  document,
  isOnline: () => navigator.onLine,
  hasController: () => navigator.serviceWorker.controller !== null,
});

/** Shows "Update available" if a new version is installed and waiting. */
export function markIfWaiting(
  registration: Pick<UpdatableRegistration, 'waiting'>,
  env: Pick<PageEnvironment, 'hasController'> = browserEnvironment(),
): void {
  if (registration.waiting !== null && env.hasController()) markUpdateWaiting();
}

/** Asks the browser to look for a new sw.js now, then shows the banner if one is waiting. */
export async function checkForUpdate(
  registration: UpdatableRegistration,
  env: Pick<PageEnvironment, 'hasController'> = browserEnvironment(),
): Promise<void> {
  try {
    await registration.update();
  } catch {
    // No connection, or the server did not answer: the next return to the app tries again.
  }
  markIfWaiting(registration, env);
}

/**
 * Checks for a new version each time the page comes back into view and the phone is online, at
 * most once every UPDATE_CHECK_THROTTLE_MS. The first return always checks. Returns a function
 * that stops listening.
 */
export function checkForUpdatesWhenReopened(
  registration: UpdatableRegistration,
  env: PageEnvironment = browserEnvironment(),
): () => void {
  let lastCheck = 0;
  const onVisibilityChange = (): void => {
    if (env.document.visibilityState !== 'visible') return;
    markIfWaiting(registration, env);
    if (!env.isOnline() || Date.now() - lastCheck < UPDATE_CHECK_THROTTLE_MS) return;
    lastCheck = Date.now();
    void checkForUpdate(registration, env);
  };
  env.document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    env.document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

/**
 * Shows "Update available" for a version that is already waiting, and for every new version that
 * finishes installing while this page runs, however it was found.
 */
export function watchForWaitingVersion(
  registration: UpdatableRegistration,
  env: Pick<PageEnvironment, 'hasController'> = browserEnvironment(),
): void {
  markIfWaiting(registration, env);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (worker === null) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && env.hasController()) markUpdateWaiting();
    });
  });
}
