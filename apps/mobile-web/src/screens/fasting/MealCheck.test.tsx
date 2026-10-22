// The meal-check region as it renders (item 15 design 3.7; FL-12, FL-13, C10, C64, HS-18): the
// view's kinds with the figures items 21 to 23 will feed, over a real fake database.
import { fasting } from '@diet/core/copy/health';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commerceRules, healthPhraseRules } from '../../../../../tools/scans/rules';
import { scanText } from '../../../../../tools/scans/scan';
import { openTestDb, type TestDb } from '../../db/testKit';
import { MealCheck } from './MealCheck';
import type { MealCheckView } from './view';

const D = '2000-01-04';
const copy = fasting.mealCheck;
let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  test?.db.shutDown();
  test = undefined;
});

/** A short single dinner of 95 g against 140 g, the snack still able to be added (FL-12). */
const offer = (more: Partial<MealCheckView> = {}): MealCheckView => ({
  region: 'upcoming',
  date: D,
  day: 'today',
  kind: 'offer',
  reasons: ['protein'],
  headline: { proteinG: 95, atLeast: false, unknown: false, dinnerOnly: true },
  energyChecked: true,
  snack: { added: null, fits: { start: '17:00', end: '19:00' } },
  afterCeiling: false,
  undoSnackAllowed: false,
  stopSignPause: false,
  refluxDay: false,
  tomorrowSnack: null,
  ...more,
});

async function show(check: MealCheckView, changeShownBelow = false): Promise<TestDb> {
  test = await openTestDb();
  render(
    <MealCheck
      storage={test.storage}
      check={check}
      proteinTargetG={140}
      changeShownBelow={changeShownBelow}
    />,
  );
  return test;
}
const region = () => screen.getByTestId(/^meal-check/);

describe('the meal check on the Fast card', () => {
  it('FL-12: the headline, the need, the offer and both buttons; Add writes 5 to 7 pm, Not now dismisses that date', async () => {
    const t = await show(offer());
    const text = region().textContent;
    expect(text).toBe(
      "Tonight's dinner carries 95 g protein.One meal needs about 140 g.Add the 5 pm snack? It's fine to widen the window.Add 5 pm snackNot now",
    );
    expect(text).not.toMatch(/broken\s+fast/i);
    expect(scanText('meal check', text, [...healthPhraseRules, ...commerceRules])).toEqual([]);
    expect(screen.getByRole('button', { name: copy.addSnack }).className).toContain(
      'ui-button--on-amber',
    );
    const write = vi.spyOn(t.repos.planDays, 'setWindows');
    const dismiss = vi.spyOn(t.repos.cardState, 'dismiss');
    fireEvent.click(screen.getByRole('button', { name: copy.notNow }));
    await waitFor(() => {
      expect(dismiss).toHaveBeenCalledWith('single-meal-snack', `date:${D}`);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: copy.addSnack }).hasAttribute('disabled')).toBe(
        false,
      );
    });
    fireEvent.click(screen.getByRole('button', { name: copy.addSnack }));
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith([{ date: D, window: { start: '17:00', end: '19:00' } }]);
    });
  });

  it('FL-13: a dinner at the target shows its figure and no offer', async () => {
    await show(
      offer({
        kind: 'ok',
        reasons: [],
        headline: { proteinG: 140, atLeast: false, unknown: false, dinnerOnly: true },
      }),
    );
    expect(region().textContent).toBe("Tonight's dinner carries 140 g protein.");
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('C64, C10: an unknown protein and a missing energy target still offer the snack, and say so', async () => {
    await show(
      offer({
        reasons: ['protein', 'energy-unknown'],
        headline: { proteinG: 0, atLeast: true, unknown: true, dinnerOnly: true },
        energyChecked: false,
      }),
    );
    expect(screen.getByText("Tonight's dinner: protein unknown.")).toBeTruthy();
    expect(screen.getByText(copy.energyUnavailable)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.addSnack })).toBeTruthy();
  });

  it('HS-18: every offer, collapsed offer and after-window line says it is fine to eat or widen', async () => {
    const views: MealCheckView[] = [
      offer({ snack: { added: null, fits: null } }),
      offer({ kind: 'offer-collapsed' }),
      offer({ region: 'closed', kind: 'after', headline: null, refluxDay: false }),
      offer({ region: 'closed', kind: 'after', headline: null, refluxDay: true }),
    ];
    for (const view of views) {
      await show(view);
      expect(region().textContent, view.kind).toMatch(/fine to/);
      expect(region().textContent, view.kind).not.toMatch(/broken\s+fast|streak/i);
      cleanup();
      test?.db.shutDown();
    }
    // With no snack to add, the widen line and its detail stay.
    await show(offer({ snack: { added: null, fits: null } }));
    expect(screen.getByText(copy.widen)).toBeTruthy();
    expect(screen.getByText(copy.widenDetail)).toBeTruthy();
  });

  it('the one-meal line offers the 5 pm snack only with its button (review)', async () => {
    const unavailable = offer({ kind: 'one-meal-unavailable', reasons: [], headline: null });
    await show(unavailable);
    expect(region().textContent).toBe(copy.unavailableOneMeal + copy.addSnack);
    cleanup();
    test?.db.shutDown();
    await show({ ...unavailable, snack: { added: null, fits: null } });
    expect(region().textContent).toBe(copy.unavailableOneMealNoSnack);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a snack added for a window past 24 hours of the fast has no time; Today names a change once (review)', async () => {
    const added = offer({
      kind: 'snack-added',
      reasons: [],
      headline: null,
      snack: { added: { start: '17:00', end: '19:00' }, fits: null },
    });
    await show({ ...added, afterCeiling: true });
    expect(region().textContent).toBe(copy.snackAddedNoRange.today + ' ');
    cleanup();
    test?.db.shutDown();
    await show(added, true);
    expect(region().textContent).toBe('');
  });
});
