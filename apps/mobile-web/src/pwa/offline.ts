import { createStore } from '../store';

/**
 * Whether the offline copy of the app is saved on the device (PWA-03). On a first visit the
 * service worker downloads the copy in the background; until it has finished, the app would not
 * open without a connection. About says which it is, and the top-bar pill says "all saved" only
 * once the copy exists.
 */
export type OfflineCopy = 'saving' | 'ready' | 'unavailable';

export const offlineCopyStore = createStore<OfflineCopy>('saving');

/** The service worker is active, so every file of the app is in its offline copy. */
export function markOfflineReady(): void {
  offlineCopyStore.set('ready');
}

/** This browser has no service workers, or registering one failed. */
export function markOfflineUnavailable(): void {
  if (offlineCopyStore.get() !== 'ready') offlineCopyStore.set('unavailable');
}
