import { foods } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE,
  fastingHref,
  fastingSublink,
  isTabRoute,
  isUnderSettings,
  parseRoute,
  ROUTE_TITLES,
  routeHref,
  ROUTES,
  TAB_ROUTES,
} from './routes';

describe('hash routes', () => {
  it('has the five tabs of UX_SCREENS.md in order, plus Settings, About, the setup screens, Weight, Fasting, Diet and targets, and Foods', () => {
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
    ]);
    expect(ROUTE_TITLES.weight).toBe('Weight');
    expect(ROUTE_TITLES.fasting).toBe('Fasting and reflux');
    expect(ROUTE_TITLES.targets).toBe('Diet and targets');
    // K7 (item 18): the Foods screen's title is the one its copy names.
    expect(ROUTE_TITLES.foods).toBe('Foods in the app');
    expect(foods.screen.title).toBe('Foods in the app');
    expect(parseRoute('#/foods')).toBe('foods');
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
    ]);
  });
});
