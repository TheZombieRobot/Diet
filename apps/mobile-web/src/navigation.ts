import { routeHref, type RouteId, type TabRouteId } from './routes';

/**
 * Tab switching that keeps Android's back gesture short (item 5 review): back from any tab goes
 * to Today, and back from Today leaves the app, however many tabs were tapped. Leaving Today adds
 * one history entry, marked as "above Today"; switching between the other tabs replaces it; going
 * back to Today steps back over it. Settings and About keep ordinary links, so back from About
 * still returns to Settings.
 */
const ABOVE_TODAY = 'dietAboveToday';

export interface BrowserHistory {
  location: Pick<Location, 'assign' | 'replace'>;
  history: Pick<History, 'state' | 'back' | 'replaceState'>;
}

const browserHistory = (): BrowserHistory => ({
  location: window.location,
  history: window.history,
});

const isAboveToday = (state: unknown): boolean =>
  typeof state === 'object' &&
  state !== null &&
  (state as Readonly<Record<string, unknown>>)[ABOVE_TODAY] === true;

/** Switches to a tab, the way a tap on the tab bar does. */
export function goToTab(
  target: TabRouteId,
  current: RouteId,
  { location, history }: BrowserHistory = browserHistory(),
): void {
  if (target === current) return;
  const href = routeHref(target);
  if (target === 'today') {
    if (isAboveToday(history.state)) history.back();
    else location.replace(href);
    return;
  }
  if (current === 'today' && !isAboveToday(history.state)) {
    // A new entry; markEntryAboveToday marks it once the route has changed.
    location.assign(href);
    return;
  }
  const state: unknown = history.state;
  location.replace(href);
  history.replaceState(state, '', href);
}

/**
 * Called after every route change. A new history entry reached straight from Today (by a tab or
 * the settings gear) is marked, so a later tap on Today steps back to it instead of adding one.
 */
export function markEntryAboveToday(
  previous: RouteId,
  current: RouteId,
  history: Pick<History, 'state' | 'replaceState'> = window.history,
): void {
  if (previous === 'today' && current !== 'today' && history.state === null) {
    history.replaceState({ [ABOVE_TODAY]: true }, '');
  }
}
