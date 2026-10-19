/**
 * Times and local dates for stored records (storage spec section 3; C21; D5–D9).
 *
 * Event records store a canonical UTC instant and the device zone at that moment. These pure
 * derivations place them on local days. Every record is read in its own recorded zone, through
 * resolveZone, so a zone this browser's time-zone data does not know never throws (D6).
 */
import {
  addDays,
  daysBetween,
  isValidTimeZone,
  type LocalDate,
  localWallClockOf,
} from '../util/time';
import { DRINKING_DAY_CUTOVER_MINUTES } from './limits';
import { type Instant, isTimeZoneName, type TimeZone } from './primitives';

export { localWallClockOf } from '../util/time';

/** The home zone used when nothing better is known (D53). */
export const DEFAULT_HOME_TIME_ZONE = 'Pacific/Auckland';

/**
 * The first candidate this device's Intl recognises, ending with 'UTC'. `fallback` is true when
 * the first candidate was not usable, so the screen can say "Times shown in your home time zone".
 * A record's zone is resolveZone(record.timeZone, settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE).
 */
export function resolveZone(...candidates: readonly (string | null | undefined)[]): {
  timeZone: TimeZone;
  fallback: boolean;
} {
  for (let i = 0; i < candidates.length; i++) {
    const zone = candidates[i];
    if (isTimeZoneName(zone) && isValidTimeZone(zone)) return { timeZone: zone, fallback: i > 0 };
  }
  return { timeZone: 'UTC', fallback: true };
}

function assertCutover(cutoverMinutes: number): void {
  const { min, max } = DRINKING_DAY_CUTOVER_MINUTES;
  if (!Number.isInteger(cutoverMinutes) || cutoverMinutes < min || cutoverMinutes > max) {
    throw new RangeError(
      `The drinking-day cut-over must be a whole number of minutes from ${min} to ${max}`,
    );
  }
}

/**
 * The drinking day of a drink (C21): drinks before the cut-over count toward the previous evening.
 * Works on wall-clock minutes, never by subtracting hours from the instant, so the night clocks go
 * back (02:30 happens twice) and the night they go forward both come out right. With a cut-over of
 * 0 the drinking day is the calendar date. `timeZone` must already be resolved (resolveZone).
 */
export function drinkingDayOf(at: Instant, timeZone: TimeZone, cutoverMinutes: number): LocalDate {
  assertCutover(cutoverMinutes);
  const { date, minutes } = localWallClockOf(at, timeZone);
  return minutes < cutoverMinutes ? addDays(date, -1) : date;
}

/** How many drinking days a change of zone skipped at instant `at` (0 when nothing was skipped). */
export function skippedDrinkingDays(
  at: Instant,
  from: TimeZone,
  to: TimeZone,
  cutoverMinutes: number,
): number {
  return Math.max(
    0,
    daysBetween(drinkingDayOf(at, from, cutoverMinutes), drinkingDayOf(at, to, cutoverMinutes)),
  );
}

/**
 * Two drinking days that both have drinks are consecutive when no day the owner lived through lies
 * between them (D8). A date skipped by crossing the date line westward (Honolulu to Auckland) is
 * absent from the owner's timeline, so it does not break a run (HS-06, C21). A date the owner lived
 * through with nothing logged still breaks it (C21 point 4).
 */
export function areConsecutiveDrinkingDays(
  earlier: { readonly day: LocalDate; readonly timeZone: TimeZone },
  later: { readonly day: LocalDate; readonly firstAt: Instant; readonly timeZone: TimeZone },
  cutoverMinutes: number,
): boolean {
  const gap = daysBetween(earlier.day, later.day);
  return (
    gap >= 1 &&
    gap <= 1 + skippedDrinkingDays(later.firstAt, earlier.timeZone, later.timeZone, cutoverMinutes)
  );
}

/**
 * The UTC instants to query an `at` index with, to find every record whose local date (or
 * drinking day) falls in [from, to]: [from − 2 days at 00:00Z, to + 3 days at 00:00Z), the upper
 * bound exclusive. Two days covers any UTC offset (−12 h to +14 h) plus the largest cut-over
 * (6 h). Filter the results exactly with the derivations above (section 3.6).
 */
export function utcRangeCovering(
  from: LocalDate,
  to: LocalDate,
): { lower: Instant; upper: Instant } {
  return { lower: `${addDays(from, -2)}T00:00:00.000Z`, upper: `${addDays(to, 3)}T00:00:00.000Z` };
}
