// Today's Weight card and the weight cards under it (item 14 design section 6.4): WT-03, WT-04,
// WT-05, WT-13; HS-21; NN-03. jsdom over the real repositories on fake-indexeddb, seeded with the
// synthetic weight scenarios.
import { privacy, readiness, weight } from '@diet/core/copy/health';
import {
  onDay,
  scenarioInstant,
  SCENARIO_DAY1,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { commerceRules, healthPhraseRules } from '../../../../../tools/scans/rules';
import { scanText } from '../../../../../tools/scans/scan';
import { openSnapshotDb, type TestDb } from '../../db/testKit';
import { weightStatusStore } from './stores';
import { WeightCard } from './WeightCard';

let test: TestDb | undefined;

afterEach(() => {
  cleanup();
  weightStatusStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

/** Today's weight block for a scenario seen on its day `day` at 09:00 local. */
async function today(options: WeightScenarioOptions, day: number): Promise<TestDb> {
  const seen = onDay(options, day);
  test = await openSnapshotDb(weightScenario(seen), seen.now);
  render(<WeightCard storage={test.storage} />);
  await screen.findByRole('region', { name: weight.card.label });
  return test;
}

const weightCard = () => screen.getByRole('region', { name: weight.card.label });
const stat = (name: string) => within(weightCard()).getByRole('group', { name });

/** Every health and commerce rule over the rendered text and every aria-label. */
function renderedViolations(): string[] {
  const labels = [...document.querySelectorAll('[aria-label]')].map(
    (e) => e.getAttribute('aria-label') ?? '',
  );
  const text = [document.body.textContent, ...labels].join('\n');
  return scanText('rendered', text, [...healthPhraseRules, ...commerceRules]).map((v) => v.ruleId);
}

describe('the Weight card (UX_SCREENS card 1)', () => {
  it('WT-03, HS-21, NN-03: Kickstart day 10 shows the chip, the figures, the long-term goal and its milestone, the band and the note', async () => {
    await today(WEIGHT_SCENARIOS.K10, 10);
    const card = weightCard();
    expect(within(card).getByText('Kickstart, week 2 of 3')).toBeTruthy();
    expect(stat(weight.card.latest).textContent).toBe(`${weight.card.latest}96.8 kg`);
    expect(stat(weight.card.average7).textContent).toContain('97.9 kg');
    expect(stat(weight.card.goalStat).textContent).toContain('78.0 kg');
    expect(within(card).getByText('Next milestone 78.3 kg')).toBeTruthy();
    expect(within(card).getByText(weight.chart.bandLegend)).toBeTruthy();
    expect(within(card).getByText(weight.chart.trendLine)).toBeTruthy();
    expect(within(card).getByText('Week 1')).toBeTruthy();
    expect(within(card).getByText('Week 4')).toBeTruthy();
    expect(within(card).getByText(weight.phase.kickstartNote)).toBeTruthy();
    expect(screen.queryByRole('region', { name: weight.rapidLoss.label })).toBeNull();
    expect(renderedViolations()).toEqual([]);
  });

  it('stats with no figure: a short phrase in the slot, the sentence under the row, and a way to the Weight screen', async () => {
    await today({ ...WEIGHT_SCENARIOS.K10, goalKg: null, days: (d) => d >= 9 }, 10);
    const average = stat(weight.card.average7);
    expect(average.querySelector('.ui-stat__value--empty')?.textContent).toBe(
      weight.card.needsShort,
    );
    expect(within(weightCard()).getByText(weight.card.needs7)).toBeTruthy();
    expect(stat(weight.card.goalStat).textContent).toContain(weight.card.notSetShort);
    expect(
      within(weightCard()).getByRole('link', { name: weight.goal.set }).getAttribute('href'),
    ).toBe('#/weight');
  });

  it('D50: a stored goal now below BMI 18.5 shows "Needs updating" with no number, and a way to change it', async () => {
    await today({ ...WEIGHT_SCENARIOS.K10, goalKg: 59.9 }, 10);
    expect(stat(weight.card.goalStat).textContent).toBe(
      `${weight.card.goalStat}${weight.card.needsUpdatingShort}`,
    );
    expect(
      within(weightCard()).getByRole('link', { name: weight.goal.change }).getAttribute('href'),
    ).toBe('#/weight');
  });

  it('a block with no weigh-ins yet says so instead of drawing an empty chart', async () => {
    await today({ ...WEIGHT_SCENARIOS.K42, periods: [], days: (d) => d <= 2 }, 42);
    expect(within(weightCard()).getByText(weight.card.noWeighInsBlock)).toBeTruthy();
    expect(weightCard().querySelector('.ui-trend-chart')).toBeNull();
  });

  it('WT-05: the 7-day average of the item-4 week reads 89.3 kg', async () => {
    const week = [90.0, 89.6, 89.9, 89.2, 89.0, 88.8, 88.5];
    const options = { ...WEIGHT_SCENARIOS.NN03, today: '2000-02-07' };
    const snapshot = weightScenario(options);
    const seen = onDay(options, 7);
    test = await openSnapshotDb(
      { ...snapshot, weights: snapshot.weights.map((w, i) => ({ ...w, kg: week[i] ?? w.kg })) },
      seen.now,
    );
    render(<WeightCard storage={test.storage} />);
    await screen.findByRole('region', { name: weight.card.label });
    expect(stat(weight.card.average7).textContent).toContain('89.3 kg');
  });

  it('WT-13: readiness answer 5 takes away the goal, chip, band and pace notes; weigh-ins and the line stay; "no" brings the goal back', async () => {
    const db = await today({ ...WEIGHT_SCENARIOS.K42, readiness: { q5: 'yes' } }, 42);
    const card = weightCard();
    expect(within(card).queryByRole('group', { name: weight.card.goalStat })).toBeNull();
    expect(card.querySelector('.ui-pill--teal')).toBeNull();
    expect(card.querySelector('.ui-trend-chart__band')).toBeNull();
    expect(card.querySelector('.ui-trend-chart__line')).not.toBeNull();
    expect(within(card).getByText(weight.phase.gated)).toBeTruthy();
    expect(stat(weight.card.latest)).toBeTruthy();
    await act(async () => {
      await db.repos.readiness.answer('q5', 'no');
    });
    await waitFor(() => {
      expect(stat(weight.card.goalStat).textContent).toContain('78.0 kg');
    });
    expect((await db.repos.profile.get()).goalKg).toBe(78);
  });
});

describe('the weight check-in card on Today (WT-04, HS-11)', () => {
  it('shows on day 42 with the GP line; "Hide for today" is its only control and hides it for the day', async () => {
    const db = await today(WEIGHT_SCENARIOS.K42, 42);
    const card = screen.getByRole('region', { name: weight.rapidLoss.label });
    expect(within(card).getByText(weight.rapidLoss.body)).toBeTruthy();
    expect(
      within(card)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([weight.rapidLoss.hideToday]);
    fireEvent.click(within(card).getByRole('button', { name: weight.rapidLoss.hideToday }));
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: weight.rapidLoss.label })).toBeNull();
    });
    expect(await db.repos.cardState.get('rapid-loss', 'steady')).toMatchObject({
      dismissedAt: scenarioInstant(SCENARIO_DAY1, 42, '09:00'),
    });
  });
});

describe('card buttons fail quietly (section 2.10)', () => {
  it('a dismissal that cannot be saved leaves the card on screen and throws nothing', async () => {
    const db = await today(WEIGHT_SCENARIOS.K42, 42);
    const failing = {
      ...db.storage,
      repos: {
        ...db.repos,
        cardState: {
          ...db.repos.cardState,
          dismiss: () => Promise.reject(new Error('Synthetic failure')),
        },
      },
    };
    cleanup();
    render(<WeightCard storage={failing} />);
    const card = await screen.findByRole('region', { name: weight.rapidLoss.label });
    fireEvent.click(within(card).getByRole('button', { name: weight.rapidLoss.hideToday }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByRole('region', { name: weight.rapidLoss.label })).toBeTruthy();
  });
});

describe('the Kickstart stop-sign card (HS-27, WT-11)', () => {
  it('carries the eat, salt and fluids line, 111 as the emergency row and Healthline', async () => {
    await today(WEIGHT_SCENARIOS.K10, 10);
    const card = screen.getByRole('region', { name: weight.stopSigns.label });
    expect(within(card).getByText(weight.stopSigns.action)).toBeTruthy();
    const rows = within(card).getAllByRole('link');
    expect(rows[0]?.getAttribute('href')).toBe('tel:111');
    expect(rows[0]?.className).toContain('ui-action-row--emergency');
    expect(rows[1]?.getAttribute('href')).toBe('tel:0800611116');
    expect(within(card).getByRole('button', { name: weight.stopSigns.hideToday })).toBeTruthy();
  });

  it('C102: with answer 4 "yes" it gives the blood-pressure wording instead of "add salt"', async () => {
    await today({ ...WEIGHT_SCENARIOS.K10, readiness: { q4: 'yes' } }, 10);
    const card = screen.getByRole('region', { name: weight.stopSigns.label });
    expect(within(card).getByText(readiness.bloodPressure.stopSign)).toBeTruthy();
    expect(card.textContent).not.toContain('add salt and fluids');
  });
});

describe('a failed weigh-in save (section 2.10)', () => {
  it('a full phone says so and keeps the typed value', async () => {
    const db = await today(WEIGHT_SCENARIOS.K10, 10);
    const { StorageFullError } = await import('../../db/errors');
    const failing = {
      ...db.storage,
      repos: {
        ...db.repos,
        weights: { ...db.repos.weights, create: () => Promise.reject(new StorageFullError()) },
      },
    };
    cleanup();
    render(<WeightCard storage={failing} />);
    await screen.findByRole('region', { name: weight.card.label });
    fireEvent.click(screen.getByRole('button', { name: weight.card.logWeight }));
    const field = screen.getByRole('textbox', { name: weight.entry.fieldLabel });
    fireEvent.change(field, { target: { value: '96.5' } });
    fireEvent.click(screen.getByRole('button', { name: weight.entry.save }));
    expect(await screen.findByText(privacy.storageFull)).toBeTruthy();
    expect((field as HTMLInputElement).value).toBe('96.5');
  });
});
