import { describe, expect, it } from 'vitest';
import {
  addDays,
  dailyWeightsKg,
  daysBetween,
  localDateOf,
  minimumDaysFor,
  rollingAverageKg,
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
  it('is last week’s 7-day average minus this week’s (positive = loss)', () => {
    const previous = ['2026-10-06', '2026-10-08', '2026-10-10', '2026-10-12'].map((d) =>
      at7am(d, 91),
    );
    const current = ['2026-10-14', '2026-10-16', '2026-10-19'].map((d) => at7am(d, 89.5));
    expect(weeklyLossKg([...previous, ...current], '2026-10-19')).toBeCloseTo(1.5, 10);
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
