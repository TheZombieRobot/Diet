import { PARENT_TAB, routeHref, type RouteId, type TabRouteId } from './routes';

/**
 * Tab switching that keeps Android's back gesture short (item 5 review): back from any tab goes
 * to Today, and back from Today leaves the app, however many tabs were tapped. Leaving Today adds
 * one history entry, marked as "above Today"; switching between the other tabs replaces it; going
 * back to Today steps back over it. Settings and About keep ordinary links, so back from About
 * still returns to Settings.
 */
const ABOVE_TODAY = 'dietAboveToday';
/** A sub-screen entry opened from its parent tab: { dietParentTab: <tab> } (item 19's rule). */
const PARENT_TAB_KEY = 'dietParentTab';

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

const stateRecord = (state: unknown): Readonly<Record<string, unknown>> | null =>
  typeof state === 'object' && state !== null ? (state as Readonly<Record<string, unknown>>) : null;

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
  // A sub-screen opened from this tab: step back to the tab's own entry instead of adding one.
  if (stateRecord(history.state)?.[PARENT_TAB_KEY] === target) {
    history.back();
    return;
  }
  if (current === 'today' && !isAboveToday(history.state)) {
    // A new entry; markEntryAboveToday marks it once the route has changed.
    location.assign(href);
    return;
  }
  // Carry the entry's marks, but not a parent-tab mark, which belongs to the sub-screen.
  const record = stateRecord(history.state);
  let state: unknown = history.state;
  if (record !== null && PARENT_TAB_KEY in record) {
    const rest = Object.fromEntries(Object.entries(record).filter(([k]) => k !== PARENT_TAB_KEY));
    state = Object.keys(rest).length === 0 ? null : rest;
  }
  location.replace(href);
  history.replaceState(state, '', href);
}

/**
 * Called after every route change, beside markEntryAboveToday: a new entry for a sub-screen
 * reached from its parent tab is marked, so the tab's tap steps back to it (item 19's rule).
 */
export function markSubScreenEntry(
  previous: RouteId,
  current: RouteId,
  history: Pick<History, 'state' | 'replaceState'> = window.history,
): void {
  const parent = PARENT_TAB[current];
  if (parent !== undefined && parent === previous && history.state === null) {
    history.replaceState({ [PARENT_TAB_KEY]: parent }, '');
  }
}

/**
 * Replaces the address without a new history entry, keeping the entry's marks (above Today, the
 * parent tab): the Complete workout resolver and the session chooser's Start links (item 27).
 */
export function replaceHash(
  href: string,
  { location, history }: BrowserHistory = browserHistory(),
): void {
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
