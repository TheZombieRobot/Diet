// Item 28 on Today and in Settings (design 6.2 K2): the Drinks card's tiles, the Talk to someone
// card's record-based trigger and its one-day dismissal, the drinking-day cut-over and the
// guidance setting. Item 16's DrinksCard and TodayScreen tests already cover the guidance line for
// every sex and setting, the under-18 card and question 7 (K2a, K2c and K2f).
import type { Instant, StoredBeverage } from '@diet/core';
import { alcohol, today } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestDb } from '../../db/testKit';
import { DrinksSettingsCard } from '../drinks/DrinksSettingsCard';
import { nz } from '../drinks/drinksTestKit';
import { TodayScreen } from './TodayScreen';
import { clockTo, renderToday, resetToday, todayFixture } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetToday(test);
  test = undefined;
});

/** Today's Drinks card (the Settings card shares its label, so it is found inside Today). */
const drinksCard = () =>
  within(screen.queryByTestId('today') ?? document.body).getByRole('region', {
    name: today.cards.drinks,
  });
const talk = () => screen.queryByRole('region', { name: alcohol.helpCardLabel });
/** The seeded can: 330 mL at 5% with 94 kcal on the label. */
const CAN: StoredBeverage = {
  volumeMl: 330,
  abvPercent: 5,
  label: {
    volumeMl: 330,
    abvPercent: 5,
    standardDrinks: null,
    kcal: 94,
    energyAsEntered: { value: 94, unit: 'kcal' },
    origin: 'preset-default',
  },
};
const can = (t: TestDb, at: Instant) =>
  t.repos.drinks.log({ beverageId: null, name: 'Zero-sugar premix', beverage: CAN, count: 1, at });

describe('the Today Drinks card (K2b; C21, C105, A3, A4)', () => {
  it('"None logged", then this week\'s four cans in drinks, standard drinks and kcal, with the alcohol-free days', async () => {
    test = await todayFixture();
    await renderToday();
    await waitFor(() => {
      expect(drinksCard().textContent).toContain(alcohol.summary.noneLogged);
    });
    // Wednesday 15 March: two on Monday 13, one on Tuesday 14 and one today.
    await act(async () => {
      for (const at of [
        nz('2000-03-13', 19),
        nz('2000-03-13', 20),
        nz('2000-03-14', 19),
        nz('2000-03-15', 12),
      ]) {
        await can(test as TestDb, at);
      }
    });
    await waitFor(() => {
      expect(drinksCard().textContent).toContain('4 drinks · 5.21 std');
    });
    expect(drinksCard().textContent).toContain('376 kcal · 0 alcohol-free days');
    expect(drinksCard().textContent).not.toMatch(/kJ|cans|\bleft\b|streak/);
  });
});

describe('Talk to someone from the records (K2d; HS-06, AL-06, C44)', () => {
  it('six drinking days in a run: no card; the seventh brings it; Not now hides it until the next 5:00 am', async () => {
    test = await todayFixture({
      seed: async (t) => {
        for (const day of ['09', '10', '11', '12', '13', '14'])
          await can(t, nz(`2000-03-${day}`, 12));
      },
    });
    await renderToday();
    await waitFor(() => {
      expect(drinksCard().textContent).toContain('2 drinks');
    });
    expect(talk()).toBeNull();
    await act(async () => {
      await can(test as TestDb, nz('2000-03-15', 12));
    });
    const card = await screen.findByRole('region', { name: alcohol.helpCardLabel });
    expect(card.textContent).toContain(alcohol.helpCardReturnsNextDay);
    expect(card.textContent).not.toMatch(/seven|consecutive|in a row/i);
    fireEvent.click(within(card).getByRole('button', { name: alcohol.helpCardNotNow }));
    await waitFor(() => {
      expect(talk()).toBeNull();
    });
    await clockTo(test, nz('2000-03-16', 4, 59));
    expect(talk()).toBeNull();
    await clockTo(test, nz('2000-03-16', 5));
    expect(await screen.findByRole('region', { name: alcohol.helpCardLabel })).toBeDefined();
  });
});

describe('the Settings Drinks card (K2e, K2g; C21, C46, A25, NN-09)', () => {
  async function renderBoth(): Promise<HTMLElement> {
    render(
      createElement(
        'main',
        null,
        createElement('div', { 'data-testid': 'settings' }, createElement(DrinksSettingsCard)),
        createElement('div', { 'data-testid': 'today' }, createElement(TodayScreen)),
      ),
    );
    await screen.findByRole('region', { name: today.cards.movement }, { timeout: 5000 });
    return within(screen.getByTestId('settings')).findByRole('region', {
      name: alcohol.settings.cardLabel,
    });
  }

  it("C21: choosing midnight writes 0, and a drink at 1:30 am moves from yesterday into today's tile", async () => {
    test = await todayFixture({ seed: (t) => can(t, nz('2000-03-15', 1, 30)) });
    const settings = await renderBoth();
    await waitFor(() => {
      expect(drinksCard().textContent).toContain(alcohol.summary.noneLogged);
    });
    const select = within(settings).getByLabelText(alcohol.settings.cutoverLabel);
    expect([...select.querySelectorAll('option')].map((o) => o.textContent).slice(0, 3)).toEqual([
      alcohol.settings.midnight,
      '12:30 am',
      '1:00 am',
    ]);
    fireEvent.change(select, { target: { value: '0' } });
    await waitFor(async () => {
      expect((await test?.repos.settings.get())?.drinkingDayCutoverMinutes).toBe(0);
    });
    await waitFor(() => {
      expect(drinksCard().textContent).toContain('1 drink · 1.30 std');
    });
  });

  it('A25: a male profile chooses between the two sets by name only; every figure comes with the risk-free sentence', async () => {
    test = await todayFixture({ profile: { sex: 'male' } });
    const settings = await renderBoth();
    const options = within(settings).getAllByRole('radio');
    expect(options.map((o) => o.closest('label')?.textContent)).toEqual([
      alcohol.settings.guidanceMen,
      alcohol.settings.guidanceWomen,
    ]);
    for (const option of options) expect(option.closest('label')?.textContent).not.toMatch(/\d/);
    const figures = () =>
      [...settings.querySelectorAll('*')].filter(
        (e) => e.children.length === 0 && /standard drinks/.test(e.textContent),
      );
    expect(figures().map((e) => e.textContent)).toEqual([alcohol.guidance.line['nz-men']]);
    fireEvent.click(within(settings).getByRole('radio', { name: alcohol.settings.guidanceWomen }));
    await waitFor(async () => {
      expect((await test?.repos.settings.get())?.alcoholGuidanceSet).toBe('nz-women');
    });
    await waitFor(() => {
      expect(figures().map((e) => e.textContent)).toEqual([alcohol.guidance.line['nz-women']]);
    });
    for (const e of figures()) expect(e.textContent).toContain(alcohol.noRiskFreeLevel);
  });
});
