import { describe, expect, it } from 'vitest';
import { drinkFigures } from '../storage/derived';
import type { AlcoholMilestoneRecord, DrinkLogRecord, StoredBeverage } from '../storage/records';
import { zonedWallTimeToInstant } from '../util/time';
import { dailySeries, milestoneInEffect, weeklySeries } from './trends';

const ZONE = 'Pacific/Auckland';
const CTX = { homeTimeZone: ZONE, cutoverMinutes: 300 };
const TODAY = '2000-03-01';

const noon = (date: string) => new Date(zonedWallTimeToInstant(date, 12 * 60, ZONE)).toISOString();
/** 100 mL at 12.7% with a label of 1 standard drink (the calculation, 1.00, agrees). */
const ONE: StoredBeverage = {
  volumeMl: 100,
  abvPercent: 12.7,
  label: {
    volumeMl: 100,
    abvPercent: 12.7,
    standardDrinks: 1,
    kcal: null,
    energyAsEntered: null,
    origin: 'owner',
  },
};
const drink = (date: string, count: number, beverage = ONE) =>
  ({
    id: `drink-${date}-${count}`,
    at: noon(date),
    timeZone: ZONE,
    beverageId: null,
    name: 'Example wine',
    count,
    beverage,
    ...drinkFigures(beverage),
  }) as DrinkLogRecord;

describe('dailySeries (U6; UX 5b)', () => {
  it('28 points ending today; untracked days before the notice; unknown energy stays unknown', () => {
    const points = dailySeries([drink('2000-02-25', 2)], CTX, TODAY, '2000-02-20');
    expect(points).toHaveLength(28);
    expect(points.at(-1)?.day).toBe(TODAY);
    expect(points.filter((p) => p.isToday).map((p) => p.day)).toEqual([TODAY]);
    expect(points.find((p) => p.day === '2000-02-19')?.tracked).toBe(false);
    expect(points.find((p) => p.day === '2000-02-20')?.tracked).toBe(true);
    expect(points.find((p) => p.day === '2000-02-25')).toMatchObject({
      drinks: 2,
      std: 2,
      energy: { kind: 'unknown', unknownDrinks: 2 },
    });
  });
});

describe('weeklySeries (U6; C21, A14)', () => {
  // Tracking from Monday 3 January 2000; the weeks of 3, 10, 17 and 24 January hold 10, 12, 8 and 14.
  const rows = [
    drink('2000-01-04', 10),
    drink('2000-01-11', 12),
    drink('2000-01-18', 8),
    drink('2000-01-25', 14),
  ];
  const weeks = weeklySeries(rows, CTX, TODAY, '2000-01-03', []);

  it('8 Monday-start weeks ending with the current one, which alone is current', () => {
    expect(weeks.map((w) => w.weekStart)).toEqual([
      '2000-01-10',
      '2000-01-17',
      '2000-01-24',
      '2000-01-31',
      '2000-02-07',
      '2000-02-14',
      '2000-02-21',
      '2000-02-28',
    ]);
    expect(weeks.map((w) => w.current)).toEqual([...Array<boolean>(7).fill(false), true]);
    // Mon 28 Feb and Tue 29 Feb have passed with nothing logged; today never counts.
    expect(weeks.at(-1)).toMatchObject({ alcoholFreeDays: 2, countedDays: 2 });
    expect(weeks[0]).toMatchObject({ std: 12, alcoholFreeDays: 6, countedDays: 7 });
  });

  it('A14: the 4-week average starts with 4 full weeks of records, and never on the current week', () => {
    expect(weeks.map((w) => w.rollingAverageStd)).toEqual([null, null, 11, 8.5, 5.5, 3.5, 0, null]);
  });

  it('a week wholly before the notice was read is not tracked', () => {
    const late = weeklySeries(rows, CTX, TODAY, '2000-02-16', []);
    expect(late.find((w) => w.weekStart === '2000-01-31')?.tracked).toBe(false);
    expect(late.find((w) => w.weekStart === '2000-01-24')?.tracked).toBe(true); // it has entries
    expect(late.find((w) => w.weekStart === '2000-02-14')?.tracked).toBe(true);
  });
});

describe('milestoneInEffect (U6; A15, HS section 5)', () => {
  const milestone = (fromDate: string, createdAt: string, weeklyStdDrinks: number) =>
    ({
      id: `m-${fromDate}-${createdAt}`,
      label: 'Your milestone',
      weeklyStdDrinks,
      fromDate,
      enteredBy: 'self',
      note: null,
      createdAt,
    }) as AlcoholMilestoneRecord;

  it.each([
    ['no milestones', [], null],
    [
      'one from Wednesday 16 Feb, for the week of 14 Feb',
      [milestone('2000-02-16', '2000-02-16T00:00:00.000Z', 8)],
      8,
    ],
    [
      'two from the same day: the later entered',
      [
        milestone('2000-02-16', '2000-02-17T00:00:00.000Z', 6),
        milestone('2000-02-16', '2000-02-16T00:00:00.000Z', 8),
      ],
      6,
    ],
    ['one from after that Sunday', [milestone('2000-02-21', '2000-02-16T00:00:00.000Z', 8)], null],
  ])('%s', (_case, milestones, weekly) => {
    expect(milestoneInEffect(milestones, '2000-02-20')?.weeklyStdDrinks ?? null).toBe(weekly);
  });
});
