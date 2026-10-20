import { isId, isSeedId, MAX_MY_SERVES, type RefId } from '@diet/core';
import { foods, recipes, targets } from '@diet/core/copy/health';

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
  // Item 18: the food catalogue, opened from About.
  'foods',
  // Item 30: Settings, Laptop pairing.
  'pairing',
  // Item 20: the recipe list and a recipe's page, reached from Food.
  'recipes',
  'recipe',
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
  foods: foods.screen.title,
  pairing: 'Laptop pairing',
  recipes: recipes.routeTitles.recipes,
  recipe: recipes.routeTitles.recipe,
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

/** The screens reached from Settings, which light up the settings gear with it. */
const UNDER_SETTINGS: readonly RouteId[] = [
  'about',
  'readiness',
  'profile',
  'eating-schedule',
  'targets',
  // Item 18: reached from About.
  'foods',
  'pairing',
];

/** Settings and the screens reached from it light up the settings gear. */
export const isUnderSettings = (route: RouteId): boolean =>
  route === 'settings' || UNDER_SETTINGS.includes(route);

// ---- Screens under a tab, and deep links (item 19's helpers; item 20 adds them first) ----

/**
 * Screens that are not tabs but sit under one (item 19 design 1.1; G21): the tab stays lit, marked
 * aria-current="true" rather than "page", as the settings gear is for the screens under Settings.
 */
export const PARENT_TAB: Readonly<Partial<Record<RouteId, TabRouteId>>> = {
  recipes: 'food',
  recipe: 'food',
};

/** The second segment of a hash, lower-cased: '#/garden/harvest' gives 'harvest', '#/garden' null. */
export function routeDetail(hash: string): string | null {
  const detail = hash.replace(/^#\/?/, '').split(/[?#]/, 1)[0]?.split('/')[1]?.toLowerCase();
  return detail === undefined || detail === '' ? null : detail;
}

// ---- Item 20: recipes ----

/** A recipe's page; `myServes` is the planned portion when a plan day links to it (item 22). */
export function recipeHref(id: RefId, options: { readonly myServes?: number } = {}): string {
  const href = `${routeHref('recipe')}/${encodeURIComponent(id)}`;
  return options.myServes === undefined ? href : `${href}?my=${options.myServes}`;
}

/** The silverbeet week's first dinner: the recipe deep link the first-run guard tests cover. */
export const RECIPE_DEEP_LINK = recipeHref('seed:recipe-chicken-silverbeet-traybake');

/**
 * Every in-app address that is not the plain link of a route, so the first-run guard's tests
 * (item 13's K1 and P1; HS-20, C53) cover them too.
 */
export const DEEP_LINKS: readonly string[] = [
  ...FASTING_SUBLINKS.map(fastingHref),
  RECIPE_DEEP_LINK,
];

/**
 * The recipe a hash names, a seed id or an owner copy's id (both lower case), and the planned
 * portion `?my=` when it is a number above 0 and at most MAX_MY_SERVES; null for anything else.
 */
export function recipeRouteOf(
  hash: string,
): { readonly id: RefId; readonly myServes: number | null } | null {
  if (parseRoute(hash) !== 'recipe') return null;
  const detail = routeDetail(hash);
  if (detail === null) return null;
  let id: string;
  try {
    id = decodeURIComponent(detail);
  } catch {
    return null;
  }
  if (!isSeedId(id) && !isId(id)) return null;
  const my = new URLSearchParams(hash.split('?')[1] ?? '').get('my');
  const myServes = my === null || my.trim() === '' ? Number.NaN : Number(my);
  return {
    id,
    myServes:
      Number.isFinite(myServes) && myServes > 0 && myServes <= MAX_MY_SERVES ? myServes : null,
  };
}
