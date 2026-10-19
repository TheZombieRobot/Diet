import { describe, expect, it } from 'vitest';
import { formatDayPhrase, formatShortDay } from './format';

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
