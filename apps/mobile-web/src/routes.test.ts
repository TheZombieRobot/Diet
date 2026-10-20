import { foods } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import {
  DEEP_LINKS,
  DEFAULT_ROUTE,
  fastingHref,
  fastingSublink,
  isTabRoute,
  isUnderSettings,
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
  it('has the five tabs of UX_SCREENS.md in order, plus Settings, About, the setup screens, Weight, Fasting, Diet and targets, Foods and Laptop pairing', () => {
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
      'pairing',
      'recipes',
      'recipe',
    ]);
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
    expect(PARENT_TAB).toEqual({ recipes: 'food', recipe: 'food' });
    expect(DEEP_LINKS).toEqual([
      '#/fasting/reflux',
      '#/fasting/pattern',
      '#/recipe/seed%3Arecipe-chicken-silverbeet-traybake',
    ]);
    for (const link of DEEP_LINKS) expect(ROUTES.map(routeHref)).not.toContain(link);
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
