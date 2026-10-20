import { about, alcohol, general, helpNumbers, privacy, today } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { appStorageStore } from './db/runtime';
import { onboardForTests, openTestDb, type TestDb } from './db/testKit';
import {
  installBannerDismissedStore,
  installStore,
  listenForInstallPrompt,
  type BeforeInstallPromptEvent,
} from './pwa/install';
import { markOfflineReady, offlineCopyStore } from './pwa/offline';
import {
  askAgainWhenItMayHelp,
  onOnboardingCompleted,
  requestPersistentStorage,
  storageStore,
} from './pwa/storage';
import { markUpdateWaiting, setUpdateActivator, updateStore } from './pwa/update';
import {
  isUnderSettings,
  ROUTE_TITLES,
  ROUTES,
  routeHref,
  TAB_ROUTES,
  type RouteId,
} from './routes';
import { AboutScreen } from './screens/AboutScreen';
import { versionLabel } from './version';

/** Opens a screen of a finished setup: the shell shows only after setup (item 13). */
async function show(route: RouteId): Promise<void> {
  window.location.hash = routeHref(route);
  render(<App />);
  await screen.findByRole('navigation', { name: 'Main' });
  // Today shows its cards once its records are read (item 16).
  if (route === 'today') {
    await screen.findByRole('region', { name: today.cards.movement }, { timeout: 5000 });
  }
}

const main = (): HTMLElement => screen.getByRole('main');

let stopListening: (() => void) | undefined;
let test: TestDb;
beforeEach(async () => {
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
  test = await openTestDb();
  await onboardForTests(test);
  appStorageStore.set(test.storage);
});
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  test.db.shutDown();
  stopListening?.();
  stopListening = undefined;
  vi.restoreAllMocks();
  updateStore.set({ waiting: false, applying: false });
  installStore.set({ canPrompt: false, installed: false });
  installBannerDismissedStore.set(false);
  storageStore.set('checking');
  offlineCopyStore.set('saving');
  window.location.hash = '';
});

describe('every screen', () => {
  it.each(ROUTES)('%s shows its name in the top bar and the five tabs', async (route) => {
    await show(route);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ROUTE_TITLES[route]);
    const tabs = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link');
    expect(tabs.map((t) => t.textContent)).toEqual(TAB_ROUTES.map((r) => ROUTE_TITLES[r]));
    expect(
      tabs.filter((t) => t.getAttribute('aria-current') === 'page').map((t) => t.textContent),
    ).toEqual((TAB_ROUTES as readonly string[]).includes(route) ? [ROUTE_TITLES[route]] : []);
    const gear = screen.getByRole('link', { name: 'Settings' });
    // "page" only on Settings itself; About, reached from Settings, marks it as its section.
    expect(gear.getAttribute('aria-current')).toBe(
      route === 'settings' ? 'page' : isUnderSettings(route) ? 'true' : null,
    );
    expect(within(screen.getByRole('banner')).getByRole('status').textContent).toMatch(
      /^(Online|Offline, all saved|Offline)$/,
    );
  });

  it('follows the tab links', async () => {
    await show('today');
    await act(async () => {
      window.location.hash = routeHref('drinks');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Drinks');
    expect(document.title).toBe('Drinks · Diet');
  });

  it('moves focus to the new screen heading after a screen change, not on first render', async () => {
    await show('today');
    const heading = () => screen.getByRole('heading', { level: 1 });
    expect(document.activeElement).not.toBe(heading());
    await act(async () => {
      window.location.hash = routeHref('food');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(heading().textContent).toBe('Food');
    expect(document.activeElement).toBe(heading());
  });

  it('a tab tap switches screens through the app, not the plain link', async () => {
    await show('today');
    const food = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
      name: 'Food',
    });
    await act(async () => {
      expect(fireEvent.click(food)).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(window.location.hash).toBe(routeHref('food'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Food');
  });

  it('says "all saved" in the offline pill only once the offline copy is saved', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    await show('food');
    const pill = () => within(screen.getByRole('banner')).getByRole('status').textContent;
    expect(pill()).toBe('Offline');
    act(() => {
      markOfflineReady();
    });
    expect(pill()).toBe('Offline, all saved');
  });
});

describe('placeholder screens (no sample data)', () => {
  // Today (item 16), About, the setup screens (item 13), the Weight screen (item 14), the Fasting
  // screen (item 15), Diet and targets (item 21) and Laptop pairing (item 30) are built; the rest
  // still say they arrive later.
  const built: readonly RouteId[] = [
    'today',
    'about',
    'readiness',
    'profile',
    'eating-schedule',
    'weight',
    'fasting',
    'targets',
    'pairing',
  ];
  const placeholders = ROUTES.filter((r) => !built.includes(r));

  it.each(placeholders)(
    '%s says it arrives later and shows no numbers or prices',
    async (route) => {
      await show(route);
      const text = main().textContent;
      expect(text).toContain('This screen arrives at a later step of the build checklist.');
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/[$€£]/);
    },
  );

  it('settings shows no numbers or prices with the install offer open', async () => {
    stopListening = listenForInstallPrompt(window);
    await show('settings');
    act(() => {
      window.dispatchEvent(installPromptEvent('dismissed'));
    });
    expect(screen.getAllByRole('button', { name: /Install app/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Quick actions' })).toBeNull();
    const text = document.body.textContent;
    expect(text).toContain('Install app');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/[$€£]/);
  });

  it('TD-02: Today shows no figure for what is not built, with the install offer and the "+" panel open', async () => {
    // Today legitimately shows digits elsewhere (the date, the Fast card's pattern, the Nutrition
    // today card's intake, the guidance line), so the check is scoped to the unbuilt card, the
    // later-step lines and the Later rows.
    stopListening = listenForInstallPrompt(window);
    await show('today');
    act(() => {
      window.dispatchEvent(installPromptEvent('dismissed'));
    });
    expect(screen.getByText('Install this app')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Quick actions' }));
    await screen.findByText(today.quickActions.laterNote);
    const scoped = [
      within(main()).getByRole('region', { name: today.cards.movement }),
      ...screen.getAllByTestId('later-step'),
      ...document.querySelectorAll('.ui-fab-panel [aria-disabled="true"]'),
    ];
    // One card, two later-step lines (Movement and drink logging) and six Later rows.
    expect(scoped).toHaveLength(9);
    for (const element of scoped) {
      expect(element.textContent).not.toMatch(/\d/);
      expect(element.textContent).not.toMatch(/[$€£]/);
    }
    expect(document.body.textContent).not.toMatch(/[$€£]/);
  });

  it('the "+" on Today opens and closes the quick actions', async () => {
    await show('today');
    const plus = screen.getByRole('button', { name: 'Quick actions' });
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(plus);
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    const panelId = plus.getAttribute('aria-controls') ?? '';
    await screen.findByText(today.quickActions.laterNote);
    expect(document.getElementById(panelId)?.textContent).toContain(today.quickActions.laterNote);
    fireEvent.click(plus);
    expect(plus.getAttribute('aria-expanded')).toBe('false');
  });

  it('the "+" is only on Today', async () => {
    await show('food');
    expect(screen.queryByRole('button', { name: 'Quick actions' })).toBeNull();
  });
});

describe('About (HS-13, About portion)', () => {
  it('says the app is not a medical device, in the words of health.ts', async () => {
    await show('about');
    expect(main().textContent).toContain(general.about);
  });

  it('lists every help number as a link to call or text, in the words of health.ts', async () => {
    await show('about');
    const { intro, emergency, healthline, alcoholDrugHelpline, needToTalk } = helpNumbers;
    expect(main().textContent).toContain(intro);
    const links = within(main())
      .getAllByRole('link')
      .map((l) => [l.textContent, l.getAttribute('href')]);
    expect(links).toEqual([
      [`${emergency.number}${emergency.name} ${emergency.number}`, 'tel:111'],
      [`${healthline.name} ${healthline.number}`, 'tel:0800611116'],
      [`${alcoholDrugHelpline.name} ${alcoholDrugHelpline.number}`, 'tel:0800787797'],
      [`${alcoholDrugHelpline.textName} ${alcoholDrugHelpline.textDetail}`, 'sms:8681'],
      [`${needToTalk.name} ${needToTalk.number}`, 'tel:1737'],
      [`${needToTalk.textName} ${needToTalk.textDetail}`, 'sms:1737'],
    ]);
    for (const required of ['111', '0800 611 116', '0800 787 797', 'Text 8681', 'Text 1737']) {
      expect(main().textContent).toContain(required);
    }
    expect(alcohol.firstRunNotice).toContain(helpNumbers.alcoholDrugHelpline.number);
  });

  it('has a Privacy card in the words of health.ts, with the shared-origin caveat (C34)', async () => {
    await show('about');
    const card = within(main()).getByRole('region', { name: 'Privacy' });
    expect(within(card).getByText(general.privacy).tagName).toBe('P');
    expect(within(card).getByText(about.sharedOrigin).tagName).toBe('P');
  });

  it('says whether the offline copy is saved yet', async () => {
    await show('about');
    const fact = () => screen.getByTestId('offline-copy').textContent;
    expect(fact()).toBe('Still saving the offline copy');
    act(() => {
      markOfflineReady();
    });
    expect(fact()).toBe('Ready to use offline');
  });

  it('reads nothing from the records: the same with them not open (HS-13)', () => {
    appStorageStore.set(null);
    render(<AboutScreen />);
    expect(document.body.textContent).toContain(general.about);
    expect(document.body.textContent).toContain(helpNumbers.healthline.number);
    expect(document.body.textContent).toContain(about.sharedOrigin);
    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it('marks only the 111 row as an emergency', async () => {
    await show('about');
    const emergencyRows = main().querySelectorAll('.ui-action-row--emergency');
    expect(emergencyRows).toHaveLength(1);
    expect(emergencyRows[0]?.getAttribute('href')).toBe('tel:111');
  });

  it('C11: data sources says what each badge means and names no database (C97); the app version', async () => {
    await show('about');
    const sources = within(main()).getByRole('region', { name: 'Data sources' });
    expect(
      within(sources)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(about.dataSources.badges);
    expect(sources.textContent).toContain(about.dataSources.now);
    expect(sources.textContent).toContain('attribution');
    expect(sources.textContent).not.toMatch(
      /Food Composition Database|\bFCDB\b|\bUSDA\b|FoodData|New Zealand Food/,
    );
    expect(sources.textContent).not.toMatch(/food composition/i);
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
      await show('about');
      expect(screen.getByTestId('storage-protection').textContent).toBe('Checking…');
      await act(async () => {
        expect(await requestPersistentStorage({ persist, persisted })).toBe(state);
      });
      expect(persist).toHaveBeenCalledTimes(alreadyPersisted ? 0 : 1);
      expect(screen.getByTestId('storage-protection').textContent).toContain(shown);
    },
  );

  it('asks again after the app is installed and on return while not protected', async () => {
    const ask = vi.fn(() => Promise.resolve());
    const page = Object.assign(new EventTarget(), { visibilityState: 'visible' as const });
    const stop = askAgainWhenItMayHelp(page, ask);
    storageStore.set('not-protected');
    page.dispatchEvent(new Event('visibilitychange'));
    expect(ask).toHaveBeenCalledTimes(1);
    installStore.set({ canPrompt: false, installed: true });
    expect(ask).toHaveBeenCalledTimes(2);
    installStore.set({ canPrompt: false, installed: true });
    expect(ask).toHaveBeenCalledTimes(2);
    storageStore.set('protected');
    page.dispatchEvent(new Event('visibilitychange'));
    expect(ask).toHaveBeenCalledTimes(2);
    stop();
    storageStore.set('not-protected');
    page.dispatchEvent(new Event('visibilitychange'));
    expect(ask).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });

  it('does not ask again while hidden, or when the browser has no storage API', () => {
    const ask = vi.fn(() => Promise.resolve());
    const page = Object.assign(new EventTarget(), { visibilityState: 'hidden' as const });
    const stop = askAgainWhenItMayHelp(page, ask);
    storageStore.set('not-protected');
    page.dispatchEvent(new Event('visibilitychange'));
    storageStore.set('unsupported');
    installStore.set({ canPrompt: false, installed: true });
    expect(ask).not.toHaveBeenCalled();
    stop();
  });

  it('PWA-06: shows the same storage status wording as the Backup and data card', async () => {
    await show('about');
    for (const [state, text] of [
      ['protected', privacy.storageStatus.protected],
      ['not-protected', privacy.storageStatus.notProtected],
      ['unsupported', privacy.storageStatus.unsupported],
      ['checking', privacy.storageStatus.checking],
    ] as const) {
      act(() => {
        storageStore.set(state);
      });
      expect(screen.getByTestId('storage-protection').textContent).toBe(text);
    }
  });

  it('PWA-06: onOnboardingCompleted asks for persistent storage (the settings repository calls it once)', () => {
    const ask = vi.fn(() => Promise.resolve('protected'));
    onOnboardingCompleted(ask);
    expect(ask).toHaveBeenCalledOnce();
  });

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
    await show('food');
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
    await show('today');
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
    await show('today');
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

  it('without a prompt, says to open the installed app or use the browser menu', async () => {
    stopListening = listenForInstallPrompt(window);
    await show('settings');
    expect(screen.getByRole('region', { name: 'Install' }).textContent).toContain(
      'If the app is already on your home screen, open it from there. Otherwise use the browser menu and choose Install app.',
    );
  });

  it('says so when the app is already installed', async () => {
    window.matchMedia = vi.fn(
      (query: string) => ({ matches: true, media: query }) as MediaQueryList,
    );
    stopListening = listenForInstallPrompt(window);
    await show('settings');
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
