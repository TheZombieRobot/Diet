// Today's Nutrition card (item 21 design section 6.3, K5 to K12 and K24 to K26): WT-06, WT-07,
// HS-09, HS-22, C11, D35, T16, T25, T26, T32. jsdom over the real repositories on fake-indexeddb,
// seeded with the synthetic fixtures of targetsTestKit.
import { alcohol, targets as copy } from '@diet/core/copy/health';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commerceRules, healthPhraseRules } from '../../../../../tools/scans/rules';
import { scanText } from '../../../../../tools/scans/scan';
import type { TestDb } from '../../db/testKit';
import {
  drink,
  FEMALE,
  foodEntry,
  MALE,
  MALE_STEADY,
  seedTargets,
  type TargetsSeed,
} from '../targets/targetsTestKit';
import type { WeightScenarioOptions } from '@diet/test-fixtures';
import { NutritionTodayCard } from './NutritionTodayCard';

let test: TestDb | undefined;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  test?.db.shutDown();
  test = undefined;
});

const card = () => screen.getByRole('region', { name: copy.today.label });

/** The card for a fixture on its day 10, once the figures are on screen. */
async function show(options: WeightScenarioOptions, seed: TargetsSeed = {}): Promise<TestDb> {
  test = await seedTargets(options, seed);
  render(<NutritionTodayCard storage={test.storage} />);
  // The first live read can take more than a second on a busy machine.
  await waitFor(
    () => {
      expect(card().querySelector('.ui-meter')).not.toBeNull();
    },
    { timeout: 4000 },
  );
  return test;
}

/** The meter for a row, by its label. */
function meter(label: string): HTMLElement {
  const found = [...card().querySelectorAll<HTMLElement>('.ui-meter')].find(
    (m) => m.querySelector('.ui-meter__label')?.textContent === label,
  );
  if (found === undefined) throw new Error(`No meter ${label}`);
  return found;
}
const value = (label: string) => meter(label).querySelector('.ui-meter__value')?.textContent;
const notes = () => [...card().querySelectorAll('p')].map((p) => p.textContent);

describe('the day’s figures (WT-06, WT-07; K6, K7)', () => {
  it('WT-07: a Kickstart day against 10,162 kJ, 140 g protein, 20 g net carbs and a 27 g budget', async () => {
    await show(MALE);
    expect(value(copy.today.energy)).toBe('0 of 10,162 kJ');
    expect(value(copy.today.protein)).toBe('0 of 140 g');
    expect(value(copy.today.fibre)).toBe('0 of 30 g guide');
    expect(value(copy.today.netCarbs)).toBe('0 / 20 g');
    expect(value(copy.today.satFat)).toBe('0 / 27 g');
    // F24: the zeros say nothing is in the food log, never that nothing was eaten.
    expect(notes()).toContain(copy.today.nothingLogged);
    expect(card().textContent).not.toMatch(/nothing (?:eaten|was eaten)|no food today/i);
    expect(within(card()).getByText(copy.dietMode.names.keto)).toBeTruthy();
  });

  it('WT-06, HS-25: a 5,217 kJ guide plans the 5,000 kJ floor, with protein still at 140 g', async () => {
    await show(FEMALE);
    expect(value(copy.today.energy)).toBe('0 of 5,000 kJ');
    expect(value(copy.today.protein)).toBe('0 of 140 g');
    expect(notes()).toContain(
      "Today's energy figure is the 5,000 kJ floor: a safety net, not a target.",
    );
  });
});

describe('bars that go over change colour only (HS-09; K5, K11)', () => {
  it('saturated fat and net carbs over their figures are amber, with the amounts in the text', async () => {
    await show(MALE, {
      food: [foodEntry('12:00', 'Example cheese plate', { saturatedFatG: 40, carbsG: 20.6 })],
    });
    expect(value(copy.today.satFat)).toBe('40 / 27 g');
    expect(meter(copy.today.satFat).getAttribute('data-state')).toBe('over');
    expect(value(copy.today.netCarbs)).toBe('21 / 20 g');
    expect(meter(copy.today.netCarbs).getAttribute('data-state')).toBe('over');
    // The energy bar never says over (T23).
    expect(meter(copy.today.energy).getAttribute('data-state')).toBe('normal');
    const labels = [...document.querySelectorAll('[aria-label]')].map(
      (e) => e.getAttribute('aria-label') ?? '',
    );
    const text = [card().textContent, ...labels].join('\n');
    expect(scanText('card', text, [...healthPhraseRules, ...commerceRules])).toEqual([]);
    expect(text).not.toMatch(/\b(?:bad|exceed\w*|warning|fail\w*|left|remaining)\b/i);
  });

  it('under the budget is within; an entry with no carbs figure gives "at least" and never within (D35)', async () => {
    await show(MALE, {
      food: [
        foodEntry('12:00', 'Example soup', { saturatedFatG: 5, carbsG: 10 }),
        foodEntry('13:00', 'Example roll', { saturatedFatG: 1 }, { unknown: ['carbsG'] }),
      ],
    });
    expect(meter(copy.today.satFat).getAttribute('data-state')).toBe('within');
    expect(value(copy.today.netCarbs)).toBe('at least 10 / 20 g');
    expect(meter(copy.today.netCarbs).getAttribute('data-state')).toBe('incomplete');
    expect(notes()).toContain(
      '1 entry has no carbohydrate figure, so the total is at least what is shown.',
    );
  });
});

describe('alcohol as its own part (C11, NN-01, T16; K9, K12)', () => {
  const food = [foodEntry('12:00', 'Example meal', { energyKj: 7000, proteinG: 60 })];
  const evening = (time: string, day = '2000-02-10') =>
    new Date(`${day}T${time}:00+13:00`).toISOString();

  it('HS-36, C11: six cans show as "Alcohol 2,360 kJ" beside the food; protein and carbs are unchanged', async () => {
    await show(MALE, { food, drinks: [drink(evening('08:00'), 6)], time: '09:00' });
    expect(value(copy.today.energy)).toBe('9,360 of 10,162 kJ');
    const alcoholLines = [...card().querySelectorAll('[data-part="alcohol"]')].map(
      (p) => p.textContent,
    );
    expect(alcoholLines).toEqual(['Food 7,000 kJ · Alcohol 2,360 kJ']);
    expect(value(copy.today.protein)).toBe('60 of 140 g');
    const alcoholRules = [
      /\bbudget\b/i,
      /\bleft\b/i,
      /\bremaining\b/i,
      /\btargets?\b/i,
      /\blimits?\b/i,
    ];
    for (const line of alcoholLines)
      for (const rule of alcoholRules) expect(line).not.toMatch(rule);
  });

  it('NN-01: an unknown drink makes the total "at least"; only unknown drinks never read as 0 kJ', async () => {
    await show(MALE, {
      food,
      drinks: [drink(evening('07:00'), 6), drink(evening('08:00'), 1, null)],
    });
    expect(value(copy.today.energy)).toBe('at least 9,360 of 10,162 kJ');
    expect(notes()).toContain(alcohol.dayEnergy.unknownOne);
    cleanup();
    test?.db.shutDown();
    await show(MALE, { food, drinks: [drink(evening('08:00'), 2, null)] });
    expect(notes()).toContain('Food 7,000 kJ · Alcohol: energy unknown');
    expect(card().textContent).not.toContain('Alcohol 0 kJ');
  });

  it('HS-36, A40: two cans whose label says 0 kcal are unknown energy, as on Drinks, never a known 0', async () => {
    await show(MALE, { drinks: [drink(evening('08:00'), 2, 0)] });
    expect(notes()).toContain('Food 0 kJ · Alcohol: energy unknown');
    expect(notes()).toContain('Energy is unknown for 2 drinks, so the day total is incomplete.');
    expect(card().textContent).not.toContain('Alcohol 0 kJ');
  });

  it('a 0% drink whose label says 0 kcal is a known 0, and still has its alcohol part', async () => {
    const zero = drink(evening('08:00'), 1, 0);
    const label = zero.beverage.label === null ? null : { ...zero.beverage.label, abvPercent: 0 };
    await show(MALE, {
      drinks: [
        { ...zero, beverage: { ...zero.beverage, abvPercent: 0, label }, stdDrinksPerServe: 0 },
      ],
    });
    expect(notes()).toContain('Food 0 kJ · Alcohol 0 kJ');
  });

  it('T16: at 01:00 the card counts the calendar day, so last evening’s drink is not in it', async () => {
    await show(MALE, {
      time: '01:00',
      drinks: [drink(evening('23:30', '2000-02-09'), 1), drink(evening('00:30'), 1)],
    });
    expect(notes()).toContain('Food 0 kJ · Alcohol 393 kJ');
  });
});

describe('the mode and the readiness answers (FL-04, RD-01 to RD-03, T25, T26; K10)', () => {
  it('balanced shows net carbs with no bar; answer 3 without the prescriber holds keto at 50 g', async () => {
    await show({ ...MALE_STEADY, dietMode: 'balanced' });
    expect(value(copy.today.netCarbs)).toBe('0 g');
    expect(meter(copy.today.netCarbs).querySelector('svg')).toBeNull();
    cleanup();
    test?.db.shutDown();
    await show({ ...MALE, readiness: { q3: 'yes' } });
    expect(value(copy.today.netCarbs)).toBe('0 / 50 g');
  });

  it('T25: answer 1 shows plain figures with no bar, no state, no alcohol and no link', async () => {
    await show(
      { ...MALE, readiness: { q1: 'yes' } },
      { drinks: [drink(new Date('2000-02-09T20:00:00Z').toISOString(), 1)] },
    );
    expect(card().querySelector('svg')).toBeNull();
    expect(card().querySelector('[data-state]')).toBeNull();
    for (const meterValue of card().querySelectorAll('.ui-meter__value')) {
      expect(meterValue.textContent).toMatch(/^(at least )?[\d,]+ (kJ|g)$/);
    }
    expect(notes()).toContain(copy.today.plainNote);
    const text = card().textContent;
    for (const line of Object.values(alcohol.dayEnergy)) {
      expect(text).not.toContain(line.replace(/\{\w+\}.*$/, ''));
    }
    expect(card().querySelector('a')).toBeNull();
  });

  it('T25: answer 5 is plain too; T26: answer 2 shows energy plain with the pregnancy note, protein with its range', async () => {
    await show({ ...MALE, readiness: { q5: 'yes' } });
    expect(card().querySelector('svg')).toBeNull();
    expect(notes()).toContain(copy.today.plainNote);
    // Every carb ceiling is off, so the card names no diet mode (items 16 and 21 merged).
    expect(within(card()).queryByText(copy.dietMode.names.keto)).toBeNull();
    cleanup();
    test?.db.shutDown();
    await show({ ...MALE, readiness: { q2: 'yes' } });
    expect(value(copy.today.energy)).toBe('0 kJ');
    expect(meter(copy.today.energy).querySelector('svg')).toBeNull();
    expect(value(copy.today.protein)).toBe('0 of 120–140 g');
    expect(notes()).toContain(copy.energy.pregnancyNote);
  });
});

describe('the eating window changes nothing (HS-22; K8)', () => {
  it('moving from 16:8 to 23:1 leaves the card text the same', async () => {
    const db = await show(MALE);
    await db.repos.targets.update({
      fastingPreset: '16:8',
      eatingWindow: { start: '11:00', end: '19:00' },
    });
    await waitFor(() => {
      expect(value(copy.today.energy)).toBe('0 of 10,162 kJ');
    });
    const before = card().textContent;
    await db.repos.targets.update({
      fastingPreset: '23:1',
      eatingWindow: { start: '18:00', end: '19:00' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(card().textContent).toBe(before);
  });
});

describe('one clock for the whole card (T30; D14)', () => {
  it('just before midnight the card holds the day’s food; just after, the new day starts empty', async () => {
    const db = await show(MALE, {
      time: '23:59',
      food: [foodEntry('12:00', 'Example meal', { energyKj: 4000 })],
    });
    expect(value(copy.today.energy)).toBe('4,000 of 10,162 kJ');
    db.env.set(new Date('2000-02-11T00:00:30+13:00').toISOString());
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => {
      expect(value(copy.today.energy)).toBe('0 of 10,162 kJ');
    });
    expect(notes()).toContain(copy.today.nothingLogged);
  });
});

describe('entries, a missing rough guide and a failed read (T30, T32, T33; K24 to K26)', () => {
  it('K24: the day’s entries in time order, each with its time and source word', async () => {
    await show(MALE, {
      food: [
        foodEntry('18:30', 'Silverbeet and chicken traybake', { energyKj: 2000 }),
        foodEntry('17:00', 'Greek yoghurt and walnuts', { energyKj: 900 }, { confidence: 'label' }),
      ],
    });
    const rows = [...card().querySelectorAll('.ui-entry-list li')].map((li) => li.textContent);
    expect(rows).toEqual([
      '5:00 pmGreek yoghurt and walnutsLabel',
      '6:30 pmSilverbeet and chicken traybakeEstimate',
    ]);
    expect(card().querySelector('.ui-chip--amber')?.textContent).toBe('Estimate');
  });

  it('T32: no rough guide names what is missing and links to where it is fixed', async () => {
    await show({ ...MALE, heightCm: null });
    expect(notes()).toContain(copy.energy.unavailable.missingHeight);
    expect(within(card()).getByRole('link').getAttribute('href')).toBe('#/profile');
    expect(value(copy.today.energy)).toBe('0 kJ');
    cleanup();
    test?.db.shutDown();
    await show({ ...MALE, days: () => false });
    expect(notes()).toContain(copy.energy.unavailable.missingWeight);
    expect(within(card()).getByRole('link').getAttribute('href')).toBe('#/weight');
  });

  it('T30: a read that fails shows "could not be read" with Reload, never an endless wait', async () => {
    test = await seedTargets(MALE);
    vi.spyOn(test.db, 'transaction').mockImplementation(() => {
      throw new Error('Synthetic failure');
    });
    render(<NutritionTodayCard storage={test.storage} />);
    expect(
      await within(card()).findByText(copy.screen.readFailed, {}, { timeout: 4000 }),
    ).toBeTruthy();
    expect(within(card()).getByRole('button', { name: 'Reload' })).toBeTruthy();
  });
});
