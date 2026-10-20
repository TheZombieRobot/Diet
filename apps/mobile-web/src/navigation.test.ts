import { describe, expect, it } from 'vitest';
import {
  goToTab,
  markEntryAboveToday,
  markSubScreenEntry,
  replaceHash,
  type BrowserHistory,
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
      replaceState: (state: unknown, _unused: string, url?: string | URL | null) => {
        entries[index] = {
          hash: url === null || url === undefined ? current().hash : String(url),
          state,
        };
      },
    },
  };
  const route = (): RouteId => parseRoute(current().hash);
  /** What App does after the route changes. */
  const marked = (before: RouteId) => {
    if (route() === before) return;
    markEntryAboveToday(before, route(), browser.history);
    markSubScreenEntry(before, route(), browser.history);
  };
  /** A tab tap. */
  const tap = (target: TabRouteId) => {
    const before = route();
    goToTab(target, before, browser);
    marked(before);
  };
  /** A link followed in the app (a new entry). */
  const follow = (href: string) => {
    const before = route();
    browser.location.assign(href);
    marked(before);
  };
  /** A link that replaces the address (the session chooser). */
  const replace = (href: string) => {
    const before = route();
    replaceHash(href, browser);
    marked(before);
  };
  /** Android's back gesture: true while it stays in the app, false when it would leave. */
  const back = (): boolean => {
    if (index === 0) return false;
    index -= 1;
    return true;
  };
  return { tap, follow, replace, back, route, length: () => entries.length };
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
