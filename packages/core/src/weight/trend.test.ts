import { describe, expect, it } from 'vitest';
import {
  addDays,
  assertValidWeighIn,
  dailyWeightsKg,
  daysBetween,
  localDateOf,
  minimumDaysFor,
  rollingAverageFromDaily,
  rollingAverageKg,
  weeklyLossFromDaily,
  weeklyLossKg,
  type WeighIn,
} from './trend';

const NZ = 'Pacific/Auckland';

/** A 7:00 am weigh-in in New Zealand (NZDT, UTC+13 from late September). */
const at7am = (date: string, kg: number): WeighIn => ({
  at: new Date(`${addDays(date, -1)}T18:00:00.000Z`).toISOString(),
  timeZone: NZ,
  kg,
});

describe('local dates', () => {
  it('a 7 am NZ weigh-in is on the NZ date, not the UTC date', () => {
    expect(localDateOf('2026-10-18T18:00:00.000Z', NZ)).toBe('2026-10-19');
  });

  it('an 11:30 pm NZ weigh-in stays on that NZ date', () => {
    expect(localDateOf('2026-10-19T10:30:00.000Z', NZ)).toBe('2026-10-19');
  });

  it('calendar arithmetic crosses months, years and daylight-saving changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-09-26', 2)).toBe('2026-09-28'); // NZ clocks go forward 27 Sep 2026
    expect(daysBetween('2026-10-01', '2026-10-22')).toBe(21);
  });

  it('rejects malformed or impossible dates', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addDays('19/10/2026', 1)).toThrow(RangeError);
    expect(() => localDateOf('not a time', NZ)).toThrow(RangeError);
  });
});

describe('rolling averages (WT-05)', () => {
  const week = [
    at7am('2026-10-13', 90.0),
    at7am('2026-10-14', 89.6),
    at7am('2026-10-15', 89.9),
    at7am('2026-10-16', 89.2),
    at7am('2026-10-17', 89.0),
    at7am('2026-10-18', 88.8),
    at7am('2026-10-19', 88.5),
  ];

  it('7-day average matches the hand calculation: 625.0 / 7 = 89.2857', () => {
    expect(rollingAverageKg(week, '2026-10-19', 7)).toBeCloseTo(625 / 7, 10);
  });

  it('two weigh-ins on one day count as that day’s mean, not twice', () => {
    const extra = [...week, { at: '2026-10-19T09:00:00.000Z', timeZone: NZ, kg: 88.7 }];
    expect(dailyWeightsKg(extra).get('2026-10-19')).toBeCloseTo(88.6, 10);
    expect(rollingAverageKg(extra, '2026-10-19', 7)).toBeCloseTo((625 - 88.5 + 88.6) / 7, 10);
  });

  it('needs at least 3 of 7 (or 6 of 14) days with a weigh-in', () => {
    expect(minimumDaysFor(7)).toBe(3);
    expect(minimumDaysFor(14)).toBe(6);
    expect(rollingAverageKg(week.slice(0, 2), '2026-10-19', 7)).toBeNull();
    expect(rollingAverageKg(week.slice(4), '2026-10-19', 7)).toBeCloseTo(
      (89 + 88.8 + 88.5) / 3,
      10,
    );
    expect(rollingAverageKg(week, '2026-10-19', 14)).toBeCloseTo(625 / 7, 10);
    expect(rollingAverageKg(week.slice(2), '2026-10-19', 14)).toBeNull();
  });

  it('ignores weigh-ins after the end date or before the window', () => {
    expect(rollingAverageKg(week, '2026-10-16', 7)).toBeCloseTo((90 + 89.6 + 89.9 + 89.2) / 4, 10);
  });
});

describe('weekly rate', () => {
  it('is the change in the weekly averages per 7 days between the weeks’ centres (positive = loss)', () => {
    const previous = ['2026-10-06', '2026-10-08', '2026-10-10', '2026-10-12'].map((d) =>
      at7am(d, 91),
    );
    const current = ['2026-10-14', '2026-10-16', '2026-10-19'].map((d) => at7am(d, 89.5));
    // The averages differ by 1.5 kg, but the weigh-ins are centred on 9 October and on
    // 16⅓ October, 7⅓ days apart rather than 7, so the rate is 1.5 × 7 ÷ 7⅓ kg per week.
    expect(weeklyLossKg([...previous, ...current], '2026-10-19')).toBeCloseTo(
      (1.5 * 7) / (22 / 3),
      10,
    );
  });

  it('a gain is negative', () => {
    const series = [
      ...['2026-10-06', '2026-10-09', '2026-10-12'].map((d) => at7am(d, 88)),
      ...['2026-10-13', '2026-10-16', '2026-10-19'].map((d) => at7am(d, 89)),
    ];
    expect(weeklyLossKg(series, '2026-10-19')).toBeCloseTo(-1, 10);
  });

  it('is unknown when either week has too few weigh-ins', () => {
    const series = ['2026-10-14', '2026-10-16', '2026-10-19'].map((d) => at7am(d, 89));
    expect(weeklyLossKg(series, '2026-10-19')).toBeNull();
  });

  it('rejects impossible weights', () => {
    expect(() => dailyWeightsKg([at7am('2026-10-19', 5)])).toThrow(RangeError);
  });
});

describe('weekly rate with irregular weigh-ins (HS-11 rapid-loss card)', () => {
  // A steady loss of `perWeek` kg a week from 90 kg over the fortnight ending 13 December 2026.
  // Day 0 is 30 November (first day of the previous week); day 13 is the end date.
  const END = '2026-12-13';
  const steadyLoss = (perWeek: number, days: readonly number[]) =>
    days.map((day) => at7am(addDays('2026-11-30', day), 90 - (perWeek / 7) * day));

  it('a true 1.2 kg/week loss reads 1.2 with readings late in one week and mid-way through the next', () => {
    // Plain difference of the weekly means would say 0.86 (centres 5 days apart, not 7), and the
    // rapid-loss card, which needs more than 1 kg a week, would never appear.
    expect(weeklyLossKg(steadyLoss(1.2, [4, 5, 6, 9, 10, 11]), END)).toBeCloseTo(1.2, 10);
  });

  it('a true 0.7 kg/week loss reads 0.7 with readings at the far ends of the fortnight', () => {
    // Plain difference of the weekly means would say 1.1 (centres 11 days apart), over the
    // 1 kg/week line, so the card would appear wrongly.
    expect(weeklyLossKg(steadyLoss(0.7, [0, 1, 2, 11, 12, 13]), END)).toBeCloseTo(0.7, 10);
  });

  it('daily and Monday/Wednesday/Friday weigh-ins read the true rate too', () => {
    const everyDay = Array.from({ length: 14 }, (_, day) => day);
    expect(weeklyLossKg(steadyLoss(1.2, everyDay), END)).toBeCloseTo(1.2, 10);
    // 30 November 2026 is a Monday.
    expect(weeklyLossKg(steadyLoss(1.2, [0, 2, 4, 7, 9, 11]), END)).toBeCloseTo(1.2, 10);
    expect(weeklyLossKg(steadyLoss(2.5, [1, 3, 6, 8, 10, 13]), END)).toBeCloseTo(2.5, 10);
  });

  it('is unknown when the two weeks’ weigh-ins are centred under 4 days apart', () => {
    // Readings on days 4–6 and 7–9 are centred 3 days apart: too close to measure a weekly rate.
    // (A plain difference of the means would have read a true 1.2 kg/week as 0.51.)
    expect(weeklyLossKg(steadyLoss(1.2, [4, 5, 6, 7, 8, 9]), END)).toBeNull();
    expect(weeklyLossKg(steadyLoss(2, [4, 5, 6, 7, 8, 9]), END)).toBeNull();
    // Days 4–6 and 8–10: centres 4 days apart, the shortest span that gives a rate.
    expect(weeklyLossKg(steadyLoss(1.2, [4, 5, 6, 8, 9, 10]), END)).toBeCloseTo(1.2, 10);
  });
});

describe('precomputed daily weights (one pass for a chart)', () => {
  const series = Array.from({ length: 60 }, (_, i) =>
    at7am(addDays('2026-08-21', i), 95 - i * 0.1 + (i % 3) * 0.2),
  ).filter((_, i) => i % 4 !== 1);

  it('give the same averages and rates as the weigh-in functions', () => {
    const daily = dailyWeightsKg(series);
    for (let back = 0; back < 40; back++) {
      const end = addDays('2026-10-19', -back);
      expect(rollingAverageFromDaily(daily, end, 7)).toBe(rollingAverageKg(series, end, 7));
      expect(rollingAverageFromDaily(daily, end, 14)).toBe(rollingAverageKg(series, end, 14));
      expect(weeklyLossFromDaily(daily, end)).toBe(weeklyLossKg(series, end));
    }
  });

  it('accept a daily map built directly, and reject implausible values in it', () => {
    const daily = new Map([
      ['2026-10-17', 90],
      ['2026-10-18', 89],
      ['2026-10-19', 88],
    ]);
    expect(rollingAverageFromDaily(daily, '2026-10-19', 7)).toBe(89);
    expect(() =>
      rollingAverageFromDaily(new Map([...daily, ['2026-10-16', 5]]), '2026-10-19', 7),
    ).toThrow(RangeError);
  });
});

describe('weigh-in records are checked strictly', () => {
  const good: WeighIn = { at: '2026-10-18T18:00:00.000Z', timeZone: NZ, kg: 88.5 };

  it('accepts an ISO instant with Z or an offset and a real IANA zone', () => {
    expect(() => {
      assertValidWeighIn(good);
    }).not.toThrow();
    expect(() => {
      assertValidWeighIn({ ...good, at: '2026-10-19T07:00+13:00' });
    }).not.toThrow();
    expect(dailyWeightsKg([{ ...good, at: '2026-10-19T07:00+13:00' }]).get('2026-10-19')).toBe(
      88.5,
    );
  });

  it.each([
    { at: '2026-10-19T20:00' }, // datetime-local: no zone, so it would be read in the host's zone
    { at: '10/19/2026' },
    { at: '5' },
    { at: '2026-02-30T07:00:00Z' },
    { timeZone: 'Etc/Unknown' },
    { timeZone: '' },
    { timeZone: 'Pacific/Atlantis' },
    { kg: 0 },
    { kg: Number.NaN },
  ])('refuses %j', (patch) => {
    const record = { ...good, ...patch };
    expect(() => {
      assertValidWeighIn(record);
    }).toThrow(RangeError);
    expect(() => dailyWeightsKg([record])).toThrow(RangeError);
  });
});
