import {
  isId,
  isLocalDate,
  isSeedId,
  type LocalDate,
  MAX_MY_SERVES,
  MEAL_SLOTS,
  type MealSlot,
  type RefId,
} from '@diet/core';
import { foods, grocery, planner, recipes, targets } from '@diet/core/copy/health';

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
  // Item 19: Garden and pantry, reached from Food (and Today's Add harvest).
  'garden',
  // Item 27: a session and the weekly plan editor, sub-screens of the Move tab.
  'move-session',
  'move-plan',
  // Item 30: Settings, Laptop pairing.
  'pairing',
  // Item 20: the recipe list and a recipe's page, reached from Food.
  'recipes',
  'recipe',
  // Item 22: one planned day.
  'plan',
  // Item 24: the store name setting, from Settings and the List header.
  'store',
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
  garden: 'Garden and pantry',
  'move-session': 'Session',
  'move-plan': 'Weekly plan',
  pairing: 'Laptop pairing',
  recipes: recipes.routeTitles.recipes,
  recipe: recipes.routeTitles.recipe,
  plan: planner.routeTitle,
  store: grocery.store.label,
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
  // Item 24.
  'store',
];

/** Settings and the screens reached from it light up the settings gear. */
export const isUnderSettings = (route: RouteId): boolean =>
  route === 'settings' || UNDER_SETTINGS.includes(route);

// ---- Sub-screens of a tab: item 19's garden and pantry and item 20's recipes under Food, item
// 27's Move screens ----

/**
 * Screens that are not tabs but sit under one (item 19 design 1.1; G21; items 20 and 27): the tab
 * stays lit, marked aria-current="true" rather than "page", as the settings gear is for the screens
 * under Settings, and a tap on it from a sub-screen opened from that tab steps back over every
 * sub-screen entry above it (navigation.ts).
 */
export const PARENT_TAB: Readonly<Partial<Record<RouteId, TabRouteId>>> = {
  garden: 'food',
  recipes: 'food',
  recipe: 'food',
  plan: 'food',
  'move-session': 'move',
  'move-plan': 'move',
};

/** The garden screen with its Add harvest panel open (Today's quick action). */
export const GARDEN_HARVEST_HREF = `${routeHref('garden')}/harvest`;

/** The second segment of a hash, lower-cased: '#/garden/harvest' gives 'harvest', '#/garden' null. */
export function routeDetail(hash: string): string | null {
  const detail = hash.replace(/^#\/?/, '').split(/[?#]/, 1)[0]?.split('/')[1]?.toLowerCase();
  return detail === undefined || detail === '' ? null : detail;
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

// ---- Item 20: recipes ----

/**
 * A recipe's page; `myServes` is the planned portion when a plan day links to it (item 22), and
 * `plan` the date and slot of that planned meal, so the food log can log it as that plan row
 * (cross-item ruling 22).
 */
export function recipeHref(
  id: RefId,
  options: {
    readonly myServes?: number;
    readonly plan?: { readonly date: LocalDate; readonly slot: MealSlot };
  } = {},
): string {
  const href = `${routeHref('recipe')}/${encodeURIComponent(id)}`;
  const query = [
    ...(options.myServes === undefined ? [] : [`my=${options.myServes}`]),
    ...(options.plan === undefined
      ? []
      : [`date=${options.plan.date}`, `slot=${options.plan.slot}`]),
  ];
  return query.length === 0 ? href : `${href}?${query.join('&')}`;
}

/** The silverbeet week's first dinner: the recipe deep link the first-run guard tests cover. */
export const RECIPE_DEEP_LINK = recipeHref('seed:recipe-chicken-silverbeet-traybake');

/**
 * Every in-app address that is not the plain link of a route, so the first-run guard's tests
 * (item 13's K1 and P1; HS-20, C53) cover them too.
 */
export const DEEP_LINKS: readonly string[] = [
  ...FASTING_SUBLINKS.map(fastingHref),
  GARDEN_HARVEST_HREF,
  RECIPE_DEEP_LINK,
  // Item 27: a session, and its finish step.
  '#/move-session/a',
  '#/move-session/a/finish',
  // Item 22: today's plan (the "Swap recipe" quick action) and a dated day.
  '#/plan/today',
  '#/plan/2000-01-03',
];

/**
 * The recipe a hash names, a seed id or an owner copy's id (both lower case), and the planned
 * portion `?my=` when it is a number above 0 and at most MAX_MY_SERVES; null for anything else.
 */
export function recipeRouteOf(hash: string): {
  readonly id: RefId;
  readonly myServes: number | null;
  /** The planned meal the page was opened from (item 22), when the link names one. */
  readonly plan: { readonly date: LocalDate; readonly slot: MealSlot } | null;
} | null {
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
  const query = new URLSearchParams(hash.split('?')[1] ?? '');
  const my = query.get('my');
  const myServes = my === null || my.trim() === '' ? Number.NaN : Number(my);
  const date = query.get('date');
  const slot = MEAL_SLOTS.find((s) => s === query.get('slot'));
  return {
    id,
    myServes:
      Number.isFinite(myServes) && myServes > 0 && myServes <= MAX_MY_SERVES ? myServes : null,
    plan: isLocalDate(date) && slot !== undefined ? { date, slot } : null,
  };
}

// ---- Item 22: the planner ----

/** One planned day, by its LocalDate or 'today' (the "Swap recipe" quick action's address). */
export function planDayHref(date: string): string {
  return `${routeHref('plan')}/${date}`;
}

/** The date a plan hash names: 'today' gives today, a valid date that date; anything else null. */
export function planDayRouteOf(
  hash: string,
  today: LocalDate,
): { readonly date: LocalDate } | null {
  if (parseRoute(hash) !== 'plan') return null;
  const detail = routeDetail(hash);
  if (detail === 'today') return { date: today };
  return detail !== null && isLocalDate(detail) ? { date: detail } : null;
}
