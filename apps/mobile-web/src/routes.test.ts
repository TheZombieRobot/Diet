import { describe, expect, it } from 'vitest';
import {
  DEEP_LINKS,
  DEFAULT_ROUTE,
  fastingHref,
  fastingSublink,
  isTabRoute,
  isUnderSettings,
  moveSessionLink,
  PARENT_TAB,
  parseRoute,
  routeDetail,
  ROUTE_TITLES,
  routeHref,
  ROUTES,
  TAB_ROUTES,
} from './routes';

describe('hash routes', () => {
  it('has the five tabs of UX_SCREENS.md in order, plus Settings, About, the setup screens, Weight, Fasting and Diet and targets', () => {
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
      'move-session',
      'move-plan',
    ]);
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
    expect(PARENT_TAB).toEqual({ 'move-session': 'move', 'move-plan': 'move' });
    expect(DEEP_LINKS).toEqual(['#/move-session/a', '#/move-session/a/finish']);
    expect(DEEP_LINKS.map(parseRoute)).toEqual(['move-session', 'move-session']);
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
    ]);
  });
});
