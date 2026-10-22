// The "+" quick actions inside the app (item 16 design section 5.2 C9; TD-02, T11, T17): the
// whole app over the real repositories on fake-indexeddb, after a finished setup.
import { gardenScreen, readiness, today, weight } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { counts, onboardForTests, openTestDb, type TestDb } from '../../db/testKit';
import { openApp } from '../../onboarding/flowTestKit';
import { storageStore } from '../../pwa/storage';
import { resetToday } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetToday(test);
  test = undefined;
});

const copy = today.quickActions;

async function openPanel(answers: { q1?: 'yes' } = {}): Promise<HTMLElement> {
  test = await openTestDb();
  await onboardForTests(test, { answers });
  storageStore.set('protected');
  appStorageStore.set(test.storage);
  await openApp('#/today');
  // Two reads in a row (Today's setup guard, then the Weight card's): room under a loaded run.
  await screen.findByRole('region', { name: today.cards.movement }, { timeout: 5000 });
  await screen.findByRole('button', { name: weight.card.logWeight }, { timeout: 5000 });
  const plus = screen.getByRole('button', { name: copy.title });
  fireEvent.click(plus);
  await screen.findByRole('link', { name: copy.labels['open-grocery-list'] });
  return document.getElementById(plus.getAttribute('aria-controls') ?? '') as HTMLElement;
}

describe('the quick actions (C9)', () => {
  it('seven rows in the UX order, every one built (items 23 and 24 built the last two), so no Later row or note; Complete workout is a link', async () => {
    const panel = await openPanel();
    const rows = within(panel).getAllByRole('listitem');
    expect(rows.map((li) => li.querySelector('.ui-action-row__title')?.textContent)).toEqual(
      Object.values(copy.labels),
    );
    const later = within(panel)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-disabled') === 'true');
    expect(later).toEqual([]);
    expect(screen.queryByText(copy.laterNote)).toBeNull();
    // Item 27: the session screen's resolver (RD-05 turns it Off; MovementCard.test.tsx).
    expect(
      within(panel)
        .getByRole('link', { name: copy.labels['complete-workout'] })
        .getAttribute('href'),
    ).toBe('#/move-session');
    expect(within(panel).queryByText(copy.markerLater)).toBeNull();
  });

  it("Log weight closes the panel and opens the Weight card's entry with focus in its field", async () => {
    const panel = await openPanel();
    fireEvent.click(within(panel).getByRole('button', { name: copy.labels['log-weight'] }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText(weight.entry.fieldLabel));
    });
    expect(screen.getByRole('button', { name: copy.title }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(window.location.hash).toBe('#/today');
  });

  it('C6: Add harvest is a link that closes the panel and opens the garden screen with the harvest panel (item 19)', async () => {
    const panel = await openPanel();
    const harvest = within(panel).getByRole('link', { name: copy.labels['add-harvest'] });
    expect(harvest.getAttribute('href')).toBe('#/garden/harvest');
    await act(async () => {
      window.location.hash = '#/garden/harvest';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    await screen.findByRole('form', { name: gardenScreen.harvest.title });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Garden and pantry');
    expect(screen.queryByRole('button', { name: copy.title })).toBeNull();
  });

  it('item 28 (A32): Add drink opens the Drinks screen and logs nothing by itself', async () => {
    const panel = await openPanel();
    const drink = within(panel).getByRole('link', { name: copy.labels['add-drink'] });
    expect(drink.getAttribute('href')).toBe('#/drinks');
    expect(drink.getAttribute('aria-disabled')).toBeNull();
    const before = await counts((test as TestDb).db);
    fireEvent.click(drink);
    expect(await counts((test as TestDb).db)).toEqual(before);
  });

  it('T11: under 18, Add drink is shown Off with the alcohol-logging reason, not the Later note', async () => {
    const panel = await openPanel({ q1: 'yes' });
    const drink = within(panel).getByRole('button', { name: copy.labels['add-drink'] });
    expect(drink.getAttribute('aria-disabled')).toBe('true');
    expect(within(drink).getByText(copy.markerOff)).toBeDefined();
    const reason = document.getElementById(drink.getAttribute('aria-describedby') ?? '');
    await waitFor(() => {
      expect(reason?.textContent).toContain(readiness.featureNames.alcoholLogging);
    });
    expect(reason?.textContent).not.toContain(copy.laterNote);
  });
});
