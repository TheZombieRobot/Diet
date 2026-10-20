// The "+" quick actions inside the app (item 16 design section 5.2 C9; TD-02, T11, T17): the
// whole app over the real repositories on fake-indexeddb, after a finished setup.
import { readiness, today, weight } from '@diet/core/copy/health';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  await screen.findByText(copy.laterNote);
  return document.getElementById(plus.getAttribute('aria-controls') ?? '') as HTMLElement;
}

describe('the quick actions (C9)', () => {
  it('seven rows in the UX order; the six not built are focusable, marked Later and described by the note', async () => {
    const panel = await openPanel();
    const rows = within(panel).getAllByRole('listitem');
    expect(rows.map((li) => li.querySelector('.ui-action-row__title')?.textContent)).toEqual(
      Object.values(copy.labels),
    );
    const later = within(panel)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-disabled') === 'true');
    expect(later).toHaveLength(6);
    const note = screen.getByText(copy.laterNote);
    for (const row of later) {
      expect(row.hasAttribute('disabled')).toBe(false);
      expect(row.tabIndex).toBe(0);
      expect(within(row).getByText(copy.markerLater)).toBeDefined();
      expect(row.getAttribute('aria-describedby')).toBe(note.id);
    }
  });

  it('a Later row does nothing: no hash change and no record written, by click or Enter', async () => {
    const panel = await openPanel();
    const before = await counts((test as TestDb).db);
    const hash = window.location.hash;
    for (const row of within(panel)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-disabled') === 'true')) {
      row.focus();
      fireEvent.keyDown(row, { key: 'Enter' });
      fireEvent.click(row);
    }
    expect(window.location.hash).toBe(hash);
    expect(await counts((test as TestDb).db)).toEqual(before);
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
