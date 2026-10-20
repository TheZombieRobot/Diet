import { describe, expect, it } from 'vitest';
import { kjToKcal } from '../nutrition/nutrients';
import { drinkFigures } from '../storage/derived';
import type { DrinkLogRecord, StoredBeverage, StoredDrinkLabel } from '../storage/records';
import { zonedWallTimeToInstant } from '../util/time';
import {
  alcoholDays,
  alcoholFreeDays,
  type DrinkingDayContext,
  energyDisplay,
  entryFigures,
  periodTotals,
  trackingStartOf,
} from './totals';

const ZONE = 'Pacific/Auckland';
const CTX: DrinkingDayContext = { homeTimeZone: ZONE, cutoverMinutes: 300 };

/** The seeded preset: 330 mL at 5% with 94 kcal on the label (defaults.ts). */
const SEEDED_LABEL: StoredDrinkLabel = {
  volumeMl: 330,
  abvPercent: 5,
  standardDrinks: null,
  kcal: 94,
  energyAsEntered: { value: 94, unit: 'kcal' },
  origin: 'preset-default',
};
const SEEDED: StoredBeverage = { volumeMl: 330, abvPercent: 5, label: SEEDED_LABEL };
const plain = (volumeMl: number, abvPercent: number): StoredBeverage => ({
  volumeMl,
  abvPercent,
  label: null,
});

/** The instant of a wall-clock time in Auckland. */
const nz = (date: string, hh: number, mm = 0) =>
  new Date(zonedWallTimeToInstant(date, hh * 60 + mm, ZONE)).toISOString();

let next = 0;
/** A logged drink with the figures the repository stores (drinkFigures). */
function drink(at: string, beverage: StoredBeverage, count = 1, name = 'Example drink') {
  next += 1;
  return {
    id: `drink-${next}`,
    at,
    timeZone: ZONE,
    beverageId: null,
    name,
    count,
    beverage,
    ...drinkFigures(beverage),
  } as DrinkLogRecord;
}

describe('period totals (U3; C94, C105, NN-01)', () => {
  it('C105: a mixed day counts drinks, sums standard drinks once and leaves unknown energy out', () => {
    const rows = [
      drink(nz('2000-03-01', 18), SEEDED, 1, 'Zero-sugar premix'),
      drink(nz('2000-03-01', 19), plain(150, 13), 1, 'Glass of wine'),
    ];
    const t = periodTotals(rows, CTX, '2000-03-01', '2000-03-01');
    // 1.30185 + 1.53855 = 2.8404, rounded once.
    expect(t).toMatchObject({ drinks: 2, std: 2.84, knownKcal: 94, unknownKcalDrinks: 1 });
    expect(t.breakdown).toHaveLength(2);
  });

  it('a calculated row whose stored figure is corrupted low counts at its recomputed figure', () => {
    const row = { ...drink(nz('2000-03-01', 18), plain(330, 5)), stdDrinksPerServe: 0 };
    expect(periodTotals([row], CTX, '2000-03-01', '2000-03-01').std).toBe(1.3);
  });

  it('a session across midnight is one drinking day (C21)', () => {
    const rows = [drink(nz('2000-02-29', 23, 30), SEEDED), drink(nz('2000-03-01', 1, 30), SEEDED)];
    expect(periodTotals(rows, CTX, '2000-02-29', '2000-02-29').drinks).toBe(2);
    expect(alcoholDays(rows, CTX, '2000-02-01', '2000-03-01').map((d) => d.day)).toEqual([
      '2000-02-29',
    ]);
  });

  it('A39: a label of 0 standard drinks is shown, but never hides the help card or makes the day alcohol-free', () => {
    const bottle: StoredBeverage = {
      volumeMl: 750,
      abvPercent: 13.5,
      label: {
        volumeMl: 750,
        abvPercent: 13.5,
        standardDrinks: 0,
        kcal: null,
        energyAsEntered: null,
        origin: 'owner',
      },
    };
    const row = drink(nz('2000-02-25', 19), bottle);
    const t = periodTotals([row], CTX, '2000-02-25', '2000-02-25');
    expect(t.std).toBe(0);
    expect(t.triggerStd).toBe(7.99);
    expect(entryFigures(row).labelDiffersFrom).toBe(7.99);
    const days = new Set(alcoholDays([row], CTX, '2000-02-21', '2000-02-27').map((d) => d.day));
    expect(alcoholFreeDays(days, '2000-02-25', '2000-02-25', '2000-02-14', '2000-02-28')).toEqual({
      count: 0,
      countedDays: 1,
    });
  });
});

describe('alcohol-free days (U3; AL-05, C21, A5, A6)', () => {
  // Monday 21 to Sunday 27 February 2000: drinks on Fri 25, Sat 26 (two) and Sun 27, a 0% drink on
  // Tue 22 and 100 mL at 0.5% on Wed 23.
  const rows = [
    drink(nz('2000-02-25', 20), SEEDED),
    drink(nz('2000-02-26', 20), SEEDED, 2),
    drink(nz('2000-02-27', 20), SEEDED),
    drink(nz('2000-02-22', 20), plain(330, 0)),
    drink(nz('2000-02-23', 20), plain(100, 0.5)),
  ];
  const days = new Set(alcoholDays(rows, CTX, '2000-02-21', '2000-02-27').map((d) => d.day));
  const week = (today: string, trackingStart: string) =>
    alcoholFreeDays(days, '2000-02-21', '2000-02-27', trackingStart, today).count;

  it.each([
    ['today Monday 28 Feb: Mon 21, Tue 22 (0% only) and Thu 24', '2000-02-28', '2000-02-14', 3],
    ['today Thursday 24 Feb: Mon and Tue (today never counts)', '2000-02-24', '2000-02-14', 2],
    ['tracking from Wednesday 23 Feb: Thu 24 only', '2000-02-28', '2000-02-23', 1],
  ])('%s', (_case, today, trackingStart, expected) => {
    expect(week(today, trackingStart)).toBe(expected);
  });

  it('counting starts on the drinking day the notice was read, in the home zone', () => {
    expect(trackingStartOf(nz('2000-02-14', 3), CTX)).toBe('2000-02-13');
    expect(trackingStartOf(null, CTX)).toBeNull();
    expect(alcoholFreeDays(days, '2000-02-21', '2000-02-27', null, '2000-02-28')).toEqual({
      count: 0,
      countedDays: 0,
    });
  });
});

describe('energy display (U3; NN-01, C11, A4, A40)', () => {
  const day = (...rows: DrinkLogRecord[]) =>
    energyDisplay(periodTotals(rows, CTX, '2000-03-01', '2000-03-01'));
  const kj393: StoredBeverage = {
    volumeMl: 330,
    abvPercent: 5,
    label: {
      volumeMl: 330,
      abvPercent: 5,
      standardDrinks: null,
      kcal: kjToKcal(393),
      energyAsEntered: { value: 393, unit: 'kJ' },
      origin: 'owner',
    },
  };
  const zeroKcal: StoredBeverage = {
    ...kj393,
    label: { ...SEEDED_LABEL, kcal: 0, energyAsEntered: { value: 0, unit: 'kcal' } },
  };
  const at = nz('2000-03-01', 18);

  it.each([
    ['no drinks', [], { kind: 'none' }],
    ['the seeded can', [drink(at, SEEDED)], { kind: 'known', kcal: 94, kj: 393 }],
    ['a label typed as 393 kJ', [drink(at, kj393)], { kind: 'known', kcal: 94, kj: 393 }],
    [
      'the can and a drink without a label',
      [drink(at, SEEDED), drink(at, plain(330, 5))],
      { kind: 'partial', kcal: 94, kj: 393, unknownDrinks: 1 },
    ],
    [
      'A40: 0 kcal on a 5% drink is unknown, not 0',
      [drink(at, zeroKcal)],
      { kind: 'unknown', unknownDrinks: 1 },
    ],
  ])('%s', (_case, rows, expected) => {
    expect(day(...rows)).toEqual(expected);
  });

  it('an entry shows its own totals, never the per-serve figure (A43)', () => {
    expect(entryFigures(drink(at, SEEDED, 3))).toEqual({
      std: 3.91,
      kcal: 282,
      labelDiffersFrom: null,
      kcalLooksLow: false,
    });
  });
});
