import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertValidTimeZone,
  deviceTimeZone,
  isoWeekdayOf,
  isValidTimeZone,
  localDateOf,
  parseInstant,
  parseLocalDate,
  weekStartOf,
  zonedWallTimeToInstant,
} from './time';

const NZ = 'Pacific/Auckland';
const iso = (ms: number) => new Date(ms).toISOString();
const minutes = (clock: string) => {
  const [h = 0, m = 0] = clock.split(':').map(Number);
  return h * 60 + m;
};

describe('strict ISO 8601 instants', () => {
  it.each([
    ['2026-10-18T18:00:00.000Z', '2026-10-18T18:00:00.000Z'],
    ['2026-10-18T18:00Z', '2026-10-18T18:00:00.000Z'],
    ['2026-10-19T07:00+13:00', '2026-10-18T18:00:00.000Z'],
    ['2026-10-18T10:00-08:00', '2026-10-18T18:00:00.000Z'],
    ['2026-10-18T18:00:00.5Z', '2026-10-18T18:00:00.500Z'],
  ])('reads %s as %s', (at, expected) => {
    expect(iso(parseInstant(at))).toBe(expected);
  });

  it.each([
    '2026-10-19T20:00', // what <input type="datetime-local"> gives: no zone, so refused
    '10/19/2026',
    '5',
    '',
    '2026-10-19 18:30Z',
    '2026-10-19T18:30:00.0000Z',
    '2026-10-19T18:30+1300',
    '2026-02-30T07:00Z',
    '2026-10-19T24:00Z',
    '2026-10-19T18:60Z',
    '2026-10-19T18:30:60Z',
    '2026-10-19T18:30+24:00',
  ])('refuses %j', (at) => {
    expect(() => parseInstant(at)).toThrow(RangeError);
  });

  it('refuses dates that do not exist', () => {
    expect(() => parseLocalDate('2026-02-29')).toThrow(RangeError);
    expect(parseLocalDate('2028-02-29')).toBe(Date.UTC(2028, 1, 29));
  });
});

describe('ISO weeks (Monday first)', () => {
  it.each([
    ['2000-01-03', 1, '2000-01-03'],
    ['2000-01-09', 7, '2000-01-03'],
    ['2000-01-17', 1, '2000-01-17'],
  ])('%s is ISO weekday %i in the week starting %s', (date, weekday, monday) => {
    expect(isoWeekdayOf(date)).toBe(weekday);
    expect(weekStartOf(date)).toBe(monday);
  });
});

describe('time zones', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts IANA zones and refuses anything else', () => {
    expect(isValidTimeZone(NZ)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    for (const bad of ['Foo/Bar', 'Etc/Unknown', '', ' ', undefined, null, 13]) {
      expect(isValidTimeZone(bad)).toBe(false);
      expect(() => {
        assertValidTimeZone(bad);
      }).toThrow(RangeError);
    }
  });

  it('never falls back to the host zone when a record has no usable zone', () => {
    expect(() => localDateOf('2026-10-18T18:00:00.000Z', '')).toThrow(RangeError);
    expect(() => localDateOf('2026-10-18T18:00:00.000Z', 'Etc/Unknown')).toThrow(RangeError);
    expect(() => localDateOf('2026-10-18T18:00:00.000Z', undefined as unknown as string)).toThrow(
      RangeError,
    );
  });

  it('deviceTimeZone gives the zone Intl reports when it is usable', () => {
    const real = new Intl.DateTimeFormat().resolvedOptions();
    const host = real.timeZone as string | undefined;
    expect(deviceTimeZone(NZ)).toBe(isValidTimeZone(host) ? host : NZ);
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...real,
      timeZone: 'Europe/London',
    });
    expect(deviceTimeZone(NZ)).toBe('Europe/London');
  });

  it.each([undefined, 'Etc/Unknown', ''])(
    'deviceTimeZone falls back when Intl reports %j',
    (reported) => {
      const real = new Intl.DateTimeFormat().resolvedOptions();
      vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
        ...real,
        timeZone: reported as string,
      });
      expect(deviceTimeZone(NZ)).toBe(NZ);
    },
  );

  it('deviceTimeZone refuses an unusable fallback', () => {
    expect(() => deviceTimeZone('Not/AZone')).toThrow(RangeError);
  });
});

describe('local wall-clock time to an instant', () => {
  it('converts an ordinary time with the zone offset (NZDT, UTC+13)', () => {
    expect(iso(zonedWallTimeToInstant('2026-10-19', minutes('07:00'), NZ))).toBe(
      '2026-10-18T18:00:00.000Z',
    );
    expect(iso(zonedWallTimeToInstant('2026-07-01', minutes('07:00'), NZ))).toBe(
      '2026-06-30T19:00:00.000Z',
    );
  });

  it('a time that happens twice when clocks go back resolves to the earlier instant', () => {
    // New Zealand, 5 April 2026: 03:00 NZDT becomes 02:00 NZST, so 02:30 happens twice.
    expect(iso(zonedWallTimeToInstant('2026-04-05', minutes('02:30'), NZ))).toBe(
      '2026-04-04T13:30:00.000Z',
    );
    // Los Angeles, 1 November 2026: 01:30 happens twice; the earlier is PDT (UTC-7).
    expect(iso(zonedWallTimeToInstant('2026-11-01', minutes('01:30'), 'America/Los_Angeles'))).toBe(
      '2026-11-01T08:30:00.000Z',
    );
  });

  it('a time skipped when clocks go forward moves to the first valid minute', () => {
    // New Zealand, 27 September 2026: 02:00 NZST becomes 03:00 NZDT.
    for (const skipped of ['02:00', '02:30', '02:59']) {
      expect(iso(zonedWallTimeToInstant('2026-09-27', minutes(skipped), NZ))).toBe(
        '2026-09-26T14:00:00.000Z',
      );
    }
    expect(iso(zonedWallTimeToInstant('2026-09-27', minutes('03:00'), NZ))).toBe(
      '2026-09-26T14:00:00.000Z',
    );
    expect(iso(zonedWallTimeToInstant('2026-09-27', minutes('01:59'), NZ))).toBe(
      '2026-09-26T13:59:00.000Z',
    );
    // Los Angeles, 8 March 2026: 02:00 PST becomes 03:00 PDT.
    expect(iso(zonedWallTimeToInstant('2026-03-08', minutes('02:30'), 'America/Los_Angeles'))).toBe(
      '2026-03-08T10:00:00.000Z',
    );
  });

  it('refuses minutes outside one day and invalid zones or dates', () => {
    expect(() => zonedWallTimeToInstant('2026-10-19', 1440, NZ)).toThrow(RangeError);
    expect(() => zonedWallTimeToInstant('2026-10-19', -1, NZ)).toThrow(RangeError);
    expect(() => zonedWallTimeToInstant('2026-10-19', 0.5, NZ)).toThrow(RangeError);
    expect(() => zonedWallTimeToInstant('2026-10-19', 0, 'Foo/Bar')).toThrow(RangeError);
    expect(() => zonedWallTimeToInstant('2026-13-01', 0, NZ)).toThrow(RangeError);
  });
});
