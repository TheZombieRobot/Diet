import { describe, expect, it } from 'vitest';
import {
  goToTab,
  markEntryAboveToday,
  markSubScreenEntry,
  type BrowserHistory,
  replaceEntryHref,
} from './navigation';
import { parseRoute, type RouteId, type TabRouteId } from './routes';

/** A stand-in for the browser's session history: one list of entries and a current index. */
function fakeHistory(start = '#/today') {
  const entries: { hash: string; state: unknown }[] = [{ hash: start, state: null }];
  let index = 0;
  const current = () => entries[index] ?? { hash: '', state: null };
  const browser: BrowserHistory = {
    location: {
      assign: (url: string | URL) => {
        entries.splice(index + 1, entries.length, { hash: String(url), state: null });
        index += 1;
      },
      replace: (url: string | URL) => {
        entries[index] = { hash: String(url), state: null };
      },
    },
    history: {
      get state() {
        return current().state;
      },
      back: () => {
        index = Math.max(0, index - 1);
      },
      go: (delta = 0) => {
        index = Math.min(entries.length - 1, Math.max(0, index + delta));
      },
      replaceState: (state: unknown, _unused: string, url?: string | URL | null) => {
        entries[index] = {
          hash: url === null || url === undefined ? current().hash : String(url),
          state,
        };
      },
    },
  };
  const route = (): RouteId => parseRoute(current().hash);
  /** What App does after the route changes, with the state of the entry it came from. */
  const marks = (before: RouteId, stateBefore: unknown) => {
    if (route() === before) return;
    markEntryAboveToday(before, route(), browser.history);
    markSubScreenEntry(before, route(), browser.history, stateBefore);
  };
  /** A tab tap. */
  const tap = (target: TabRouteId) => {
    const [before, stateBefore] = [route(), current().state];
    goToTab(target, before, browser);
    marks(before, stateBefore);
  };
  /** A link in the page (Food's "Garden and pantry", Today's Add harvest). */
  const follow = (href: string) => {
    const [before, stateBefore] = [route(), current().state];
    browser.location.assign(href);
    marks(before, stateBefore);
  };
  /** Android's back gesture: true while it stays in the app, false when it would leave. */
  const back = (): boolean => {
    if (index === 0) return false;
    index -= 1;
    return true;
  };
  return {
    tap,
    follow,
    back,
    route,
    browser,
    hash: () => current().hash,
    length: () => entries.length,
  };
}

describe('tab switching and the back gesture', () => {
  it('back from any tab goes to Today, then leaves the app', () => {
    const app = fakeHistory();
    for (const tab of ['food', 'move', 'drinks', 'list', 'food'] as const) app.tap(tab);
    expect(app.route()).toBe('food');
    expect(app.length()).toBe(2);
    expect(app.back()).toBe(true);
    expect(app.route()).toBe('today');
    expect(app.back()).toBe(false);
  });

  it('tapping Today steps back to it instead of adding an entry', () => {
    const app = fakeHistory();
    app.tap('move');
    app.tap('drinks');
    app.tap('today');
    expect(app.route()).toBe('today');
    expect(app.length()).toBe(2);
    expect(app.back()).toBe(false);
  });

  it('opened straight on a tab, Today replaces it and back leaves the app', () => {
    const app = fakeHistory('#/list');
    app.tap('food');
    expect(app.length()).toBe(1);
    app.tap('today');
    expect(app.route()).toBe('today');
    expect(app.length()).toBe(1);
    expect(app.back()).toBe(false);
  });

  it('tapping the current tab does nothing', () => {
    const app = fakeHistory();
    app.tap('today');
    expect(app.length()).toBe(1);
  });
});

describe('a screen under a tab: Garden and pantry under Food (item 19; C7, G21)', () => {
  it('Food from a garden screen opened from Food steps back to that Food entry', () => {
    const app = fakeHistory();
    app.tap('food');
    app.follow('#/garden');
    expect(app.length()).toBe(3);
    app.tap('food');
    expect(app.route()).toBe('food');
    expect(app.back()).toBe(true);
    expect(app.route()).toBe('today');
    expect(app.back()).toBe(false);
  });

  it("from a garden screen reached by Today's Add harvest, Food replaces it and keeps the above-Today mark", () => {
    const app = fakeHistory();
    app.follow('#/garden/harvest');
    // Closing the harvest panel keeps the entry and its state.
    replaceEntryHref('#/garden', app.browser);
    expect([app.hash(), app.length()]).toEqual(['#/garden', 2]);
    app.tap('food');
    expect([app.route(), app.length()]).toEqual(['food', 2]);
    // The mark kept: Today steps back, and back from Today leaves the app.
    app.tap('today');
    expect(app.route()).toBe('today');
    expect(app.back()).toBe(false);
  });

  // Item 19 review: Today, Food, Garden and pantry, then Today: back from Today leaves the app.
  it.each([[[]], [['move']], [['move', 'drinks']]] as const)(
    'Today from a garden screen opened from Food (then tabs %j) steps back over both entries',
    (tabs) => {
      const app = fakeHistory();
      app.tap('food');
      app.follow('#/garden');
      for (const tab of tabs) app.tap(tab);
      app.tap('today');
      expect([app.route(), app.length()]).toEqual(['today', 3]);
      expect(app.back()).toBe(false);
    },
  );
});
