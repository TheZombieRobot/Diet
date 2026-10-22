import { describe, expect, it } from 'vitest';
import {
  type BrowserHistory,
  goToTab,
  markEntryAboveToday,
  markSubScreenEntry,
  replaceKeepingEntry,
  subScreenMarkOf,
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
      go: (delta?: number) => {
        index = Math.min(entries.length - 1, Math.max(0, index + (delta ?? 0)));
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
  // Shell's record of the shown entry's sub-screen mark.
  let mark = subScreenMarkOf(current().state);
  /** What Shell does after the screen changes. */
  const settle = (before: RouteId, beforeHash: string) => {
    if (current().hash === beforeHash) return;
    if (route() !== before) markEntryAboveToday(before, route(), browser.history);
    markSubScreenEntry(before, route(), mark, browser.history);
    mark = subScreenMarkOf(current().state);
  };
  /** A tab tap, then what App does after the route changes. */
  const tap = (target: TabRouteId) => {
    const [before, beforeHash] = [route(), current().hash];
    goToTab(target, before, browser);
    settle(before, beforeHash);
  };
  /** A link on the screen (a recipe in the list, a leftovers link). */
  const open = (hash: string) => {
    const [before, beforeHash] = [route(), current().hash];
    browser.location.assign(hash);
    settle(before, beforeHash);
  };
  /** A swap's copy taking its recipe's place. */
  const replace = (hash: string) => {
    const [before, beforeHash] = [route(), current().hash];
    replaceKeepingEntry(hash, {}, browser);
    settle(before, beforeHash);
  };
  /** Android's back gesture: true while it stays in the app, false when it would leave. */
  const back = (): boolean => {
    if (index === 0) return false;
    index -= 1;
    mark = subScreenMarkOf(current().state);
    return true;
  };
  return { tap, open, replace, back, route, length: () => entries.length };
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

describe('sub-screens under a tab (items 19 and 20)', () => {
  it('Food > Recipes > a recipe > another recipe > Food tab: Back goes to Today', () => {
    const app = fakeHistory();
    app.tap('food');
    app.open('#/recipes');
    app.open('#/recipe/seed%3Arecipe-chicken-silverbeet-traybake');
    app.open('#/recipe/seed%3Arecipe-silverbeet-lemon-chicken-soup');
    app.tap('food');
    expect(app.route()).toBe('food');
    expect(app.back()).toBe(true);
    expect(app.route()).toBe('today');
    expect(app.back()).toBe(false);
  });

  it('a recipe replaced by its copy keeps its place: the Food tab still steps back to Food', () => {
    const app = fakeHistory();
    app.tap('food');
    app.open('#/recipes');
    app.open('#/recipe/seed%3Arecipe-chicken-silverbeet-traybake');
    app.replace('#/recipe/00000000-0000-4000-8000-000000000001');
    expect(app.back()).toBe(true);
    expect(app.route()).toBe('recipes');
    app.open('#/recipe/00000000-0000-4000-8000-000000000001');
    app.tap('food');
    expect(app.route()).toBe('food');
    expect(app.back()).toBe(true);
    expect(app.route()).toBe('today');
  });

  it('a damaged depth never steps further back than one entry', () => {
    expect(subScreenMarkOf({ dietParentTab: 'food', dietParentDepth: 999 })).toEqual({
      tab: 'food',
      depth: 1,
    });
    expect(subScreenMarkOf({ dietParentTab: 'food', dietParentDepth: 2 })?.depth).toBe(2);
    expect(subScreenMarkOf(null)).toBeNull();
  });
});
