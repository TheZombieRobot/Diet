import { describe, expect, it } from 'vitest';
import { MAX_PLANNED_FAST_HOURS } from './eatingWindow';
import {
  dayBarSegments,
  describeEatingWindow,
  formatClockRange,
  formatClockTime,
  formatDuration,
  formatElapsed,
  patternPill,
} from './windowText';

describe('window text from the formatter (U26; FL-08, FL-09, FL-14, NN-02, HS-17, C101)', () => {
  it('FL-08: 17:00–19:00 is 2 hours of eating and 22 of fasting, not 4', () => {
    const d = describeEatingWindow({ start: '17:00', end: '19:00' });
    expect([d.eatingMinutes, d.fastingMinutes, d.ratio]).toEqual([120, 1320, '22:2']);
    expect(d.summary).toBe('Eating 5:00 pm to 7:00 pm = 2 hours. Fasting 22 hours.');
    expect(d.short).toBe('2 h eating, 22 h fasting');
  });

  it('FL-14: 18:00–19:00 is 1 hour and 23 hours, under the 24-hour ceiling', () => {
    const d = describeEatingWindow({ start: '18:00', end: '19:00' });
    expect([d.eatingMinutes, d.fastingMinutes]).toEqual([60, 1380]);
    expect(d.summary).toBe('Eating 6:00 pm to 7:00 pm = 1 hour. Fasting 23 hours.');
    expect(d.short).toBe('1 h eating, 23 h fasting');
    expect(d.fastingMinutes).toBeLessThan(MAX_PLANNED_FAST_HOURS * 60);
  });

  it('FL-09: a window past midnight wraps; part hours read in hours and minutes', () => {
    expect(describeEatingWindow({ start: '22:00', end: '02:00' }).summary).toBe(
      'Eating 10:00 pm to 2:00 am = 4 hours. Fasting 20 hours.',
    );
    const d = describeEatingWindow({ start: '17:30', end: '19:00' });
    expect(d.summary).toBe(
      'Eating 5:30 pm to 7:00 pm = 1 hour 30 minutes. Fasting 22 hours 30 minutes.',
    );
    expect(d.ratio).toBeNull();
  });

  it('12-hour clock times without Intl', () => {
    const table = {
      '00:00': '12:00 am',
      '00:05': '12:05 am',
      '11:59': '11:59 am',
      '12:00': '12:00 pm',
      '12:30': '12:30 pm',
      '13:00': '1:00 pm',
      '23:59': '11:59 pm',
    };
    for (const [time, text] of Object.entries(table)) expect(formatClockTime(time)).toBe(text);
  });

  it('durations in both styles', () => {
    const cases: [number, string, string][] = [
      [1, '1 minute', '1 m'],
      [45, '45 minutes', '45 m'],
      [60, '1 hour', '1 h'],
      [90, '1 hour 30 minutes', '1 h 30 m'],
      [1439, '23 hours 59 minutes', '23 h 59 m'],
      [1440, '24 hours', '24 h'],
    ];
    for (const [minutes, long, short] of cases) {
      expect(formatDuration(minutes, 'long')).toBe(long);
      expect(formatDuration(minutes, 'short')).toBe(short);
    }
    expect(() => formatDuration(0, 'long')).toThrow(RangeError);
    expect(() => formatDuration(1441, 'short')).toThrow(RangeError);
  });

  it('the day bar: one segment, or two when the window wraps midnight', () => {
    expect(dayBarSegments({ start: '18:00', end: '19:00' })).toEqual([
      { startPct: 75, widthPct: (60 / 1440) * 100 },
    ]);
    const wrapped = dayBarSegments({ start: '22:00', end: '02:00' });
    expect(wrapped).toHaveLength(2);
    expect(wrapped[0]?.startPct).toBeCloseTo(91.6667, 3);
    expect(wrapped[0]?.widthPct).toBeCloseTo(8.3333, 3);
    expect(wrapped[1]).toEqual({ startPct: 0, widthPct: (120 / 1440) * 100 });
  });
});

describe('ranges, elapsed time and the pattern pill (item 15 design 4.1; HS-17, C55)', () => {
  it('a range is both ends in full with an en dash', () => {
    expect(formatClockRange('18:00', '19:00')).toBe('6:00 pm – 7:00 pm');
    expect(formatClockRange('11:00', '19:00')).toBe('11:00 am – 7:00 pm');
    expect(formatClockRange('22:00', '02:00')).toBe('10:00 pm – 2:00 am');
  });

  it('elapsed time in whole minutes, rounded down, of any length, in both styles', () => {
    const MIN = 60_000;
    const cases: [number, string, string][] = [
      [0, '0 h 0 m', '0 m'],
      [45 * MIN + 59_999, '0 h 45 m', '45 m'],
      [120 * MIN, '2 h 0 m', '2 h'],
      [(19 * 60 + 20) * MIN, '19 h 20 m', '19 h 20 m'],
      [(24 * 60 + 1) * MIN, '24 h 1 m', '24 h 1 m'],
      [(49 * 60 + 10) * MIN, '49 h 10 m', '49 h 10 m'],
    ];
    for (const [ms, figure, text] of cases) {
      expect(formatElapsed(ms, 'figure')).toBe(figure);
      expect(formatElapsed(ms, 'text')).toBe(text);
    }
    expect(() => formatElapsed(-1, 'text')).toThrow(RangeError);
    expect(() => formatElapsed(Number.NaN, 'figure')).toThrow(RangeError);
  });

  it('the pill comes from the clock times, never the preset id (C55)', () => {
    const table: [string, string, string][] = [
      ['18:00', '19:00', '23:1 · One meal'],
      ['17:30', '18:30', '23:1 · One meal'],
      ['17:00', '19:00', '22:2 · 5 pm snack + dinner'],
      ['18:00', '20:00', '22:2'],
      ['11:00', '19:00', '16:8'],
      ['17:30', '19:00', 'Custom times'],
    ];
    for (const [start, end, pill] of table) expect(patternPill({ start, end }), start).toBe(pill);
  });
});
