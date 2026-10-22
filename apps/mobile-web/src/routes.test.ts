import { foods } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import {
  DEEP_LINKS,
  DEFAULT_ROUTE,
  fastingHref,
  fastingSublink,
  GARDEN_HARVEST_HREF,
  isTabRoute,
  isUnderSettings,
  moveSessionLink,
  PARENT_TAB,
  parseRoute,
  recipeHref,
  recipeRouteOf,
  ROUTE_TITLES,
  routeDetail,
  routeHref,
  ROUTES,
  TAB_ROUTES,
} from './routes';

describe('hash routes', () => {
  it('has the five tabs of UX_SCREENS.md in order, plus Settings, About, the setup screens, Weight, Fasting, Diet and targets, Foods, Garden and pantry, the Move sub-screens, Laptop pairing and the recipe screens', () => {
    expect(TAB_ROUTES.map((r) => ROUTE_TITLES[r])).toEqual([
      'Today',
      'Food',
      'Move',
      'Drinks',
      'List',
    ]);
    expect(ROUTES).toEqual([
      ...TAB_ROUTES,
      'settings',
      'about',
      'readiness',
      'profile',
      'eating-schedule',
      'weight',
      'fasting',
      'targets',
      'foods',
      'garden',
      'move-session',
      'move-plan',
      'pairing',
      'recipes',
      'recipe',
    ]);
    expect(ROUTE_TITLES.garden).toBe('Garden and pantry');
    expect(ROUTE_TITLES.weight).toBe('Weight');
    expect(ROUTE_TITLES.fasting).toBe('Fasting and reflux');
    expect(ROUTE_TITLES.targets).toBe('Diet and targets');
    // K7 (item 18): the Foods screen's title is the one its copy names.
    expect(ROUTE_TITLES.foods).toBe('Foods in the app');
    expect(foods.screen.title).toBe('Foods in the app');
    expect(parseRoute('#/foods')).toBe('foods');
    expect(ROUTE_TITLES.pairing).toBe('Laptop pairing');
  });

  it('U19 (item 20): the recipe screens sit under Food; a recipe link carries its id and a planned portion', () => {
    expect([PARENT_TAB.recipes, PARENT_TAB.recipe]).toEqual(['food', 'food']);
    // The whole list is checked with item 19's garden below.
    expect(DEEP_LINKS).toContain('#/recipe/seed%3Arecipe-chicken-silverbeet-traybake');
    const seed = 'seed:recipe-chicken-silverbeet-traybake';
    expect(recipeRouteOf(recipeHref(seed))).toEqual({ id: seed, myServes: null });
    expect(recipeRouteOf(recipeHref(seed, { myServes: 1.5 }))?.myServes).toBe(1.5);
    for (const my of ['0', '11', 'abc', ''])
      expect(recipeRouteOf(`${recipeHref(seed)}?my=${my}`)?.myServes).toBeNull();
    const copy = '00000000-0000-4000-8000-000000000001';
    expect(recipeRouteOf(recipeHref(copy))?.id).toBe(copy);
    expect(recipeRouteOf('#/recipe/seed%3')).toBeNull();
    expect(recipeRouteOf('#/recipe/not an id')).toBeNull();
    expect(recipeRouteOf('#/recipe')).toBeNull();
    expect(routeDetail('#/recipe/Seed%3Arecipe-x?my=2')).toBe('seed%3arecipe-x');
  });

  it("the Fasting screen's sub-links open the Fasting screen and name their card (item 15)", () => {
    expect(parseRoute(fastingHref('reflux'))).toBe('fasting');
    expect(fastingSublink(fastingHref('pattern'))).toBe('pattern');
    expect(fastingSublink('#/fasting')).toBeNull();
    expect(fastingSublink('#/fasting/elsewhere')).toBeNull();
  });

  it('C7 G21: Garden and pantry sits under Food (with the recipe screens); #/garden/harvest opens it with the harvest detail', () => {
    expect(PARENT_TAB).toEqual({
      garden: 'food',
      recipes: 'food',
      recipe: 'food',
      'move-session': 'move',
      'move-plan': 'move',
    });
    expect(parseRoute(GARDEN_HARVEST_HREF)).toBe('garden');
    expect(routeDetail(GARDEN_HARVEST_HREF)).toBe('harvest');
    expect(routeDetail('#/Garden/HARVEST?x=1')).toBe('harvest');
    expect(routeDetail('#/garden')).toBeNull();
    // Every in-app address that is not a route's own link, for the first-run guard tests (HS-20).
    expect(DEEP_LINKS).toEqual([
      '#/fasting/reflux',
      '#/fasting/pattern',
      '#/garden/harvest',
      '#/recipe/seed%3Arecipe-chicken-silverbeet-traybake',
      '#/move-session/a',
      '#/move-session/a/finish',
    ]);
    for (const link of DEEP_LINKS) expect(ROUTES.map(routeHref)).not.toContain(link);
  });

  it.each([
    ['#/move-session', null, false],
    ['#/move-session/A', 'a', false],
    ['#/move-session/a/finish', 'a', true],
    ['#/move-session/a/finished', 'a', false],
    ['#/move-session/a?x=1', 'a', false],
    ['#/move', null, false],
  ] as const)('moveSessionLink(%j) is %s, finish %s (item 27)', (hash, slug, finish) => {
    expect(moveSessionLink(hash)).toEqual({ slug, finish });
  });

  it("item 27's sub-screens: the Move tab is their parent, and the session's deep links are listed (HS-20)", () => {
    expect([PARENT_TAB['move-session'], PARENT_TAB['move-plan']]).toEqual(['move', 'move']);
    expect(DEEP_LINKS.slice(-2).map(parseRoute)).toEqual(['move-session', 'move-session']);
    expect(routeDetail('#/move-session/beach-walk?x=1')).toBe('beach-walk');
    expect(routeDetail('#/move-session')).toBeNull();
  });

  it.each(ROUTES)('reads #/%s back from its own link', (route) => {
    expect(parseRoute(routeHref(route))).toBe(route);
  });

  it.each([
    ['', 'today'],
    ['#', 'today'],
    ['#/', 'today'],
    ['#/nowhere', 'today'],
    ['#food', 'food'],
    ['#/FOOD', 'food'],
    ['#/list/extra?x=1', 'list'],
    ['#/about?from=settings', 'about'],
  ] as const)('%j opens %s', (hash, route) => {
    expect(parseRoute(hash)).toBe(route);
  });

  it('opens Today by default, and only the five tabs count as tabs', () => {
    expect(DEFAULT_ROUTE).toBe('today');
    expect(ROUTES.filter(isTabRoute)).toEqual([...TAB_ROUTES]);
    expect(ROUTES.filter(isUnderSettings)).toEqual([
      'settings',
      'about',
      'readiness',
      'profile',
      'eating-schedule',
      'targets',
      'foods',
      'pairing',
    ]);
  });
});
