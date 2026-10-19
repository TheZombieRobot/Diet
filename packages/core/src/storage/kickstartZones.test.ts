import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, localDateOf, zonedWallTimeToInstant } from '../util/time';
import { defaultSnapshot } from './defaults';
import { findInvariantViolation } from './invariants';
import {
  canStartKickstart,
  effectiveDays,
  kickstartPeriodState,
  kickstartRunningAt,
  kickstartUsage,
  periodDay1,
  scheduledLastDay,
} from './kickstart';
import { KICKSTART_DAYS, KICKSTART_EXTENSION_DAYS, KICKSTART_MAX_TOTAL_DAYS } from './limits';
import type { KickstartPeriodRecord, Snapshot } from './records';

// Kickstart day counts across time zones (section 4.5; D27; health-rules review finding 0). A period
// that starts in one zone and ends in another must never count zero or negative days, and no mix
// of zones may let the 42-day cap or the "a full 21 days must fit" rule be passed in real time.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** From UTC+14 to UTC−12, with half- and quarter-hour offsets and zones that change for daylight saving. */
const ZONES = [
  'Pacific/Kiritimati',
  'Pacific/Chatham',
  'Pacific/Auckland',
  'Australia/Sydney',
  'Asia/Kolkata',
  'UTC',
  'Europe/London',
  'America/St_Johns',
  'America/New_York',
  'Pacific/Honolulu',
  'Pacific/Pago_Pago',
  'Etc/GMT+12',
] as const;

/** Start instants across the day, and on daylight-saving change nights (NZ, US, UK). */
const STARTS = [
  '2000-03-01T00:00:00.000Z',
  '2000-03-01T10:00:00.000Z',
  '2000-03-01T10:59:00.000Z',
  '2000-03-01T23:30:00.000Z',
  '2026-04-04T13:30:00.000Z',
  '2026-09-26T14:30:00.000Z',
  '2026-03-08T06:30:00.000Z',
  '2026-03-29T00:30:00.000Z',
];

const DURATIONS = [
  MINUTE,
  59 * MINUTE,
  11 * HOUR,
  DAY - MINUTE,
  DAY,
  DAY + HOUR,
  2 * DAY - MINUTE,
  3 * DAY,
  10 * DAY + 5 * HOUR,
  20 * DAY + 23 * HOUR,
  21 * DAY,
  21 * DAY + 12 * HOUR,
  28 * DAY - MINUTE,
  35 * DAY,
  42 * DAY,
];

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const iso = (ms: number) => new Date(ms).toISOString();

function endedPeriod(
  n: number,
  startedAt: string,
  startZone: string,
  endedAt: string | null,
  endZone: string | null,
): KickstartPeriodRecord {
  return {
    id: id(n),
    startedAt,
    timeZone: startZone,
    endedAt,
    endedTimeZone: endedAt === null ? null : endZone,
    endReason: endedAt === null ? null : 'user-ended',
  };
}

describe('Kickstart days over every pair of start and end zones (D27)', () => {
  it('a period started in Kiritimati and ended a minute later in Pago Pago counts 1 day', () => {
    const p = endedPeriod(
      1,
      '2000-01-01T10:00:00.000Z',
      'Pacific/Kiritimati',
      '2000-01-01T10:01:00.000Z',
      'Pacific/Pago_Pago',
    );
    expect(effectiveDays(p, 0)).toBe(1);
  });

  it('is never below 1, never above the scheduled length, never fewer than the calendar days that passed in the start zone, and covers the real time', () => {
    // 34,560 cases: failures are collected and compared once, so the test stays quick.
    let checked = 0;
    const failures: string[] = [];
    for (const startZone of ZONES) {
      for (const endZone of ZONES) {
        for (const start of STARTS) {
          for (const duration of DURATIONS) {
            for (const extensions of [0, 3]) {
              const endedAt = iso(Date.parse(start) + duration);
              const p = endedPeriod(1, start, startZone, endedAt, endZone);
              const days = effectiveDays(p, extensions);
              const scheduled = KICKSTART_DAYS + KICKSTART_EXTENSION_DAYS * extensions;
              const passed = daysBetween(periodDay1(p), localDateOf(endedAt, startZone)) + 1;
              const problems = [
                days < 1 && 'below 1',
                days > scheduled && 'above the scheduled length',
                days < Math.min(passed, scheduled) && 'fewer than the start-zone days passed',
                // Within the scheduled phase, the counted days cover the real time (one hour of
                // slack for a daylight-saving night).
                passed <= scheduled && duration >= days * DAY + HOUR && 'short of the real time',
              ].filter((x): x is string => x !== false);
              if (problems.length > 0) {
                failures.push(
                  `${startZone} → ${endZone}, ${start} + ${String(duration / MINUTE)} min, ${String(extensions)} extensions: ${String(days)} days, ${problems.join(', ')}`,
                );
              }
              checked += 1;
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBe(ZONES.length * ZONES.length * STARTS.length * DURATIONS.length * 2);
    // About 3 s alone; more while the other test files run beside it.
  }, 60_000);

  it('switching zones between periods never lets Kickstart run past 42 real days, or start a new period with more than 21 real days used', () => {
    // A seeded walk (mulberry32): periods started near local midnight and ended in other zones,
    // weighted toward the widest gap (start in UTC+14, end in UTC−11 or −12) and toward ends just
    // after the scheduled phase, each refused exactly as the kickstart repository refuses it.
    let seed = 20001019;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
    const base: Snapshot = defaultSnapshot({
      now: '2000-01-01T00:00:00.000Z',
      randomId: () => id(99_999),
    });
    for (let walk = 0; walk < 40; walk++) {
      const periods: KickstartPeriodRecord[] = [];
      let now = Date.parse('2000-03-01T00:00:00.000Z') + Math.floor(random() * DAY);
      const east = (): string => (random() < 0.5 ? 'Pacific/Kiritimati' : pick(ZONES));
      const west = (): string =>
        random() < 0.5 ? pick(['Pacific/Pago_Pago', 'Etc/GMT+12']) : pick(ZONES);
      let realMs = 0;
      for (let step = 0; step < 60; step++) {
        const startZone = east();
        // Just after the start zone's local midnight.
        now =
          zonedWallTimeToInstant(localDateOf(iso(now), startZone), 0, startZone) +
          DAY +
          Math.floor(random() * 2 * HOUR);
        const candidate = endedPeriod(100 + step, iso(now), startZone, null, null);
        const usage = kickstartUsage(periods, []);
        const refused =
          !canStartKickstart(usage) ||
          findInvariantViolation({ ...base, kickstart_periods: [...periods, candidate] }) !== null;
        if (refused) {
          now += Math.floor(random() * 2 * DAY) + MINUTE;
          continue;
        }
        // The full-21-days rule in real time: at most 21 days (plus an hour of slack per period).
        expect(realMs, `walk ${String(walk)}`).toBeLessThanOrEqual(
          (KICKSTART_MAX_TOTAL_DAYS - KICKSTART_DAYS) * DAY + periods.length * HOUR,
        );
        const endZone = west();
        const duration = pick([
          MINUTE,
          HOUR,
          13 * HOUR,
          DAY + HOUR,
          9 * DAY,
          20 * DAY + 23 * HOUR,
          21 * DAY + 12 * HOUR,
          22 * DAY,
        ]);
        const endAt = now + duration;
        // The repository ends a period only before its scheduled last day ends in the device zone
        // (the end zone) and in its own start zone (running there, or not yet started in the
        // device zone); otherwise it ran to its natural end.
        const ended = endedPeriod(100 + step, iso(now), startZone, iso(endAt), endZone);
        const state = kickstartPeriodState(candidate, 0, iso(endAt), endZone);
        const endable =
          (state === 'running' || state === 'not-started') &&
          findInvariantViolation({ ...base, kickstart_periods: [...periods, ended] }) === null;
        const kept = endable ? ended : candidate;
        periods.push(kept);
        // A natural end is the start zone's midnight after the scheduled last day.
        const naturalEnd = zonedWallTimeToInstant(
          addDays(scheduledLastDay(candidate, 0), 1),
          0,
          startZone,
        );
        const stop = endable ? endAt : naturalEnd;
        realMs += stop - now;
        now = Math.max(stop, endAt) + Math.floor(random() * 2 * DAY) + MINUTE;
        expect(kickstartUsage(periods, []).days, `walk ${String(walk)}`).toBeLessThanOrEqual(
          KICKSTART_MAX_TOTAL_DAYS,
        );
        expect(realMs, `walk ${String(walk)}`).toBeLessThanOrEqual(
          KICKSTART_MAX_TOTAL_DAYS * DAY + periods.length * HOUR,
        );
      }
    }
  });
});

describe('kickstartPeriodState: where a period stands at an instant (item 14 reads this)', () => {
  // Day 1 is 10 January in Auckland (UTC+13 in summer): 2000-01-09T19:00Z.
  const start = endedPeriod(1, '2000-01-09T19:00:00.000Z', 'Pacific/Auckland', null, null);
  const state = (at: string, zone = 'Pacific/Auckland') => kickstartPeriodState(start, 0, at, zone);

  it('is not started before day 1, running from day 1 to the scheduled last day, then past it', () => {
    expect(state('2000-01-09T10:00:00.000Z')).toBe('not-started');
    expect(state('2000-01-09T11:00:00.000Z')).toBe('running');
    // Day 21 is 30 January; its last minute in Auckland is 2000-01-30T10:59Z.
    expect(state('2000-01-30T10:59:00.000Z')).toBe('running');
    expect(state('2000-01-30T11:00:00.000Z')).toBe('past-last-day');
    expect(kickstartRunningAt(start, 0, '2000-01-09T10:00:00.000Z', 'Pacific/Auckland')).toBe(
      false,
    );
  });

  it('a start dated ahead (a clock that ran ahead, or a file) is not running, so nothing is counted as Kickstart yet', () => {
    const ahead = endedPeriod(2, '2000-06-01T00:00:00.000Z', 'UTC', null, null);
    expect(kickstartPeriodState(ahead, 0, '2000-03-01T00:00:00.000Z', 'UTC')).toBe('not-started');
    expect(kickstartRunningAt(ahead, 0, '2000-03-01T00:00:00.000Z', 'UTC')).toBe(false);
  });

  it('day 1 must have arrived both in the device zone and in the start zone', () => {
    // Started at 00:30 on 10 January in Kiritimati (UTC+14): still 8 January in Pago Pago.
    const east = endedPeriod(3, '2000-01-09T10:30:00.000Z', 'Pacific/Kiritimati', null, null);
    expect(kickstartPeriodState(east, 0, '2000-01-09T11:00:00.000Z', 'Pacific/Pago_Pago')).toBe(
      'not-started',
    );
    expect(kickstartPeriodState(east, 0, '2000-01-09T11:00:00.000Z', 'Pacific/Kiritimati')).toBe(
      'running',
    );
  });

  it('an early end is ended, whatever the instant', () => {
    const ended = endedPeriod(
      4,
      '2000-01-09T19:00:00.000Z',
      'Pacific/Auckland',
      '2000-01-12T00:00:00.000Z',
      'Pacific/Auckland',
    );
    for (const at of [
      '2000-01-01T00:00:00.000Z',
      '2000-01-10T00:00:00.000Z',
      '2001-01-01T00:00:00.000Z',
    ]) {
      expect(kickstartPeriodState(ended, 0, at, 'UTC')).toBe('ended');
    }
  });
});
