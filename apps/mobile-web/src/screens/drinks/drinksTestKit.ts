// The Drinks screen fixture (item 28 design 6.2): a finished setup through the repositories over
// fake-indexeddb, with the test clock (1:00 pm on Wednesday 1 March 2000 in Auckland). Imported
// only by tests; every value is synthetic.
import { type Instant, zonedWallTimeToInstant } from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { appStorageStore } from '../../db/runtime';
import { type OnboardOptions, onboardForTests, openTestDb, type TestDb } from '../../db/testKit';
import { DrinksScreen } from './DrinksScreen';

export const ZONE = 'Pacific/Auckland';

/** A wall-clock time in Auckland as an instant. */
export const nz = (date: string, hh: number, mm = 0): Instant =>
  new Date(zonedWallTimeToInstant(date, hh * 60 + mm, ZONE)).toISOString();

export interface DrinksFixture extends OnboardOptions {
  /** false: the alcohol notice is never acknowledged (nothing else is set up either). */
  readonly onboard?: boolean;
  /** Writes before the screen opens, at the test clock unless they move it. */
  readonly seed?: (test: TestDb) => Promise<unknown>;
  /** The clock when the screen opens (default: the test kit's 1:00 pm on 1 March 2000). */
  readonly now?: Instant;
}

export async function drinksFixture(fixture: DrinksFixture = {}): Promise<TestDb> {
  const test = await openTestDb();
  const start = test.env.now();
  if (fixture.onboard ?? true) await onboardForTests(test, fixture);
  if (fixture.seed !== undefined) await fixture.seed(test);
  test.env.set(fixture.now ?? start);
  appStorageStore.set(test.storage);
  return test;
}

/** Renders the Drinks screen alone, in a `main` as in the app shell, and waits for its first read. */
export async function renderDrinks(): Promise<HTMLElement> {
  render(createElement('main', null, createElement(DrinksScreen)));
  await screen.findByRole('region', { name: alcohol.help.cardLabel });
  await screen.findByText(
    (_, element) =>
      element?.matches('[data-testid="drinks-screen"]') === true &&
      !element.textContent.includes(alcohol.screen.opening),
  );
  return screen.getByTestId('drinks-screen');
}

export function resetDrinks(test: TestDb | undefined): void {
  cleanup();
  appStorageStore.set(null);
  window.location.hash = '';
  test?.db.shutDown();
}

/** Logs drinks through the repository, one per instant given. */
export async function logAt(
  test: TestDb,
  instants: readonly Instant[],
  beverage: { volumeMl: number; abvPercent: number } = { volumeMl: 330, abvPercent: 5 },
): Promise<void> {
  const now = test.env.now();
  for (const at of instants) {
    await test.repos.drinks.log({
      beverageId: null,
      name: 'Example lager',
      beverage: { ...beverage, label: null },
      count: 1,
      at,
    });
  }
  test.env.set(now);
}
