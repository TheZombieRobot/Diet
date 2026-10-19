import { describe, expect, it } from 'vitest';
import { zonedWallTimeToInstant } from '../util/time';
import { parseClockTime } from './eatingWindow';
import type { FastTimes } from './fastState';
import { fastingStreak } from './streak';

const NZ = 'Pacific/Auckland';
const at = (date: string, time: string): number =>
  zonedWallTimeToInstant(date, parseClockTime(time), NZ);
const iso = (ms: number): string => new Date(ms).toISOString();
let ids = 0;
const fast = (
  start: [string, string],
  end: [string, string] | null,
  zones: { start?: string; end?: string } = {},
): FastTimes => ({
  id: `f${String(++ids)}`,
  startedAt: iso(at(...start)),
  endedAt: end === null ? null : iso(at(...end)),
  timeZone: zones.start ?? NZ,
  endedTimeZone: end === null ? null : (zones.end ?? NZ),
});
/** A 23-hour fast from 19:00 the day before `date` to 18:00 on `date`. */
const dayFast = (previous: string, date: string): FastTimes =>
  fast([previous, '19:00'], [date, '18:00']);
const streak = (fasts: readonly FastTimes[], today: string) => fastingStreak(fasts, today, NZ);

const THREE_DAYS = [
  dayFast('2000-01-01', '2000-01-02'),
  dayFast('2000-01-02', '2000-01-03'),
  dayFast('2000-01-03', '2000-01-04'),
];

describe('the fasting streak (FS-02, FS-07, HS-02, C63)', () => {
  it('counts three days in a row with a completed fast', () => {
    expect(streak(THREE_DAYS, '2000-01-04')).toBe(3);
  });

  it('a shorter fast (an accepted 5 pm snack or a widened window) still counts', () => {
    const snackDay = fast(['2000-01-04', '19:00'], ['2000-01-05', '17:00']);
    expect(streak([...THREE_DAYS, snackDay], '2000-01-05')).toBe(4);
  });

  it('exactly 24:00:00 counts; 24 h 1 min and 25 h neither count nor reset', () => {
    const exact = fast(['2000-01-04', '19:00'], ['2000-01-05', '19:00']);
    expect(streak([...THREE_DAYS, exact], '2000-01-05')).toBe(4);
    const over = fast(['2000-01-04', '19:00'], ['2000-01-05', '19:01']);
    expect(streak([...THREE_DAYS, over], '2000-01-05')).toBe(3);
    const longer = fast(['2000-01-04', '19:00'], ['2000-01-05', '20:00']);
    expect(streak([...THREE_DAYS, longer], '2000-01-05')).toBe(3);
  });

  it('a single 36-hour fast neither adds nor resets: its dates are neutral', () => {
    const long = fast(['2000-01-04', '20:00'], ['2000-01-06', '08:00']);
    expect(streak([...THREE_DAYS, long], '2000-01-06')).toBe(3);
    expect(streak([...THREE_DAYS, long], '2000-01-07')).toBe(3);
  });

  it('the same 36 hours split by a 1-minute gap is one over-24 span: no credit, neutral', () => {
    const first = fast(['2000-01-04', '20:00'], ['2000-01-05', '18:00']);
    const second = fast(['2000-01-05', '18:01'], ['2000-01-06', '08:00']);
    expect(streak([...THREE_DAYS, first, second], '2000-01-06')).toBe(3);
  });

  it('two fasts 61 minutes apart are separate spans, each credited', () => {
    const first = fast(['2000-01-04', '19:00'], ['2000-01-05', '06:00']);
    const second = fast(['2000-01-05', '07:01'], ['2000-01-06', '06:00']);
    expect(streak([...THREE_DAYS, first, second], '2000-01-06')).toBe(5);
  });

  it('a fast still running on its second day leaves the count unchanged', () => {
    const running = fast(['2000-01-04', '19:00'], null);
    expect(streak([...THREE_DAYS, running], '2000-01-05')).toBe(3);
    expect(streak([...THREE_DAYS, running], '2000-01-06')).toBe(3);
  });

  it('a day with no fast restarts the count silently, and today without a fast yet keeps yesterday', () => {
    expect(streak(THREE_DAYS, '2000-01-05')).toBe(3);
    expect(streak(THREE_DAYS, '2000-01-06')).toBe(0);
    const gap = [dayFast('2000-01-01', '2000-01-02'), dayFast('2000-01-03', '2000-01-04')];
    expect(streak(gap, '2000-01-04')).toBe(1);
  });

  it('a credited date that is also neutral counts; two fasts on one day count once', () => {
    const long = fast(['2000-01-04', '20:00'], ['2000-01-06', '08:00']);
    const sameDayAsLongEnd = fast(['2000-01-06', '09:00'], ['2000-01-06', '12:00']);
    expect(streak([...THREE_DAYS, long, sameDayAsLongEnd], '2000-01-06')).toBe(4);
    const evening = fast(['2000-01-04', '19:30'], ['2000-01-04', '23:00']);
    expect(streak([...THREE_DAYS, evening], '2000-01-04')).toBe(3);
  });

  it('a fast ending after midnight credits its end date, read in its end zone (unknown zones fall back home)', () => {
    const afterMidnight = fast(['2000-01-04', '19:00'], ['2000-01-05', '00:30']);
    expect(streak([...THREE_DAYS, afterMidnight], '2000-01-05')).toBe(4);
    // 00:30 in Auckland is still the 4th in Sydney (2 hours behind in January).
    const sydney = fast(['2000-01-04', '19:00'], ['2000-01-05', '00:30'], {
      end: 'Australia/Sydney',
    });
    expect(streak([dayFast('2000-01-02', '2000-01-03'), sydney], '2000-01-04')).toBe(2);
    const unknown = fast(['2000-01-04', '19:00'], ['2000-01-05', '00:30'], { end: 'Mars/Base' });
    expect(streak([...THREE_DAYS, unknown], '2000-01-05')).toBe(4);
  });
});
