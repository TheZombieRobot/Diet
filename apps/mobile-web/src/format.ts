/**
 * Dates as the person reads them: in the device zone, in New Zealand English. Stored instants are
 * UTC (storage spec section 3.1); these are only for display.
 */
import { DEFAULT_HOME_TIME_ZONE, type Instant, resolveZone, type TimeZone } from '@diet/core';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: TimeZone, withTime: boolean): Intl.DateTimeFormat {
  const key = `${zone}|${String(withTime)}`;
  let f = formatters.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-NZ', {
      timeZone: zone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

/** "19 October 2026" in `zone` (falling back to the home zone, then UTC). */
export function formatLocalDate(at: Instant, zone: TimeZone): string {
  return formatter(resolveZone(zone, DEFAULT_HOME_TIME_ZONE).timeZone, false).format(
    Date.parse(at),
  );
}

/** "19 October 2026 at 8:05 pm" in `zone`. */
export function formatLocalDateTime(at: Instant, zone: TimeZone): string {
  return formatter(resolveZone(zone, DEFAULT_HOME_TIME_ZONE).timeZone, true).format(Date.parse(at));
}
