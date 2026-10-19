/**
 * Dates, instants and time zones. Records store instants in UTC with the device's IANA time zone
 * (DATA_MODEL.md), so local dates and fast lengths are worked out here, across midnight and
 * daylight-saving changes, without ever using the host's own zone.
 */

/** A calendar date "YYYY-MM-DD" in the owner's local time zone. */
export type LocalDate = string;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 24 * 60;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strict ISO 8601 instant with a UTC designator or offset, e.g. "2026-10-19T18:30:00.000Z" or
 * "2026-10-20T07:30+13:00". A bare local time such as "2026-10-19T20:00" (what an
 * <input type="datetime-local"> gives) is rejected, because it would be read in the host's zone.
 */
const INSTANT_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** Midnight UTC of a local date, in milliseconds. Throws unless it is a real "YYYY-MM-DD" date. */
export function parseLocalDate(date: LocalDate): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Date must be "YYYY-MM-DD", got "${date}"`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Not a real calendar date: "${date}"`);
  }
  return ms;
}

/**
 * Milliseconds since the epoch for a strict ISO 8601 instant (see INSTANT_RE). Every field is
 * range-checked, so "2026-02-30T07:00Z" and "2026-10-19T24:00Z" are refused rather than rolled
 * over, and the host's time zone is never consulted.
 */
export function parseInstant(at: string): number {
  const m = INSTANT_RE.exec(at);
  if (!m) {
    throw new RangeError(`Instant must be ISO 8601 with Z or an offset, got "${at}"`);
  }
  const [, date = '', hh = '', mm = '', ss = '0', fraction = '0', sign, oh = '0', om = '0'] = m;
  const hours = Number(hh);
  const minutes = Number(mm);
  const seconds = Number(ss);
  const offsetMinutes = Number(oh) * 60 + Number(om);
  if (hours > 23 || minutes > 59 || seconds > 59 || Number(oh) > 23 || Number(om) > 59) {
    throw new RangeError(`Not a real time of day: "${at}"`);
  }
  const millis = Number(fraction.padEnd(3, '0'));
  const local = parseLocalDate(date) + ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
  return local - (sign === '-' ? -offsetMinutes : offsetMinutes) * MS_PER_MINUTE;
}

/** One formatter per time zone: building one is slow, and an invalid zone is refused once here. */
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: unknown): Intl.DateTimeFormat {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') {
    throw new RangeError('A time zone must be an IANA name such as "Pacific/Auckland"');
  }
  const cached = zoneFormatters.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    throw new RangeError(`Not a valid IANA time zone: "${timeZone}"`);
  }
  zoneFormatters.set(timeZone, formatter);
  return formatter;
}

/** Throws a RangeError unless `timeZone` is an IANA time zone this device's Intl recognises. */
export function assertValidTimeZone(timeZone: unknown): asserts timeZone is string {
  zoneFormatter(timeZone);
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  try {
    zoneFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/**
 * The device's IANA time zone, or `fallback` (for example the profile's home zone) when Intl
 * cannot report a usable one. Some engines report undefined, or "Etc/Unknown", which Intl then
 * refuses; a record must never be written with either.
 */
export function deviceTimeZone(fallback: string): string {
  assertValidTimeZone(fallback);
  let resolved: string | undefined;
  try {
    resolved = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    resolved = undefined;
  }
  return resolved !== undefined && isValidTimeZone(resolved) ? resolved : fallback;
}

/** The wall-clock reading in `timeZone` at `instant`, written as if it were a UTC time. */
function wallClockMs(instant: number, timeZone: string): number {
  const fields: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of zoneFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  const { year = Number.NaN, month = Number.NaN, day = Number.NaN } = fields;
  const { hour = Number.NaN, minute = Number.NaN, second = Number.NaN } = fields;
  return Date.UTC(year, month - 1, day, hour % 24, minute, second);
}

/** The zone's UTC offset at `instant`, in milliseconds (positive east of Greenwich). */
function offsetMs(instant: number, timeZone: string): number {
  const wholeSecond = Math.floor(instant / 1000) * 1000;
  return wallClockMs(wholeSecond, timeZone) - wholeSecond;
}

/**
 * The local wall-clock date and the whole minutes after midnight of an instant in a time zone.
 * Day boundaries other than midnight (the drinking-day cut-over, C21) are worked out from these
 * wall-clock minutes, never by shifting the instant, so daylight-saving nights come out right.
 */
export function localWallClockOf(
  at: string,
  timeZone: string,
): { date: LocalDate; minutes: number } {
  const wall = wallClockMs(parseInstant(at), timeZone);
  const sinceMidnight = ((wall % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  return {
    date: new Date(wall).toISOString().slice(0, 10),
    minutes: Math.floor(sinceMidnight / MS_PER_MINUTE),
  };
}

/** The local calendar date of an instant in a time zone. */
export function localDateOf(at: string, timeZone: string): LocalDate {
  const instant = parseInstant(at);
  return new Date(wallClockMs(instant, timeZone)).toISOString().slice(0, 10);
}

/**
 * The instant (milliseconds since the epoch) at which clocks in `timeZone` read `date` at
 * `minutesAfterMidnight`. Daylight saving is handled the way a person would expect:
 * - a time that happens twice when clocks go back (e.g. 02:30 on 5 April 2026 in New Zealand)
 *   resolves to the earlier of the two instants;
 * - a time that never happens when clocks go forward (02:30 on 27 September 2026 in New Zealand)
 *   moves forward to the first valid minute (03:00).
 * The offset is found from Intl: each candidate offset (the zone's offset a day either side) is
 * kept only if the zone really shows that wall-clock time at the resulting instant.
 */
export function zonedWallTimeToInstant(
  date: LocalDate,
  minutesAfterMidnight: number,
  timeZone: string,
): number {
  if (
    !Number.isInteger(minutesAfterMidnight) ||
    minutesAfterMidnight < 0 ||
    minutesAfterMidnight >= MINUTES_PER_DAY
  ) {
    throw new RangeError(
      `minutesAfterMidnight must be a whole number from 0 to 1439, got ${minutesAfterMidnight}`,
    );
  }
  assertValidTimeZone(timeZone);
  const wall = parseLocalDate(date) + minutesAfterMidnight * MS_PER_MINUTE;
  const offsetBefore = offsetMs(wall - MS_PER_DAY, timeZone);
  const offsetAfter = offsetMs(wall + MS_PER_DAY, timeZone);
  const valid = [wall - offsetBefore, wall - offsetAfter].filter(
    (instant) => offsetMs(instant, timeZone) === wall - instant,
  );
  if (valid.length > 0) return Math.min(...valid);

  // Clocks jumped forward over this time. Find the first minute after the jump: at `low` the zone
  // still has the earlier offset and at `high` it already has the later one.
  if (offsetAfter <= offsetBefore) {
    throw new RangeError(`Cannot resolve ${date} at minute ${minutesAfterMidnight} in ${timeZone}`);
  }
  let low = Math.floor((wall - offsetAfter) / MS_PER_MINUTE);
  let high = Math.ceil((wall - offsetBefore) / MS_PER_MINUTE);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (offsetMs(mid * MS_PER_MINUTE, timeZone) === offsetAfter) high = mid;
    else low = mid;
  }
  return high * MS_PER_MINUTE;
}

/** Calendar arithmetic on local dates (no daylight-saving surprises). */
export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new RangeError(`days must be a whole number, got ${days}`);
  return new Date(parseLocalDate(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((parseLocalDate(to) - parseLocalDate(from)) / MS_PER_DAY);
}
