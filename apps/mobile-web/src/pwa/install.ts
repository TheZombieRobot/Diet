import { createStore } from '../store';

/**
 * The install prompt (checklist item 5). Chrome fires `beforeinstallprompt` when the app can be
 * installed; the event is kept so the app can offer its own "Install app" button (on Settings,
 * and as a dismissible banner on Today) instead of Chrome's default prompt.
 */

/** Chrome's install prompt event (not in the TypeScript DOM library). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallState {
  /** An install prompt is ready to show. */
  canPrompt: boolean;
  /** The app is running as an installed app, or was installed in this session. */
  installed: boolean;
}

export const installStore = createStore<InstallState>({ canPrompt: false, installed: false });

/** "Not now" on the Today banner hides it until the app is next opened. */
export const installBannerDismissedStore = createStore(false);

let deferredPrompt: BeforeInstallPromptEvent | undefined;

const isInstallPrompt = (event: Event): event is BeforeInstallPromptEvent =>
  'prompt' in event && typeof event.prompt === 'function';

/** Starts listening; call once, before the first render, so an early event is not missed. */
export function listenForInstallPrompt(target: Window = window): () => void {
  const standalone = target.matchMedia('(display-mode: standalone)').matches;
  installStore.set({ canPrompt: false, installed: standalone });

  const onPrompt = (event: Event): void => {
    if (!isInstallPrompt(event)) return;
    event.preventDefault();
    deferredPrompt = event;
    installStore.set({ canPrompt: true, installed: false });
  };
  const onInstalled = (): void => {
    deferredPrompt = undefined;
    installStore.set({ canPrompt: false, installed: true });
  };
  target.addEventListener('beforeinstallprompt', onPrompt);
  target.addEventListener('appinstalled', onInstalled);
  return () => {
    target.removeEventListener('beforeinstallprompt', onPrompt);
    target.removeEventListener('appinstalled', onInstalled);
  };
}

/** Shows Chrome's install dialog. A prompt can be used once; Chrome offers a new one later. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt;
  if (event === undefined) return 'unavailable';
  deferredPrompt = undefined;
  installStore.set({ ...installStore.get(), canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') installStore.set({ canPrompt: false, installed: true });
  return outcome;
}
