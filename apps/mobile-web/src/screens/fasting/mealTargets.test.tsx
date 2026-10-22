// The Fast card's meal check and the Nutrition today card read one set of figures (items 15 and 21
// merged; C10, C65, HS-18, cross-item ruling 3): item 21's day targets, never the weight phase
// alone. In both cases below the phase still says Kickstart (140 g) while the figures read Steady:
// the card shows the 120–140 g range and the check uses its bottom, so a check built from the
// phase would disagree with the card. jsdom over the real repositories, seeded with the synthetic
// item 21 fixtures.
import {
  addDays,
  type EatingWindow,
  isKickstartDay,
  localDateOf,
  type PlannedMealFigures,
  phaseInputFrom,
  readinessGates,
  type Snapshot,
  weightGateInput,
} from '@diet/core';
import { alcohol, fasting, targets as copy, weight } from '@diet/core/copy/health';
import { onDay, weightScenario, type WeightScenarioOptions } from '@diet/test-fixtures';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { openSnapshotDb, type TestDb } from '../../db/testKit';
import { formatWhole } from '../../format';
import { MALE, seedTargets } from '../targets/targetsTestKit';
import { TodayScreen } from '../today/TodayScreen';
import { NutritionTodayCard } from '../today/NutritionTodayCard';
import { readFastingInputs } from './inputs';
import { fastingContext } from './integration';
import { fastingView } from './view';

const ONE_MEAL: EatingWindow = { start: '18:00', end: '19:00' };
/** The male fixture eating one meal a day, which he chose himself. */
const ONE_MEAL_MALE: WeightScenarioOptions = {
  ...MALE,
  targets: { fastingPreset: '23:1', eatingWindow: ONE_MEAL, presetChosenBy: 'user' },
};

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

/** A planned dinner with enough protein for 120 g but not for 140 g. */
const dinner: PlannedMealFigures = {
  slot: 'dinner',
  proteinG: 130,
  proteinKnown: true,
  foodEnergyKj: 15_000,
  energyKnown: true,
  proteinFoodCookedG: 450,
  incomplete: false,
};

/**
 * The fixture on scenario day `day` at 09:00: the Nutrition card's protein and energy as shown, and
 * the fasting context built from the same records, as the Fast card builds it.
 */
async function both(options: WeightScenarioOptions, day: number) {
  const seen = onDay(options, day);
  const snapshot: Snapshot = { ...weightScenario(seen), food_log: [], drinks_log: [] };
  test = await openSnapshotDb(snapshot, seen.now);
  const { storage, env } = test;
  render(<NutritionTodayCard storage={storage} />);
  const value = (label: string) =>
    [...screen.getByRole('region', { name: copy.today.label }).querySelectorAll('.ui-meter')]
      .find((m) => m.querySelector('.ui-meter__label')?.textContent === label)
      ?.querySelector('.ui-meter__value')?.textContent;
  // The first live read can take more than a second on a busy machine.
  await waitFor(
    () => {
      expect(value(copy.today.protein)).toBeDefined();
    },
    { timeout: 4000 },
  );

  const now = env.now();
  const zone = env.timeZone();
  const today = localDateOf(now, zone);
  const read = await readFastingInputs(storage, today);
  if (!read.ok) throw new Error('unreadable');
  const { inputs } = read;
  const gateInput = weightGateInput(
    {
      readiness: inputs.readiness,
      profile: inputs.profile,
      weights: inputs.weights,
      homeTimeZone: inputs.settings.homeTimeZone,
    },
    today,
    now,
  );
  const gates = readinessGates(gateInput);
  const endsPending = new Map();
  const context = fastingContext({
    inputs,
    gateInput,
    gates,
    now,
    deviceTimeZone: zone,
    endsPending,
  });
  const phaseKickstart = isKickstartDay(
    phaseInputFrom({
      now,
      deviceTimeZone: zone,
      homeTimeZone: inputs.settings.homeTimeZone,
      profile: inputs.profile,
      gates,
      periods: inputs.periods,
      checks: inputs.checks,
      endsPending,
    }),
  );
  const planned = {
    ...context,
    mealSources: { ...context.mealSources, plannedMeals: () => [dinner] },
  };
  const check = fastingView(inputs, planned, Date.parse(now), zone);
  if (check.kind !== 'open') throw new Error(`expected the open view, got ${check.kind}`);
  return {
    phaseKickstart,
    figures: context.mealTargets(today),
    tomorrow: context.mealTargets(addDays(today, 1)),
    upcoming: check.upcoming,
    cardProtein: value(copy.today.protein),
    cardEnergy: value(copy.today.energy),
  };
}

describe('the meal check and the Nutrition today card agree (items 15 and 21)', () => {
  it('a stop-sign pause: both check against 120 g and the rough guide with no deficit, while the phase is still Kickstart', async () => {
    const seen = await both(
      { ...ONE_MEAL_MALE, periods: [{ startDay: 1, stopSignOnDay: 19 }] },
      20,
    );
    expect(seen.phaseKickstart).toBe(true);
    expect(seen.figures).toEqual({ proteinTargetG: 120, energyTargetKj: 14_516 });
    expect(seen.cardProtein).toBe(`0 of ${seen.figures.proteinTargetG}–140 g`);
    expect(seen.cardEnergy).toBe(`0 of ${formatWhole(seen.figures.energyTargetKj ?? 0)} kJ`);
    // 130 g carries the day at 120 g; the phase's 140 g would have offered the snack.
    expect(seen.upcoming).toMatchObject({ kind: 'ok', reasons: [], energyChecked: true });
  });

  it('no rough guide: 120 g on both, no energy target on the card, and the check offers the snack, never passes', async () => {
    const seen = await both({ ...ONE_MEAL_MALE, heightCm: null }, 10);
    expect(seen.phaseKickstart).toBe(true);
    expect(seen.figures).toEqual({ proteinTargetG: 120, energyTargetKj: null });
    expect(seen.cardProtein).toBe(`0 of ${seen.figures.proteinTargetG}–140 g`);
    expect(seen.cardEnergy).toBe('0 kJ');
    expect(seen.upcoming).toMatchObject({
      kind: 'offer',
      reasons: ['energy-unknown'],
      energyChecked: false,
    });
  });

  it("tomorrow's check uses tomorrow's figures: on a Kickstart's last day, today is 140 g and tomorrow Steady", async () => {
    const seen = await both(ONE_MEAL_MALE, 21);
    expect(seen.phaseKickstart).toBe(true);
    expect(seen.figures).toEqual({ proteinTargetG: 140, energyTargetKj: 10_162 });
    expect(seen.cardProtein).toBe('0 of 140 g');
    expect(seen.cardEnergy).toBe('0 of 10,162 kJ');
    // The 15% Steady deficit on the same 14,516 kJ rough guide, rounded up.
    expect(seen.tomorrow).toEqual({ proteinTargetG: 120, energyTargetKj: 12_339 });
  });
});

describe('Today with the Fast and Nutrition today cards (items 15 and 21)', () => {
  it('the help card first, then Weight, the Fast card and Nutrition today', async () => {
    test = await seedTargets({ ...ONE_MEAL_MALE, readiness: { q7: 'yes' } });
    appStorageStore.set(test.storage);
    render(<TodayScreen />);
    const labels: readonly string[] = [
      alcohol.helpCardLabel,
      weight.card.label,
      fasting.card.label,
      copy.today.label,
    ];
    await waitFor(
      () => {
        const order = screen
          .getAllByRole('region')
          .map((r) => r.getAttribute('aria-label') ?? r.querySelector('h2')?.textContent ?? '')
          .filter((name) => labels.includes(name));
        expect(order).toEqual(labels);
      },
      { timeout: 4000 },
    );
  });
});
