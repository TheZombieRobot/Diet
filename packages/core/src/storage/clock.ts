/**
 * The phone's clock against the records (storage spec sections 3.1 and 8.2; D27; the health-rules
 * review). A clock can be wrong: set back after a flat battery, or ahead and then corrected. Pure.
 *
 * - clockHighWater(tables): the newest instant already stored, computed when needed (no stored
 *   field). The Kickstart repository refuses to start a period or record a check while now is
 *   earlier than it by more than FUTURE_INSTANT_TOLERANCE_MS (isClockBehind), and ends a period no
 *   earlier than it, so a clock set back can never make lived Kickstart days count as fewer.
 * - elapsedStartAt(start, now): every consumer of an elapsed-time start (firstLowCarbAt,
 *   carbCeilingStartedAt, goalSetAt and the like) reads a start dated after now as now, so a date
 *   ahead never delays a check-in or a reminder for as long as it lies ahead.
 */
import { BOOKKEEPING_INSTANT_FIELDS } from './bookkeeping';
import { FUTURE_INSTANT_TOLERANCE_MS } from './limits';
import { type Instant, instantMs, isInstant, isPlainObject } from './primitives';

/** Event instants: when something happened (section 3.1). Transfer times are not the phone's own. */
export const EVENT_INSTANT_FIELDS: readonly string[] = Object.freeze([
  'at',
  'startedAt',
  'endedAt',
  'askedAt',
  'enteredAt',
  'completedAt',
]);

const DAY_MS = 86_400_000;

/**
 * The clock high-water mark: the newest event or bookkeeping instant in any row of `tables` (any
 * set of stores; the backed-up ones in practice), or null when there is none. Rows that are not
 * plain objects and values that are not instants are ignored.
 */
export function clockHighWater(
  tables: Readonly<Record<string, readonly unknown[] | undefined>>,
): Instant | null {
  let newest: Instant | null = null;
  let newestMs = -Infinity;
  const bookkeeping = BOOKKEEPING_INSTANT_FIELDS as Readonly<Record<string, readonly string[]>>;
  for (const [table, rows] of Object.entries(tables)) {
    const fields = [...EVENT_INSTANT_FIELDS, ...(bookkeeping[table] ?? [])];
    for (const row of rows ?? []) {
      if (!isPlainObject(row)) continue;
      for (const field of fields) {
        const value = row[field];
        if (isInstant(value) && instantMs(value) > newestMs) {
          newest = value;
          newestMs = instantMs(value);
        }
      }
    }
  }
  return newest;
}

/** True when `now` is earlier than the high-water mark by more than the tolerance. */
export function isClockBehind(now: Instant, highWater: Instant | null): boolean {
  return highWater !== null && instantMs(now) < instantMs(highWater) - FUTURE_INSTANT_TOLERANCE_MS;
}

/** The later of `now` and `instants` (the time a write that must not go back in time uses). */
export function notBeforeAny(now: Instant, ...instants: readonly (Instant | null)[]): Instant {
  let latest = now;
  for (const at of instants) if (at !== null && instantMs(at) > instantMs(latest)) latest = at;
  return latest;
}

/** The start an elapsed-time count runs from: `start`, or `now` when it is dated after now. */
export function elapsedStartAt(start: Instant | null, now: Instant): Instant | null {
  if (start === null) return null;
  return instantMs(start) > instantMs(now) ? now : start;
}

/**
 * Whole elapsed 24-hour periods from elapsedStartAt(start, now) to now (C72, C109), or null when
 * there is no start. Never negative.
 */
export function elapsedDaysSince(start: Instant | null, now: Instant): number | null {
  const from = elapsedStartAt(start, now);
  return from === null ? null : Math.floor((instantMs(now) - instantMs(from)) / DAY_MS);
}
