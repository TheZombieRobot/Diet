// Logging a weigh-in (item 14 design sections 2.6.1 and 6.4, W6): never a stale one-tap save.
// jsdom over the real repositories on fake-indexeddb; device zone Pacific/Auckland.
import { weight } from '@diet/core/copy/health';
import {
  onDay,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { openSnapshotDb, type TestDb } from '../../db/testKit';
import { WeightScreen } from './WeightScreen';
import { appStorageStore } from '../../db/runtime';
import { weightStatusStore } from './stores';

let test: TestDb | undefined;

afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  weightStatusStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

/** The Weight screen (Log weight always open) for K10-like weigh-ins, the latest 96.8 kg on day 9 or earlier. */
async function open(options: WeightScenarioOptions, day: number): Promise<TestDb> {
  const seen = onDay(options, day);
  test = await openSnapshotDb(weightScenario(seen), seen.now);
  appStorageStore.set(test.storage);
  render(<WeightScreen />);
  await screen.findByRole('region', { name: weight.card.logWeight });
  return test;
}

const field = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: weight.entry.fieldLabel });
const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
const type = (value: string) => {
  fireEvent.change(field(), { target: { value } });
};
/** K10 seen on day 10 before that day's weigh-in: the last is 97.1 kg on 9 February. */
const upToDay9 = { ...WEIGHT_SCENARIOS.K10, days: (d: number) => d <= 9 };

describe('Log weight (W6)', () => {
  it('starts empty with the last weigh-in as its hint; Save is off; ± step 0.1 kg from the last weigh-in', async () => {
    await open(upToDay9, 10);
    expect(field().value).toBe('');
    expect(screen.getByText('Last weigh-in: 97.1 kg, 9 February 2000.')).toBeTruthy();
    expect(button(weight.entry.save).disabled).toBe(true);
    fireEvent.click(button(weight.entry.more));
    expect(field().value).toBe('97.2');
    fireEvent.click(button(weight.entry.less));
    fireEvent.click(button(weight.entry.less));
    expect(field().value).toBe('97.0');
  });

  it('"Same as last time" fills the field but writes nothing until Save', async () => {
    const db = await open(upToDay9, 10);
    const before = (await db.repos.weights.list()).length;
    fireEvent.click(button(weight.entry.sameAsLast));
    expect(field().value).toBe('97.1');
    expect(await db.repos.weights.list()).toHaveLength(before);
    fireEvent.click(button(weight.entry.save));
    await waitFor(async () => {
      expect(await db.repos.weights.list()).toHaveLength(before + 1);
    });
    const saved = (await db.repos.weights.list()).find(
      (w) => w.source === 'manual' && w.kg === 97.1 && w.at === db.env.now(),
    );
    expect(saved).toMatchObject({ source: 'manual', note: null, timeZone: 'Pacific/Auckland' });
    // The save finishes once item 13's gate effects have run after the weigh-in (HS-35).
    await waitFor(() => {
      expect(field().value).toBe('');
    });
  });

  it('with no weigh-in at all, − and + are off while the field is blank', async () => {
    await open({ ...WEIGHT_SCENARIOS.PENDING, days: () => false }, 1);
    expect(button(weight.entry.less).disabled).toBe(true);
    expect(button(weight.entry.more).disabled).toBe(true);
  });

  it('refuses a weight that is not a number or out of range, and a time still to come, writing nothing', async () => {
    const db = await open(upToDay9, 10);
    const before = (await db.repos.weights.list()).length;
    type('abc');
    fireEvent.click(button(weight.entry.save));
    expect(await screen.findByText(weight.entry.notANumber)).toBeTruthy();
    type('401');
    fireEvent.click(button(weight.entry.save));
    expect(await screen.findByText(weight.entry.outOfRange)).toBeTruthy();
    type('96.5');
    fireEvent.click(button(weight.entry.changeWhen));
    fireEvent.change(screen.getByLabelText(weight.entry.timeLabel), { target: { value: '23:00' } });
    fireEvent.click(button(weight.entry.save));
    expect(await screen.findByText(weight.entry.future)).toBeTruthy();
    expect(await db.repos.weights.list()).toHaveLength(before);
  });

  it('a value more than 3 kg from a weigh-in in the last week asks first, and saves only on "Save anyway"', async () => {
    const db = await open(upToDay9, 10);
    const before = (await db.repos.weights.list()).length;
    type('93.6');
    fireEvent.click(button(weight.entry.save));
    expect(
      await screen.findByText('That is 3.5 kg from your last weigh-in. Is the number right?'),
    ).toBeTruthy();
    expect(await db.repos.weights.list()).toHaveLength(before);
    fireEvent.click(button(weight.entry.saveAnyway));
    await waitFor(async () => {
      expect(await db.repos.weights.list()).toHaveLength(before + 1);
    });
  });

  it('a backdated weigh-in is read in the device zone: 9 February 2000 at 07:00 in Auckland', async () => {
    const db = await open({ ...upToDay9, days: (d: number) => d <= 8 }, 10);
    type('97.0');
    fireEvent.click(button(weight.entry.changeWhen));
    fireEvent.change(screen.getByLabelText(weight.entry.dateLabel), {
      target: { value: '2000-02-09' },
    });
    fireEvent.change(screen.getByLabelText(weight.entry.timeLabel), { target: { value: '07:00' } });
    fireEvent.click(button(weight.entry.save));
    await waitFor(async () => {
      const rows = await db.repos.weights.list();
      expect(rows.some((w) => w.at === '2000-02-08T18:00:00.000Z' && w.kg === 97)).toBe(true);
    });
    expect(await screen.findByText('Saved 97.0 kg at 7:00 am.')).toBeTruthy();
  });
});
