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

/** Item 19: the tab a sub-screen's entry was opened from (Garden and pantry from Food). */
const PARENT = 'dietParentTab';
/**
 * Item 20: how many entries above that tab's own entry this one is (Food > Recipes is 1, Food >
 * Recipes > a recipe is 2, a recipe linked from it 3), so the tab's tap steps back over them all.
 */
const DEPTH = 'dietParentDepth';
/** More is never written; anything else reads as 1, so a damaged mark never steps out of the app. */
const MAX_DEPTH = 50;

const entryOf = (state: unknown): Readonly<Record<string, unknown>> | null =>
  typeof state === 'object' && state !== null ? (state as Readonly<Record<string, unknown>>) : null;

const parentTabOf = (state: unknown): unknown => entryOf(state)?.[PARENT];

/** A sub-screen entry's mark: the tab it was opened under, and how far above that tab it is. */
export interface SubScreenMark {
  readonly tab: unknown;
  readonly depth: number;
}

export function subScreenMarkOf(state: unknown): SubScreenMark | null {
  const tab = parentTabOf(state);
  if (tab === undefined) return null;
  const depth = entryOf(state)?.[DEPTH];
  return {
    tab,
    depth:
      typeof depth === 'number' && Number.isInteger(depth) && depth >= 1 && depth <= MAX_DEPTH
        ? depth
        : 1,
  };
}

/** The entry's state without the sub-screen mark, for a tab switch that replaces the entry. */
function withoutParentTab(state: unknown): unknown {
  if (parentTabOf(state) === undefined) return state;
  return Object.fromEntries(
    Object.entries(state as Readonly<Record<string, unknown>>).filter(
      ([key]) => key !== PARENT && key !== DEPTH,
    ),
  );
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
    else location.replace(href);
    return;
  }
  // Item 19: back to the tab a sub-screen was opened from, rather than a second entry for it;
  // item 20: over every sub-screen entry opened above it (Recipes, then a recipe).
  const mark = subScreenMarkOf(history.state);
  if (mark !== null && mark.tab === target) {
    if (mark.depth === 1) history.back();
    else history.go(-mark.depth);
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
 * steps back to the tab's own entry instead of stacking a second one. Item 20: also called when
 * one recipe opens another; a new entry opened from a marked sub-screen of the same tab (a recipe
 * from Recipes, a recipe from a recipe) is marked one deeper, so the tab's tap steps back over all
 * of them and Back from the tab still goes to Today. `previousMark` is the mark of the entry the
 * owner came from.
 */
export function markSubScreenEntry(
  previous: RouteId,
  current: RouteId,
  previousMark: SubScreenMark | null = null,
  history: Pick<History, 'state' | 'replaceState'> = window.history,
): void {
  if (history.state !== null) return;
  const parent = PARENT_TAB[current];
  if (parent === undefined) return;
  if (parent === previous) history.replaceState({ [PARENT]: previous }, '');
  else if (previousMark !== null && previousMark.tab === parent && previousMark.depth < MAX_DEPTH)
    history.replaceState({ [PARENT]: parent, [DEPTH]: previousMark.depth + 1 }, '');
}

/**
 * Item 20: keeps a screen's own values on its history entry (a recipe's Cooking for, the recipe
 * list's place), beside the marks above, so Back returns to them. Called on an owner's action
 * only, never as a screen opens, so a new entry is still unmarked when Shell marks it.
 */
export function keepOnEntry(
  values: Readonly<Record<string, unknown>>,
  history: Pick<History, 'state' | 'replaceState'> = window.history,
): void {
  history.replaceState({ ...entryOf(history.state), ...values }, '');
}

/** A value kept on the current entry by keepOnEntry, or undefined. */
export function keptOnEntry(
  key: string,
  history: Pick<History, 'state'> = window.history,
): unknown {
  return entryOf(history.state)?.[key];
}

/**
 * Item 20: replaces this entry with another screen (a recipe's copy after a swap, the original
 * after Undo), keeping its marks, so Back and the tab's tap behave as they did on the screen it
 * replaces; `values` are kept on it too.
 */
export function replaceKeepingEntry(
  href: string,
  values: Readonly<Record<string, unknown>> = {},
  { location, history }: BrowserHistory = browserHistory(),
): void {
  const state: unknown = history.state;
  location.replace(href);
  history.replaceState(
    Object.keys(values).length === 0 ? state : { ...entryOf(state), ...values },
    '',
    href,
  );
}
