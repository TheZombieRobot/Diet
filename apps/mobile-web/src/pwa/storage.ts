import { createStore } from '../store';
import { installStore } from './install';

/**
 * Persistent storage (PWA-06): asks the browser at startup not to clear the app's records when the
 * phone runs low on space. Chrome answers without showing the person anything; it says yes more
 * readily once the app is installed, but only when asked again, so the app asks again after it is
 * installed and when it comes back into view while not protected. The person never sees a prompt
 * in Chrome. The answer is shown on the About screen.
 */
export type StorageProtection = 'checking' | 'protected' | 'not-protected' | 'unsupported';

export const storageStore = createStore<StorageProtection>('checking');

/** The parts of the StorageManager this uses; both are missing in some browsers. */
export interface PersistApi {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

const browserStorage = (): PersistApi | undefined =>
  'storage' in navigator ? navigator.storage : undefined;

export async function requestPersistentStorage(
  storage: PersistApi | undefined = browserStorage(),
): Promise<StorageProtection> {
  let result: StorageProtection;
  try {
    if (storage?.persist === undefined || storage.persisted === undefined) result = 'unsupported';
    else if (await storage.persisted()) result = 'protected';
    else result = (await storage.persist()) ? 'protected' : 'not-protected';
  } catch {
    result = 'unsupported';
  }
  storageStore.set(result);
  return result;
}

/**
 * Asks again when the answer may have changed: right after the app is installed, and each time it
 * comes back into view while the records are not protected. Returns a function that stops.
 */
export function askAgainWhenItMayHelp(
  target: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document,
  ask: () => Promise<unknown> = () => requestPersistentStorage(),
): () => void {
  let wasInstalled = installStore.get().installed;
  const stopWatchingInstall = installStore.subscribe(() => {
    const { installed } = installStore.get();
    const justInstalled = installed && !wasInstalled;
    wasInstalled = installed;
    const state = storageStore.get();
    if (justInstalled && state !== 'protected' && state !== 'unsupported') void ask();
  });
  const onVisibilityChange = (): void => {
    if (target.visibilityState === 'visible' && storageStore.get() === 'not-protected') {
      void ask();
    }
  };
  target.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    stopWatchingInstall();
    target.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
