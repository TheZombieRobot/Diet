import { describe, expect, it } from 'vitest';
import {
  formatDayPhrase,
  formatMeasure,
  formatShortDay,
  formatSteps,
  formatTodayHeading,
  formatWaterMl,
  formatWaterText,
} from './format';

describe("Today's figures (item 16; U12)", () => {
  it('the heading is weekday, day and month with no comma, in the device zone', () => {
    // 2:20 pm NZDT on Wednesday 15 March 2000.
    expect(formatTodayHeading('2000-03-15T01:20:00.000Z', 'Pacific/Auckland')).toBe(
      'Wednesday 15 March',
    );
    expect(formatTodayHeading('2000-03-15T01:20:00.000Z', 'Europe/London')).toBe(
      'Wednesday 15 March',
    );
    expect(formatTodayHeading('2000-03-14T11:30:00.000Z', 'Pacific/Auckland')).toBe(
      'Wednesday 15 March',
    );
  });

  it('water in mL under a litre, then in litres with at most two decimals; steps grouped', () => {
    expect(formatWaterMl(250)).toEqual({ value: '250', unit: 'mL' });
    expect(formatWaterMl(1000)).toEqual({ value: '1', unit: 'L' });
    expect(formatWaterMl(1250)).toEqual({ value: '1.25', unit: 'L' });
    expect(formatWaterText(2250)).toBe('2.25 L');
    expect(formatSteps(12000)).toBe('12,000');
  });
});

describe('short dates for the fasting history and the reflux log (item 15)', () => {
  it('"Tue 4 Jan" in the record zone, with no comma whatever the device inserts', () => {
    // 21:40 on Tuesday 4 January 2000 in Auckland is 08:40Z.
    expect(formatShortDay('2000-01-04T08:40:00.000Z', 'Pacific/Auckland')).toBe('Tue 4 Jan');
    expect(formatShortDay('2000-01-04T08:40:00.000Z', 'Europe/London')).toBe('Tue 4 Jan');
    expect(formatShortDay('2000-01-04T08:40:00.000Z', 'Mars/Base')).toBe('Tue 4 Jan');
    expect(formatShortDay('2000-01-04T12:00:00.000Z', 'Pacific/Auckland')).toBe('Wed 5 Jan');
  });

  it('today, yesterday, tomorrow, a weekday within 6 days back, and the date beyond', () => {
    const today = '2000-01-10';
    expect(formatDayPhrase('2000-01-10', today)).toBe('today');
    expect(formatDayPhrase('2000-01-09', today)).toBe('yesterday');
    expect(formatDayPhrase('2000-01-11', today)).toBe('tomorrow');
    expect(formatDayPhrase('2000-01-04', today)).toBe('Tuesday');
    expect(formatDayPhrase('2000-01-03', today)).toBe('3 January');
    expect(formatDayPhrase('2000-01-13', today)).toBe('13 January');
  });
});

describe('drink sizes and strengths (item 28; full review F7)', () => {
  it('show every decimal stored, so 4.75% never reads 4.8%', () => {
    expect([4.75, 0.05, 330.25, 330, 4.5].map(formatMeasure)).toEqual([
      '4.75',
      '0.05',
      '330.25',
      '330',
      '4.5',
    ]);
  });
});
