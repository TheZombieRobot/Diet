import { describe, expect, it } from 'vitest';
import { localDateOf } from '../util/time';
import {
  areConsecutiveDrinkingDays,
  DEFAULT_HOME_TIME_ZONE,
  drinkingDayOf,
  localWallClockOf,
  resolveZone,
  skippedDrinkingDays,
  utcRangeCovering,
} from './dates';

const AKL = 'Pacific/Auckland';
const CUTOVER = 300;

describe('the drinking day (C21; section 3.3; section 16 test 6)', () => {
  it('drinks before 05:00 count toward the previous evening: 04:59 and 05:00', () => {
    // 2000-01-06 04:59 and 05:00 in Auckland (NZDT, +13).
    expect(drinkingDayOf('2000-01-05T15:59:00.000Z', AKL, CUTOVER)).toBe('2000-01-05');
    expect(drinkingDayOf('2000-01-05T16:00:00.000Z', AKL, CUTOVER)).toBe('2000-01-06');
  });

  it('a 23:30 to 01:30 session falls on one drinking day', () => {
    expect(drinkingDayOf('2000-01-05T10:30:00.000Z', AKL, CUTOVER)).toBe('2000-01-05'); // 23:30
    expect(drinkingDayOf('2000-01-05T12:30:00.000Z', AKL, CUTOVER)).toBe('2000-01-05'); // 01:30
  });

  it('the New Zealand autumn night, 5 April 2026, when 02:30 happens twice: both readings go to 4 April', () => {
    expect(localWallClockOf('2026-04-04T13:30:00.000Z', AKL)).toEqual({
      date: '2026-04-05',
      minutes: 150,
    });
    expect(localWallClockOf('2026-04-04T14:30:00.000Z', AKL)).toEqual({
      date: '2026-04-05',
      minutes: 150,
    });
    expect(drinkingDayOf('2026-04-04T13:30:00.000Z', AKL, CUTOVER)).toBe('2026-04-04');
    expect(drinkingDayOf('2026-04-04T14:30:00.000Z', AKL, CUTOVER)).toBe('2026-04-04');
  });

  it('the cut-over across the skipped hour of 27 September 2026 (clocks go forward at 02:00)', () => {
    expect(drinkingDayOf('2026-09-26T13:59:00.000Z', AKL, CUTOVER)).toBe('2026-09-26'); // 01:59 NZST
    expect(drinkingDayOf('2026-09-26T14:00:00.000Z', AKL, CUTOVER)).toBe('2026-09-26'); // 03:00 NZDT
    expect(drinkingDayOf('2026-09-26T15:59:00.000Z', AKL, CUTOVER)).toBe('2026-09-26'); // 04:59 NZDT
    expect(drinkingDayOf('2026-09-26T16:00:00.000Z', AKL, CUTOVER)).toBe('2026-09-27'); // 05:00 NZDT
  });

  it('cut-overs of 0 (the calendar date) and 360 (06:00)', () => {
    expect(drinkingDayOf('2000-01-05T11:30:00.000Z', AKL, 0)).toBe('2000-01-06'); // 00:30
    expect(drinkingDayOf('2000-01-05T16:59:00.000Z', AKL, 360)).toBe('2000-01-05'); // 05:59
    expect(drinkingDayOf('2000-01-05T17:00:00.000Z', AKL, 360)).toBe('2000-01-06'); // 06:00
    expect(() => drinkingDayOf('2000-01-05T17:00:00.000Z', AKL, 361)).toThrow(RangeError);
    expect(() => drinkingDayOf('2000-01-05T17:00:00.000Z', AKL, 1.5)).toThrow(RangeError);
  });

  it('a drink recorded in Australia/Sydney uses its own zone', () => {
    const at = '2000-01-05T17:30:00.000Z'; // 06:30 in Auckland, 04:30 in Sydney on 6 January
    expect(drinkingDayOf(at, AKL, CUTOVER)).toBe('2000-01-06');
    expect(drinkingDayOf(at, 'Australia/Sydney', CUTOVER)).toBe('2000-01-05');
  });
});

describe('consecutive drinking days across the date line (D8; HS-06)', () => {
  // Monday 3 January 2000, 20:00 in Honolulu (−10), then Wednesday 5 January, 20:00 in Auckland (+13).
  const monday = { day: '2000-01-03', timeZone: 'Pacific/Honolulu' };
  const wednesday = { day: '2000-01-05', firstAt: '2000-01-05T07:00:00.000Z', timeZone: AKL };

  it('flying Honolulu to Auckland skips a drinking day, so Monday and Wednesday are consecutive', () => {
    expect(
      skippedDrinkingDays(wednesday.firstAt, monday.timeZone, wednesday.timeZone, CUTOVER),
    ).toBe(1);
    expect(areConsecutiveDrinkingDays(monday, wednesday, CUTOVER)).toBe(true);
  });

  it('the same gap in one zone is not consecutive: a day lived through with nothing logged breaks the run', () => {
    expect(
      areConsecutiveDrinkingDays({ day: '2000-01-03', timeZone: AKL }, wednesday, CUTOVER),
    ).toBe(false);
  });

  it('adjacent days are consecutive, the same day is not', () => {
    expect(
      areConsecutiveDrinkingDays({ day: '2000-01-04', timeZone: AKL }, wednesday, CUTOVER),
    ).toBe(true);
    expect(
      areConsecutiveDrinkingDays({ day: '2000-01-05', timeZone: AKL }, wednesday, CUTOVER),
    ).toBe(false);
    expect(skippedDrinkingDays(wednesday.firstAt, AKL, 'Pacific/Honolulu', CUTOVER)).toBe(0);
  });
});

describe('range queries (section 3.6)', () => {
  it('[from − 2 days, to + 3 days) at 00:00Z', () => {
    expect(utcRangeCovering('2000-01-05', '2000-01-06')).toEqual({
      lower: '2000-01-03T00:00:00.000Z',
      upper: '2000-01-09T00:00:00.000Z',
    });
  });

  it('includes every record whose local date or drinking day is in range, at +14 (Kiritimati) and −11 (Pago Pago)', () => {
    const from = '2000-01-05';
    const to = '2000-01-06';
    const { lower, upper } = utcRangeCovering(from, to);
    const start = Date.parse('2000-01-01T00:00:00.000Z');
    for (let ms = start; ms < start + 10 * 86_400_000; ms += 15 * 60_000) {
      const at = new Date(ms).toISOString();
      for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
        const days = [
          localDateOf(at, zone),
          drinkingDayOf(at, zone, 0),
          drinkingDayOf(at, zone, 360),
        ];
        if (days.some((d) => d >= from && d <= to)) {
          expect(at >= lower && at < upper, `${at} in ${zone}`).toBe(true);
        }
      }
    }
  });
});

describe('zones when reading (section 3.4; D6)', () => {
  it('falls back to the home zone, then Auckland, then UTC, saying so', () => {
    expect(resolveZone('Australia/Sydney', AKL)).toEqual({
      timeZone: 'Australia/Sydney',
      fallback: false,
    });
    expect(resolveZone('Example/Nowhere', 'Australia/Sydney', DEFAULT_HOME_TIME_ZONE)).toEqual({
      timeZone: 'Australia/Sydney',
      fallback: true,
    });
    expect(resolveZone('Example/Nowhere', 'Etc/Unknown', DEFAULT_HOME_TIME_ZONE)).toEqual({
      timeZone: AKL,
      fallback: true,
    });
    expect(resolveZone('Example/Nowhere', null, undefined)).toEqual({
      timeZone: 'UTC',
      fallback: true,
    });
    expect(resolveZone()).toEqual({ timeZone: 'UTC', fallback: true });
    expect(resolveZone('UTC')).toEqual({ timeZone: 'UTC', fallback: false });
  });
});
