import { createStore } from '../store';

/**
 * Persistent storage (PWA-06): asks the browser, once at startup, not to clear the app's records
 * when the phone runs low on space. Chrome answers without showing the person anything; it says
 * yes more readily once the app is installed. The answer is shown on the About screen.
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
