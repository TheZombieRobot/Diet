// The Water card (item 16 design section 5.2 C4; TD-03, T7, T8, T26): real repositories on
// fake-indexeddb; the fixture has 250 mL at 8:00 and 10:00 am and an electrolyte tick at 8:05 am.
import { privacy, today } from '@diet/core/copy/health';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageClosedError, StorageFullError } from '../../db/errors';
import type { TestDb } from '../../db/testKit';
import { clockTo, renderToday, resetToday, todayFixture } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  resetToday(test);
  test = undefined;
});

const card = () => screen.getByRole('region', { name: today.cards.water });
const total = () => screen.getByTestId('water-total').textContent;
const status = () => within(card()).getByRole('status').textContent;
const rows = async () => (test === undefined ? [] : await test.repos.water.list());

describe('the Water card (C4; TD-03)', () => {
  it('Add 250 mL stores a glass; the line waits for the stored row and says the same total; Undo removes only it', async () => {
    test = await todayFixture();
    await renderToday();
    expect(total()).toBe('500 mL');
    expect(status()).toBe('');
    // Every text the line ever shows: never a total that is not yet stored (T26).
    const shown: string[] = [];
    const observer = new MutationObserver(() => {
      shown.push(status());
    });
    observer.observe(within(card()).getByRole('status'), {
      childList: true,
      characterData: true,
      subtree: true,
    });
    fireEvent.click(within(card()).getByRole('button', { name: today.water.add }));
    await waitFor(() => {
      expect(status()).toBe('Added 250 mL. Today: 750 mL.');
    });
    observer.disconnect();
    expect(shown.filter((text) => text !== '' && text !== 'Added 250 mL. Today: 750 mL.')).toEqual(
      [],
    );
    expect(total()).toBe('750 mL');
    const added = (await rows()).find((r) => r.at === test?.env.now() && r.ml === 250);
    expect(added).toMatchObject({ ml: 250, electrolyte: false, timeZone: 'Pacific/Auckland' });

    fireEvent.click(within(card()).getByRole('button', { name: today.water.undo }));
    await waitFor(() => {
      expect(status()).toBe('Removed. Today: 500 mL.');
    });
    expect(total()).toBe('500 mL');
    expect((await rows()).map((r) => r.id)).not.toContain(added?.id);
    expect(await rows()).toHaveLength(3);
    expect(document.activeElement?.textContent).toBe(today.water.add);
    expect(within(card()).queryByRole('button', { name: today.water.undo })).toBeNull();
  });

  it("the electrolyte switch: off removes today's tick-only row and keeps the water; on adds a 0 mL tick; another day is never touched", async () => {
    test = await todayFixture({
      seed: (t) =>
        t.repos.water.create({
          ml: 0,
          electrolyte: true,
          at: '2000-03-13T20:00:00.000Z',
          timeZone: 'Pacific/Auckland',
        }),
    });
    await renderToday();
    const toggle = () => within(card()).getByRole('switch', { name: today.water.electrolytes });
    expect(toggle()).toHaveProperty('checked', true);
    fireEvent.click(toggle());
    // It shows what was asked for at once, and is disabled until the writes are done.
    expect(toggle()).toHaveProperty('checked', false);
    expect(toggle()).toHaveProperty('disabled', true);
    await waitFor(() => {
      expect(toggle()).toHaveProperty('disabled', false);
    });
    expect(toggle()).toHaveProperty('checked', false);
    expect((await rows()).map((r) => [r.ml, r.electrolyte])).toEqual(
      expect.arrayContaining([
        [250, false],
        [250, false],
        [0, true],
      ]),
    );
    expect(await rows()).toHaveLength(3);
    expect(total()).toBe('500 mL');
    fireEvent.click(toggle());
    await waitFor(() => {
      expect(toggle()).toHaveProperty('disabled', false);
    });
    expect(toggle()).toHaveProperty('checked', true);
    expect((await rows()).filter((r) => r.ml === 0 && r.electrolyte)).toHaveLength(2);
  });

  it('a failed electrolyte write puts the switch back and says so', async () => {
    test = await todayFixture();
    await renderToday();
    vi.spyOn(test.repos.water, 'remove').mockRejectedValue(new Error('synthetic failure'));
    const toggle = () => within(card()).getByRole('switch', { name: today.water.electrolytes });
    fireEvent.click(toggle());
    expect((await within(card()).findByRole('alert')).textContent).toBe(today.saveFailed);
    expect(toggle()).toHaveProperty('checked', true);
  });

  it('at local midnight the card reads the new day', async () => {
    test = await todayFixture();
    await renderToday();
    await clockTo(test, '2000-03-15T11:00:00.000Z'); // 00:00 on 16 March in Auckland
    await waitFor(() => {
      expect(total()).toBe(today.water.none);
    });
    expect(within(card()).getByRole('switch')).toHaveProperty('checked', false);
  });

  it.each([
    ['the records are closed in this tab', new StorageClosedError(), today.saveFailed],
    ['the phone is out of space', new StorageFullError(), privacy.storageFull],
  ])('a failed write (%s) says so and changes nothing (T26)', async (_, error, message) => {
    test = await todayFixture();
    await renderToday();
    vi.spyOn(test.repos.water, 'create').mockRejectedValue(error);
    fireEvent.click(within(card()).getByRole('button', { name: today.water.add }));
    expect((await within(card()).findByRole('alert')).textContent).toBe(message);
    expect(total()).toBe('500 mL');
    expect(status()).toBe('');
  });

  it('shows no water target (T7)', async () => {
    test = await todayFixture();
    await renderToday();
    expect(card().textContent).not.toMatch(/\bof\b|target|goal|2\.5/i);
  });
});
