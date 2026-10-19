import { createStore } from '../store';

/**
 * "Update available" (PWA-05). When a new version has been downloaded and is waiting, the app
 * shows a banner; Reload activates the new version and reloads the page. Records are kept in the
 * phone's database, which an update never touches.
 */
export interface UpdateState {
  /** A new version is installed and waiting to take over. */
  waiting: boolean;
  /** Reload was tapped and the new version is taking over. */
  applying: boolean;
}

export const updateStore = createStore<UpdateState>({ waiting: false, applying: false });

let activateWaitingVersion: (() => Promise<void>) | undefined;

/** Called by the service worker registration with the function that activates the update. */
export function setUpdateActivator(activate: () => Promise<void>): void {
  activateWaitingVersion = activate;
}

export function markUpdateWaiting(): void {
  updateStore.set({ waiting: true, applying: false });
}

/** Activates the waiting version; the page reloads when it takes control. */
export async function applyUpdate(): Promise<void> {
  if (activateWaitingVersion === undefined) return;
  updateStore.set({ waiting: true, applying: true });
  await activateWaitingVersion();
}
