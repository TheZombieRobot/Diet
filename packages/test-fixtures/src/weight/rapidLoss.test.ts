// The rapid-loss card (item 14 design section 6.2, weight/rapidLoss.test.ts): HS-11 as changed by
// C08, C46 and D27; WT-03, WT-04, WT-12; W7, W8. Synthetic scenarios.
import {
  dailyWeightsFromRecords,
  rapidLineInOffer,
  rapidLossExemptDates,
  rapidLossSettingsInUse,
  rapidLossStatus,
  type SettingsRecord,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import {
  onDay,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenarioInput,
} from './scenarios';

const { K42, X3, R2 } = WEIGHT_SCENARIOS;
type Stored = Pick<SettingsRecord, 'rapidLossThresholdGPerWeek' | 'rapidLossConsecutiveWeeks'>;

function status(options: WeightScenarioOptions, day: number, stored: Partial<Stored> = {}) {
  const input = weightScenarioInput({ ...onDay(options, day), settings: stored });
  const today = onDay(options, day).today;
  return rapidLossStatus({
    daily: dailyWeightsFromRecords(input.weights, input.homeTimeZone),
    today,
    exempt: rapidLossExemptDates(input.periods, input.checks, today, input.homeTimeZone),
    settings: rapidLossSettingsInUse(input.settings),
  });
}

const shows = (options: WeightScenarioOptions, day: number, stored: Partial<Stored> = {}) =>
  status(options, day, stored).show;
/** The days in [from, to] on which the card shows. */
const showingDays = (
  options: WeightScenarioOptions,
  from: number,
  to: number,
  stored: Partial<Stored> = {},
) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((day) =>
    shows(options, day, stored),
  );

describe('the rapid-loss card (HS-11, C08, C46, D27)', () => {
  it('WT-03, WT-04: never in the first 21 Kickstart days at 2.5 kg a week; shows on day 42 after three weeks at 1.2 kg a week', () => {
    expect(showingDays(K42, 1, 42)).toEqual([42]);
  });

  it('WT-04: on day 42 the weeks read 1.2, 1.2 and about 1.94 (the first counted week reaches into Kickstart, W7)', () => {
    const rates = status(K42, 42).weeks.map((w) => w.rateKgPerWeek ?? Number.NaN);
    expect(rates[0]).toBeCloseTo(1.2, 9);
    expect(rates[1]).toBeCloseTo(1.2, 9);
    expect(rates[2]).toBeCloseTo(1.943, 3);
    // Day 41: the oldest week touches day 21, an exempt day.
    expect(status(K42, 41).weeks[2]?.counted).toBe(false);
  });

  it('controls: 0.8 kg a week never shows; exactly 1.0 never shows (strictly greater); 1.001 does', () => {
    expect(showingDays(WEIGHT_SCENARIOS['K42-08'], 22, 42)).toEqual([]);
    expect(showingDays(WEIGHT_SCENARIOS['K42-10'], 22, 42)).toEqual([]);
    expect(shows({ ...K42, ratesKgPerWeek: [2.5, 2.5, 2.5, 1.001] }, 42)).toBe(true);
  });

  it('C46: the two-week setting and a lower threshold only make it more sensitive', () => {
    const two = { rapidLossConsecutiveWeeks: 2 as const };
    expect(showingDays(WEIGHT_SCENARIOS['K42-08'], 22, 42, two)).toEqual([]);
    expect(shows(WEIGHT_SCENARIOS['K42-105'], 34, two)).toBe(false);
    expect(shows(WEIGHT_SCENARIOS['K42-105'], 35, two)).toBe(true);
    expect(shows(WEIGHT_SCENARIOS['K42-105'], 41)).toBe(false);
    expect(shows(WEIGHT_SCENARIOS['K42-105'], 42)).toBe(true);
    expect(shows(WEIGHT_SCENARIOS['K42-08'], 35, { ...two, rapidLossThresholdGPerWeek: 750 })).toBe(
      true,
    );
  });

  it('C46, C50: stored settings are clamped at use, only ever to the more sensitive side', () => {
    const inUse = (threshold: number, weeks = 3) =>
      rapidLossSettingsInUse({
        rapidLossThresholdGPerWeek: threshold,
        rapidLossConsecutiveWeeks: weeks as 2 | 3,
      });
    expect([1200, 500, 777, Number.NaN].map((t) => inUse(t).thresholdGPerWeek)).toEqual([
      1000, 750, 750, 1000,
    ]);
    expect([4, 1, 2.5].map((w) => inUse(1000, w).weeks)).toEqual([3, 2, 3]);
  });

  it('a week with too few weigh-ins breaks the run', () => {
    const gaps = { ...K42, days: (day: number) => day < 36 || day === 36 || day === 40 };
    expect(status(gaps, 42).weeks[0]?.rateKgPerWeek).toBeNull();
    expect(shows(gaps, 42)).toBe(false);
  });

  it('C08 over D27: extension weeks count, so it shows on day 42 of an extended Kickstart and on the first Steady day', () => {
    expect(shows(X3, 42)).toBe(true);
    expect(shows(X3, 43)).toBe(true);
  });

  it('WT-12: a second Kickstart after 21 days used has no free days; the same weigh-ins with only that Kickstart do', () => {
    expect(shows(R2, 63)).toBe(true);
    expect(shows(WEIGHT_SCENARIOS['R2-alone'], 63)).toBe(false);
  });

  it('WT-03, HS-11: four Steady weeks at 1.2 kg a week, then a first Kickstart from day 29: shown on day 28, never on its 21 days', () => {
    const steadyFirst = {
      ...K42,
      ratesKgPerWeek: [1.2, 1.2, 1.2, 1.2, 2.5, 2.5, 2.5],
      periods: [{ startDay: 29 }],
    };
    expect(shows(steadyFirst, 28)).toBe(true);
    expect(showingDays(steadyFirst, 29, 49)).toEqual([]);
  });

  it('never on an exempt day, however fast the line falls', () => {
    expect(showingDays({ ...K42, ratesKgPerWeek: [5] }, 1, 21)).toEqual([]);
  });

  it('C08: the extension offer carries the GP line when the latest week is over the threshold', () => {
    const line = (options: WeightScenarioOptions) => {
      const input = weightScenarioInput(onDay(options, 19));
      const daily = dailyWeightsFromRecords(input.weights, input.homeTimeZone);
      return rapidLineInOffer(
        daily,
        onDay(options, 19).today,
        rapidLossSettingsInUse(input.settings),
      );
    };
    expect(line(K42)).toBe(true);
    expect(line({ ...K42, ratesKgPerWeek: [0.8] })).toBe(false);
  });
});
