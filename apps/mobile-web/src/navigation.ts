import { PARENT_TAB, routeHref, type RouteId, type TabRouteId } from './routes';

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
  history: Pick<History, 'state' | 'back' | 'go' | 'replaceState'>;
}

const browserHistory = (): BrowserHistory => ({
  location: window.location,
  history: window.history,
});

const isAboveToday = (state: unknown): boolean =>
  typeof state === 'object' &&
  state !== null &&
  (state as Readonly<Record<string, unknown>>)[ABOVE_TODAY] === true;

/**
 * Item 19: the tab a sub-screen's entry was opened from (Garden and pantry from Food; item 27's
 * session and weekly plan from Move).
 */
const PARENT = 'dietParentTab';
/**
 * Item 19 review: that tab's entry is itself above Today, so Today is two entries back. It stays
 * when another tab replaces the entry, which is still two above Today.
 */
const TODAY_TWO_BACK = 'dietTodayTwoBack';

const parentTabOf = (state: unknown): unknown =>
  typeof state === 'object' && state !== null
    ? (state as Readonly<Record<string, unknown>>)[PARENT]
    : undefined;

const isTodayTwoBack = (state: unknown): boolean =>
  typeof state === 'object' &&
  state !== null &&
  (state as Readonly<Record<string, unknown>>)[TODAY_TWO_BACK] === true;

/**
 * The entry's state without the sub-screen mark, for a tab switch that replaces the entry; null
 * when nothing else is left (item 27).
 */
function withoutParentTab(state: unknown): unknown {
  if (parentTabOf(state) === undefined) return state;
  const rest = Object.entries(state as Readonly<Record<string, unknown>>).filter(
    ([key]) => key !== PARENT,
  );
  return rest.length === 0 ? null : Object.fromEntries(rest);
}

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
    // Item 19 review: Today, then Food, then Garden and pantry: step back over both, so Back from
    // Today still leaves the app.
    else if (isTodayTwoBack(history.state)) history.go(-2);
    else location.replace(href);
    return;
  }
  // Item 19: back to the tab a sub-screen was opened from, rather than a second entry for it.
  if (parentTabOf(history.state) === target) {
    history.back();
    return;
  }
  if (current === 'today' && !isAboveToday(history.state)) {
    // A new entry; markEntryAboveToday marks it once the route has changed.
    location.assign(href);
    return;
  }
  const state: unknown = withoutParentTab(history.state);
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

/**
 * Item 19: called after every route change, next to markEntryAboveToday. A new entry for a
 * sub-screen opened from its parent tab (Garden and pantry from Food) is marked, so the tab's tap
 * steps back to the tab's own entry instead of stacking a second one. `previousState` is the state
 * of the entry it was opened from: when that entry is above Today, the mark says so, and Today
 * steps back over both.
 */
export function markSubScreenEntry(
  previous: RouteId,
  current: RouteId,
  history: Pick<History, 'state' | 'replaceState'> = window.history,
  previousState: unknown = null,
): void {
  if (PARENT_TAB[current] === previous && history.state === null) {
    history.replaceState(
      isAboveToday(previousState)
        ? { [PARENT]: previous, [TODAY_TWO_BACK]: true }
        : { [PARENT]: previous },
      '',
    );
  }
}

/**
 * Item 19: moves the current entry to `href` without a new history entry and keeps its state
 * (closing the harvest panel turns #/garden/harvest into #/garden; item 27's Complete workout
 * resolver and the session chooser's Start links), so Back still goes where it did.
 */
export function replaceEntryHref(
  href: string,
  { location, history }: BrowserHistory = browserHistory(),
): void {
  const state: unknown = history.state;
  location.replace(href);
  history.replaceState(state, '', href);
}
