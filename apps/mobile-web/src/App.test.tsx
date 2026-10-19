import { alcohol, general, helpNumbers } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import {
  installBannerDismissedStore,
  installStore,
  listenForInstallPrompt,
  type BeforeInstallPromptEvent,
} from './pwa/install';
import { requestPersistentStorage, storageStore } from './pwa/storage';
import { markUpdateWaiting, setUpdateActivator, updateStore } from './pwa/update';
import { ROUTE_TITLES, ROUTES, routeHref, TAB_ROUTES, type RouteId } from './routes';
import { versionLabel } from './version';

function show(route: RouteId): void {
  window.location.hash = routeHref(route);
  render(<App />);
}

const main = (): HTMLElement => screen.getByRole('main');

let stopListening: (() => void) | undefined;
beforeEach(() => {
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  stopListening?.();
  stopListening = undefined;
  vi.restoreAllMocks();
  updateStore.set({ waiting: false, applying: false });
  installStore.set({ canPrompt: false, installed: false });
  installBannerDismissedStore.set(false);
  storageStore.set('checking');
  window.location.hash = '';
});

describe('every screen', () => {
  it.each(ROUTES)('%s shows its name in the top bar and the five tabs', (route) => {
    show(route);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ROUTE_TITLES[route]);
    const tabs = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');
    expect(tabs.map((t) => t.textContent)).toEqual(TAB_ROUTES.map((r) => ROUTE_TITLES[r]));
    expect(
      tabs.filter((t) => t.getAttribute('aria-current') === 'page').map((t) => t.textContent),
    ).toEqual((TAB_ROUTES as readonly string[]).includes(route) ? [ROUTE_TITLES[route]] : []);
    const gear = screen.getByRole('link', { name: 'Settings' });
    expect(gear.getAttribute('aria-current')).toBe(
      route === 'settings' || route === 'about' ? 'page' : null,
    );
    expect(within(screen.getByRole('banner')).getByRole('status').textContent).toMatch(
      /^(Online|Offline, all saved)$/,
    );
  });

  it('follows the tab links', async () => {
    show('today');
    await act(async () => {
      window.location.hash = routeHref('drinks');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Drinks');
    expect(document.title).toBe('Drinks · Diet');
  });
});

describe('placeholder screens (no sample data)', () => {
  const placeholders = ROUTES.filter((r) => r !== 'about');

  it.each(placeholders)('%s says it arrives later and shows no numbers or prices', (route) => {
    show(route);
    const text = main().textContent;
    expect(text).toContain('This screen arrives at a later step of the build checklist.');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/[$€£]/);
  });

  it('the "+" on Today opens and closes the quick actions note', () => {
    show('today');
    const plus = screen.getByRole('button', { name: 'Quick actions' });
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(plus);
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    const panelId = plus.getAttribute('aria-controls') ?? '';
    expect(document.getElementById(panelId)?.textContent).toContain('later step');
    fireEvent.click(plus);
    expect(plus.getAttribute('aria-expanded')).toBe('false');
  });

  it('the "+" is only on Today', () => {
    show('food');
    expect(screen.queryByRole('button', { name: 'Quick actions' })).toBeNull();
  });
});

describe('About (HS-13, About portion)', () => {
  it('says the app is not a medical device, in the words of health.ts', () => {
    show('about');
    expect(main().textContent).toContain(general.about);
  });

  it('lists every help number as a link to call or text', () => {
    show('about');
    const calls = [
      helpNumbers.emergency.number,
      helpNumbers.healthline.number,
      helpNumbers.alcoholDrugHelpline.number,
      helpNumbers.needToTalk.number,
    ];
    for (const number of calls) {
      const link = within(main()).getByRole('link', { name: new RegExp(`${number}$`) });
      expect(link.getAttribute('href')).toBe(`tel:${number.replace(/\s/g, '')}`);
    }
    const text = within(main()).getByRole('link', { name: /Text 8681$/ });
    expect(text.getAttribute('href')).toBe(`sms:${helpNumbers.alcoholDrugHelpline.text}`);
    for (const required of ['111', '0800 611 116', '0800 787 797']) {
      expect(main().textContent).toContain(required);
    }
    expect(alcohol.firstRunNotice).toContain(helpNumbers.alcoholDrugHelpline.number);
  });

  it('marks only the 111 row as an emergency', () => {
    show('about');
    const emergencyRows = main().querySelectorAll('.ui-action-row--emergency');
    expect(emergencyRows).toHaveLength(1);
    expect(emergencyRows[0]?.getAttribute('href')).toBe('tel:111');
  });

  it('has a data sources placeholder and the app version', () => {
    show('about');
    expect(within(main()).getByRole('region', { name: 'Data sources' }).textContent).toContain(
      'attribution',
    );
    expect(screen.getByTestId('app-version').textContent).toBe(versionLabel());
    expect(versionLabel()).toBe('0.0.0-test');
    expect(versionLabel('1.2.3', 'abc1234')).toBe('1.2.3, build abc1234');
  });

  it.each([
    ['protected', true, true, 'Protected'],
    ['protected', false, true, 'Protected'],
    ['not-protected', false, false, 'Not protected yet'],
  ] as const)(
    'asks for persistent storage once and shows the answer (%s)',
    async (state, alreadyPersisted, granted, shown) => {
      const persist = vi.fn(() => Promise.resolve(granted));
      const persisted = vi.fn(() => Promise.resolve(alreadyPersisted));
      show('about');
      expect(screen.getByTestId('storage-protection').textContent).toBe('Checking…');
      await act(async () => {
        expect(await requestPersistentStorage({ persist, persisted })).toBe(state);
      });
      expect(persist).toHaveBeenCalledTimes(alreadyPersisted ? 0 : 1);
      expect(screen.getByTestId('storage-protection').textContent).toContain(shown);
    },
  );

  it('reports a browser without the storage API', async () => {
    expect(await requestPersistentStorage({})).toBe('unsupported');
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
    const failing = {
      persist: () => Promise.reject(new Error('no')),
      persisted: () => Promise.resolve(false),
    };
    expect(await requestPersistentStorage(failing)).toBe('unsupported');
  });
});

describe('update banner (PWA-05)', () => {
  it('shows "Update available" on any screen when a new version waits, and Reload activates it', async () => {
    const activate = vi.fn(() => Promise.resolve());
    setUpdateActivator(activate);
    show('food');
    expect(screen.queryByText('Update available')).toBeNull();

    act(() => {
      markUpdateWaiting();
    });
    const banner = within(main()).getByText('Update available').closest('[role="status"]');
    expect(banner).not.toBeNull();
    await act(async () => {
      fireEvent.click(within(banner as HTMLElement).getByRole('button', { name: 'Reload' }));
      await Promise.resolve();
    });
    expect(activate).toHaveBeenCalledOnce();
    expect(updateStore.get()).toEqual({ waiting: true, applying: true });
    expect(screen.getByRole('button', { name: 'Reloading' }).hasAttribute('disabled')).toBe(true);
  });
});

/** A stand-in for Chrome's beforeinstallprompt event. */
function installPromptEvent(outcome: 'accepted' | 'dismissed'): BeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
}

describe('install prompt', () => {
  it('offers "Install app" on Today and Settings once Chrome allows it', async () => {
    stopListening = listenForInstallPrompt(window);
    show('today');
    expect(screen.queryByText('Install this app')).toBeNull();

    const event = installPromptEvent('accepted');
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('Install this app')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
      await Promise.resolve();
    });
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(installStore.get()).toEqual({ canPrompt: false, installed: true });
    expect(screen.queryByText('Install this app')).toBeNull();
  });

  it('"Not now" hides the Today banner; Settings still offers the button', async () => {
    stopListening = listenForInstallPrompt(window);
    show('today');
    act(() => {
      window.dispatchEvent(installPromptEvent('dismissed'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Install this app')).toBeNull();

    await act(async () => {
      window.location.hash = routeHref('settings');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    const install = within(screen.getByRole('region', { name: 'Install' }));
    fireEvent.click(install.getByRole('button', { name: 'Install app' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(installStore.get().installed).toBe(false);
  });

  it('says so when the app is already installed', () => {
    window.matchMedia = vi.fn(
      (query: string) => ({ matches: true, media: query }) as MediaQueryList,
    );
    stopListening = listenForInstallPrompt(window);
    show('settings');
    expect(screen.getByRole('region', { name: 'Install' }).textContent).toContain(
      'installed on this device',
    );
  });

  it('marks the app installed when Chrome reports it', () => {
    stopListening = listenForInstallPrompt(window);
    act(() => {
      window.dispatchEvent(installPromptEvent('accepted'));
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(installStore.get()).toEqual({ canPrompt: false, installed: true });
  });
});
