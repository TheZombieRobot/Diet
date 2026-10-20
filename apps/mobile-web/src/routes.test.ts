import { describe, expect, it } from 'vitest';
import {
  DEEP_LINKS,
  DEFAULT_ROUTE,
  fastingHref,
  fastingSublink,
  GARDEN_HARVEST_HREF,
  isTabRoute,
  isUnderSettings,
  PARENT_TAB,
  parseRoute,
  routeDetail,
  ROUTE_TITLES,
  routeHref,
  ROUTES,
  TAB_ROUTES,
} from './routes';

describe('hash routes', () => {
  it('has the five tabs of UX_SCREENS.md in order, plus Settings, About, the setup screens, Weight, Fasting, Diet and targets, and Garden and pantry', () => {
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
      'garden',
    ]);
    expect(ROUTE_TITLES.garden).toBe('Garden and pantry');
    expect(ROUTE_TITLES.weight).toBe('Weight');
    expect(ROUTE_TITLES.fasting).toBe('Fasting and reflux');
    expect(ROUTE_TITLES.targets).toBe('Diet and targets');
  });

  it("the Fasting screen's sub-links open the Fasting screen and name their card (item 15)", () => {
    expect(parseRoute(fastingHref('reflux'))).toBe('fasting');
    expect(fastingSublink(fastingHref('pattern'))).toBe('pattern');
    expect(fastingSublink('#/fasting')).toBeNull();
    expect(fastingSublink('#/fasting/elsewhere')).toBeNull();
  });

  it('C7 G21: Garden and pantry sits under Food; #/garden/harvest opens it with the harvest detail', () => {
    expect(PARENT_TAB).toEqual({ garden: 'food' });
    expect(parseRoute(GARDEN_HARVEST_HREF)).toBe('garden');
    expect(routeDetail(GARDEN_HARVEST_HREF)).toBe('harvest');
    expect(routeDetail('#/Garden/HARVEST?x=1')).toBe('harvest');
    expect(routeDetail('#/garden')).toBeNull();
    // Every in-app address that is not a route's own link, for the first-run guard tests (HS-20).
    expect(DEEP_LINKS).toEqual(['#/fasting/reflux', '#/fasting/pattern', '#/garden/harvest']);
    for (const link of DEEP_LINKS) expect(ROUTES.map(routeHref)).not.toContain(link);
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
    ]);
  });
});
