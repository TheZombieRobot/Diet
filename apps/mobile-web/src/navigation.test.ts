import { describe, expect, it } from 'vitest';
import {
  type BrowserHistory,
  goToTab,
  markEntryAboveToday,
  markSubScreenEntry,
  replaceKeepingEntry,
  subScreenMarkOf,
} from './navigation';
import { parseRoute, routeDetail, type RouteId, type TabRouteId } from './routes';

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
  // Shell's record of the shown entry's state, marks included: the next screen change reads it
  // as the entry it came from (item 19 review; item 20's depth).
  let shown: unknown = current().state;
  /** Shell's key for a new screen: the route, and for a recipe its id (App.tsx). */
  const screenKey = () =>
    `${route()}/${route() === 'recipe' ? (routeDetail(current().hash) ?? '') : ''}`;
  /** What Shell does after the screen changes. */
  const settle = (before: RouteId, beforeKey: string) => {
    if (screenKey() === beforeKey) return;
    if (route() !== before) markEntryAboveToday(before, route(), browser.history);
    markSubScreenEntry(before, route(), browser.history, shown);
    shown = current().state;
  };
  /** A tab tap, then what App does after the route changes. */
  const tap = (target: TabRouteId) => {
    const [before, beforeKey] = [route(), screenKey()];
    goToTab(target, before, browser);
    settle(before, beforeKey);
  };
  /** A link on the screen (Food's "Garden and pantry", Today's Add harvest, a recipe in the list). */
  const follow = (hash: string) => {
    const [before, beforeKey] = [route(), screenKey()];
    browser.location.assign(hash);
    settle(before, beforeKey);
  };
  /** A link that replaces the address (the session chooser, a swap's copy taking its recipe's place). */
  const replace = (hash: string) => {
    const [before, beforeKey] = [route(), screenKey()];
    replaceKeepingEntry(hash, {}, browser);
    settle(before, beforeKey);
  };
  /** Android's back gesture: true while it stays in the app, false when it would leave. */
  const back = (): boolean => {
    if (index === 0) return false;
    index -= 1;
    shown = current().state;
    return true;
  };
  return {
    tap,
    follow,
    open: follow,
    replace,
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

  it("item 27: a Move sub-screen opened from Move steps back to it, keeping Today's mark", () => {
    const app = fakeHistory();
    app.tap('move');
    app.follow('#/move-session/a');
    app.tap('move');
    expect(app.route()).toBe('move');
    expect(app.length()).toBe(3);
    expect(app.back()).toBe(true);
    expect(app.route()).toBe('today');
  });

  it('item 27: the chooser replaces its own address, so Back from the session returns to Today', () => {
    const app = fakeHistory();
    app.follow('#/move-session');
    app.replace('#/move-session/beach-walk');
    expect(app.length()).toBe(2);
    expect(app.back()).toBe(true);
    expect(app.route()).toBe('today');
    // Another tab from the sub-screen replaces it, as from any screen above Today.
    app.follow('#/move-plan');
    app.tap('food');
    expect(app.route()).toBe('food');
    expect(app.length()).toBe(2);
  });

  it('tapping the current tab does nothing', () => {
    const app = fakeHistory();
    app.tap('today');
    expect(app.length()).toBe(1);
  });
});

describe('sub-screens under a tab: Garden and pantry and Recipes under Food (items 19 and 20; C7, G21)', () => {
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

  it("from a garden screen reached by Today's Add harvest, Food replaces it and keeps the above-Today mark", () => {
    const app = fakeHistory();
    app.follow('#/garden/harvest');
    // Closing the harvest panel keeps the entry and its state.
    replaceKeepingEntry('#/garden', {}, app.browser);
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

  it('Today from a recipe reached through Food and Recipes steps back over every entry (items 19 and 20)', () => {
    const app = fakeHistory();
    app.tap('food');
    app.open('#/recipes');
    app.open('#/recipe/seed%3Arecipe-chicken-silverbeet-traybake');
    app.tap('today');
    expect([app.route(), app.length()]).toEqual(['today', 4]);
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
