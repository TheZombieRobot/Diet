import { createStore } from '../store';

/**
 * "Update available" (PWA-05). When a new version has been downloaded and is waiting, the app
 * shows a banner; Reload activates the new version and the page reloads once it takes control.
 * Records are kept in the phone's database, which an update never touches.
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

/** Where `controllerchange` fires: the page's service worker container. */
export type ControllerEvents = Pick<ServiceWorkerContainer, 'addEventListener'>;

const browserContainer = (): ControllerEvents | undefined =>
  'serviceWorker' in navigator ? navigator.serviceWorker : undefined;

const armed = new WeakSet<ControllerEvents>();

/**
 * Reloads the page, once, when a new version takes control of it, so the page runs the new
 * version's code. Armed as soon as an update is known to be waiting (and again, harmlessly,
 * before Reload sends the skip-waiting message), so it is always in place before the switch.
 */
export function reloadWhenNewVersionTakesOver(
  container: ControllerEvents | undefined = browserContainer(),
  reload: () => void = () => {
    window.location.reload();
  },
): void {
  if (container === undefined || armed.has(container)) return;
  armed.add(container);
  container.addEventListener(
    'controllerchange',
    () => {
      reload();
    },
    { once: true },
  );
}

export function markUpdateWaiting(): void {
  if (!updateStore.get().waiting) updateStore.set({ waiting: true, applying: false });
  reloadWhenNewVersionTakesOver();
}

/** Activates the waiting version; the page reloads when it takes control. */
export async function applyUpdate(): Promise<void> {
  if (activateWaitingVersion === undefined) return;
  reloadWhenNewVersionTakesOver();
  updateStore.set({ waiting: true, applying: true });
  await activateWaitingVersion();
}

/**
 * Reloads the page, applying a waiting new version first: a plain reload keeps the old one in
 * control (registerType 'prompt'), so a screen asking for the newer version would come back (the
 * storage failure screens; the Laptop pairing screen's "newer version" and "no reader" notices).
 */
export function reloadApplyingUpdate(): void {
  if (updateStore.get().waiting) void applyUpdate();
  else window.location.reload();
}
