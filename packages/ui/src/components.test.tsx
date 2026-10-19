import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActionRow,
  AppShell,
  applyTheme,
  Banner,
  Button,
  Card,
  currentThemePreference,
  FloatingActionButton,
  IconButton,
  IconLink,
  OFFLINE_LABEL,
  OfflineIndicator,
  ONLINE_LABEL,
  TabBar,
  TodayIcon,
  type TabItem,
} from './index';
import componentsCss from './styles/components.css?raw';
import tokensCss from './styles/tokens.css?raw';

const TABS: readonly TabItem[] = [
  { id: 'today', label: 'Today', href: '#/today', icon: <TodayIcon /> },
  { id: 'food', label: 'Food', href: '#/food', icon: <TodayIcon /> },
  { id: 'move', label: 'Move', href: '#/move', icon: <TodayIcon /> },
  { id: 'drinks', label: 'Drinks', href: '#/drinks', icon: <TodayIcon /> },
  { id: 'list', label: 'List', href: '#/list', icon: <TodayIcon /> },
];

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
});

function goOffline(): void {
  online = false;
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

function goOnline(): void {
  online = true;
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

describe('OfflineIndicator', () => {
  it('flips between "Online" and "Offline, all saved" with the online and offline events', () => {
    render(<OfflineIndicator />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveProperty('textContent', ONLINE_LABEL);

    goOffline();
    expect(pill).toHaveProperty('textContent', OFFLINE_LABEL);
    expect(OFFLINE_LABEL).toBe('Offline, all saved');

    goOnline();
    expect(pill).toHaveProperty('textContent', ONLINE_LABEL);
  });

  it('starts offline when the browser already reports no connection', () => {
    online = false;
    render(<OfflineIndicator />);
    expect(screen.getByRole('status').textContent).toBe(OFFLINE_LABEL);
  });
});

describe('TabBar', () => {
  it('marks only the current tab with aria-current="page"', () => {
    render(<TabBar items={TABS} current="drinks" />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Today', 'Food', 'Move', 'Drinks', 'List']);
    expect(links.map((l) => l.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'page',
      null,
    ]);
    expect(within(nav).getByRole('link', { name: 'Drinks' }).getAttribute('href')).toBe('#/drinks');
  });

  it('marks no tab on a screen that is not a tab', () => {
    render(<TabBar items={TABS} current={undefined} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.hasAttribute('aria-current')).toBe(false);
    }
  });
});

describe('icon-only controls carry an accessible name', () => {
  it('IconButton, IconLink and the floating button use their label as aria-label', () => {
    const onClick = vi.fn();
    render(
      <>
        <IconButton label="Dismiss" icon={<TodayIcon />} onClick={onClick} />
        <IconLink label="Settings" href="#/settings" icon={<TodayIcon />} current />
        <FloatingActionButton label="Quick actions" />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('button', { name: 'Quick actions' })).toBeDefined();
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control.getAttribute('aria-label')).toMatch(/\S/);
      expect(control.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('buttons never submit a form by accident', () => {
    render(
      <>
        <Button>Text</Button>
        <IconButton label="Icon" icon={<TodayIcon />} />
        <FloatingActionButton label="Plus" />
      </>,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('type')).toBe('button');
    }
  });
});

describe('AppShell', () => {
  it('shows the screen name, the offline pill, the settings gear and the tab bar', () => {
    render(
      <AppShell
        title="Food"
        tabs={TABS}
        currentTab="food"
        settingsHref="#/settings"
        settingsCurrent={false}
        banners={<Banner title="Update available" />}
        floatingAction={<FloatingActionButton label="Quick actions" />}
      >
        <p>Screen content</p>
      </AppShell>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Food' })).toBeDefined();
    expect(screen.getByRole('banner').textContent).toContain(ONLINE_LABEL);
    expect(screen.getByRole('link', { name: 'Settings' }).hasAttribute('aria-current')).toBe(false);
    expect(within(screen.getByRole('main')).getByText('Screen content')).toBeDefined();
    expect(within(screen.getByRole('main')).getByText('Update available')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Food' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Quick actions' })).toBeDefined();
  });

  it('flips the top-bar pill when the connection drops', () => {
    render(
      <AppShell
        title="Today"
        tabs={TABS}
        currentTab="today"
        settingsHref="#/settings"
        settingsCurrent
      >
        <p>Screen</p>
      </AppShell>,
    );
    goOffline();
    expect(screen.getByRole('banner').textContent).toContain(OFFLINE_LABEL);
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

describe('Card, Banner and ActionRow', () => {
  it('a card is a region named by its section label', () => {
    render(
      <Card label="Weight">
        <p>Body</p>
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Weight' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Weight' })).toBeDefined();
    expect(within(region).getByText('Body')).toBeDefined();
  });

  it('a banner is a polite status message with its actions', () => {
    const onReload = vi.fn();
    render(
      <Banner
        title="Update available"
        actions={
          <Button variant="primary" onClick={onReload}>
            Reload
          </Button>
        }
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Update available');
    fireEvent.click(within(status).getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('an action row is one link named by its title and detail', () => {
    render(
      <ActionRow href="tel:111" title="Emergency" detail="111" badge="111" tone="emergency" />,
    );
    const link = screen.getByRole('link', { name: 'Emergency 111' });
    expect(link.getAttribute('href')).toBe('tel:111');
    expect(link.className).toContain('ui-action-row--emergency');
  });
});

/**
 * Resolves a computed length in px. jsdom applies stylesheets but does not resolve var() or
 * calc(), so this does both for the simple forms the stylesheet uses.
 */
function resolvedPx(element: Element, property: string): number {
  const style = getComputedStyle(element);
  const resolveVars = (value: string): string =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name: string) =>
      resolveVars(style.getPropertyValue(name).trim()),
    );
  const value = resolveVars(style.getPropertyValue(property).trim());
  const calc = /^calc\((.*)\)$/.exec(value)?.[1] ?? value;
  const terms = calc.match(/[+-]?\s*\d+(?:\.\d+)?px/g);
  if (terms === null) throw new Error(`${property} is not a px length: ${value}`);
  return terms.reduce((sum, term) => sum + Number(term.replace(/\s|px/g, '')), 0);
}

describe('tap targets are at least 48 px (UX_SCREENS.md design rules)', () => {
  beforeEach(() => {
    const style = document.createElement('style');
    style.textContent = `${tokensCss}\n${componentsCss}`;
    document.head.append(style);
  });

  it('every button, icon control, tab and row has a min-height and min-width of 48 px or more', () => {
    render(
      <>
        <Button>Text button</Button>
        <Button variant="quiet">Quiet</Button>
        <IconButton label="Icon button" icon={<TodayIcon />} />
        <IconLink label="Icon link" href="#/x" icon={<TodayIcon />} />
        <FloatingActionButton label="Floating" />
        <TabBar items={TABS} current="today" />
        <ActionRow href="tel:111" title="Row" badge="1" />
      </>,
    );
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(controls).toHaveLength(11);
    for (const control of controls) {
      const name = control.getAttribute('aria-label') ?? control.textContent;
      expect(resolvedPx(control, 'min-height'), `${name} height`).toBeGreaterThanOrEqual(48);
      if (!control.classList.contains('ui-action-row')) {
        expect(resolvedPx(control, 'min-width'), `${name} width`).toBeGreaterThanOrEqual(48);
      }
    }
  });

  it('the size token itself is 48 px', () => {
    expect(getComputedStyle(document.documentElement).getPropertyValue('--size-tap').trim()).toBe(
      '48px',
    );
  });
});

describe('applyTheme', () => {
  it('sets data-theme on <html> for light or dark, and removes it to follow the phone', () => {
    expect(currentThemePreference()).toBe('system');
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(currentThemePreference()).toBe('dark');
    applyTheme('light');
    expect(currentThemePreference()).toBe('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
