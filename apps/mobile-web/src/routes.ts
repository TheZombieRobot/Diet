import { targets } from '@diet/core/copy/health';

/**
 * Hash routes (#/today, #/food, ...). GitHub Pages has no server-side rewrites, so the route lives
 * after the '#' and every screen is served by the same index.html, online or offline.
 */
export const ROUTES = [
  'today',
  'food',
  'move',
  'drinks',
  'list',
  'settings',
  'about',
  // Item 13: the Settings screens for the setup answers (RD-06).
  'readiness',
  'profile',
  'eating-schedule',
  // Item 14: the Weight screen, opened from Today's Weight card.
  'weight',
  // Item 15: the Fasting screen, opened from Today's Fast card and Settings, Eating schedule.
  'fasting',
  // Item 21: Diet and targets, reached from Settings.
  'targets',
  // Item 27: a session and the weekly plan editor, sub-screens of the Move tab.
  'move-session',
  'move-plan',
] as const;
export type RouteId = (typeof ROUTES)[number];

/** The five bottom tabs, in order (UX_SCREENS.md global elements). */
export const TAB_ROUTES = ['today', 'food', 'move', 'drinks', 'list'] as const;
export type TabRouteId = (typeof TAB_ROUTES)[number];

export const DEFAULT_ROUTE: RouteId = 'today';

/** The screen name shown in the top bar and the document title. */
export const ROUTE_TITLES: Readonly<Record<RouteId, string>> = {
  today: 'Today',
  food: 'Food',
  move: 'Move',
  drinks: 'Drinks',
  list: 'List',
  settings: 'Settings',
  about: 'About',
  readiness: 'Readiness answers',
  profile: 'Profile',
  'eating-schedule': 'Eating schedule',
  weight: 'Weight',
  fasting: 'Fasting and reflux',
  targets: targets.screen.title,
  'move-session': 'Session',
  'move-plan': 'Weekly plan',
};

const isRoute = (value: string): value is RouteId => (ROUTES as readonly string[]).includes(value);

export const isTabRoute = (route: RouteId): route is TabRouteId =>
  (TAB_ROUTES as readonly string[]).includes(route);

export const routeHref = (route: RouteId): `#/${RouteId}` => `#/${route}`;

/**
 * The Fasting screen's sub-links (item 15 design 3.1): #/fasting/reflux focuses the Reflux card,
 * #/fasting/pattern opens the pattern form. The route is still 'fasting'.
 */
export const FASTING_SUBLINKS = ['reflux', 'pattern'] as const;
export type FastingSublink = (typeof FASTING_SUBLINKS)[number];

export const fastingHref = (sub: FastingSublink): string => `${routeHref('fasting')}/${sub}`;

/** The sub-link a hash names, if it is one of the Fasting screen's. */
export function fastingSublink(hash: string): FastingSublink | null {
  const sub = /^#\/fasting\/([a-z]+)$/.exec(hash)?.[1];
  return (FASTING_SUBLINKS as readonly string[]).includes(sub ?? '')
    ? (sub as FastingSublink)
    : null;
}

/** The route for a location hash; anything unknown (or empty) opens Today. */
export function parseRoute(hash: string): RouteId {
  const name = hash.replace(/^#\/?/, '').split(/[/?#]/, 1)[0]?.toLowerCase() ?? '';
  return isRoute(name) ? name : DEFAULT_ROUTE;
}

/**
 * Sub-screens of a tab (item 19's rule, added by item 27 ahead of it): the tab is marked as their
 * parent, and a tap on it from a sub-screen opened from that tab steps back (navigation.ts).
 */
export const PARENT_TAB: Readonly<Partial<Record<RouteId, TabRouteId>>> = {
  'move-session': 'move',
  'move-plan': 'move',
};

/**
 * Every in-app address that is not routeHref of a route, so the first-run guard's tests cover it
 * (HS-20). Item 19 adds its own.
 */
export const DEEP_LINKS = ['#/move-session/a', '#/move-session/a/finish'] as const;

/** The second path segment, lower-cased: '#/garden/harvest' → 'harvest'; none → null (item 19). */
export function routeDetail(hash: string): string | null {
  const detail = hash.replace(/^#\/?/, '').split(/[?#]/, 1)[0]?.split('/')[1]?.toLowerCase() ?? '';
  return detail === '' ? null : detail;
}

/** The session route's slug and finish step: '#/move-session/a/finish' → { slug: 'a', finish: true }. */
export function moveSessionLink(hash: string): {
  readonly slug: string | null;
  readonly finish: boolean;
} {
  const segments = hash.replace(/^#\/?/, '').split(/[?#]/, 1)[0]?.split('/') ?? [];
  if (segments[0]?.toLowerCase() !== 'move-session') return { slug: null, finish: false };
  const slug = segments[1]?.toLowerCase() ?? '';
  return { slug: slug === '' ? null : slug, finish: segments[2] === 'finish' };
}

/** The screens reached from Settings, which light up the settings gear with it. */
const UNDER_SETTINGS: readonly RouteId[] = [
  'about',
  'readiness',
  'profile',
  'eating-schedule',
  'targets',
];

/** Settings and the screens reached from it light up the settings gear. */
export const isUnderSettings = (route: RouteId): boolean =>
  route === 'settings' || UNDER_SETTINGS.includes(route);
