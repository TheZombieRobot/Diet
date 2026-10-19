/**
 * Dates as the person reads them: in the device zone, in New Zealand English. Stored instants are
 * UTC (storage spec section 3.1); these are only for display.
 */
import { DEFAULT_HOME_TIME_ZONE, type Instant, resolveZone, type TimeZone } from '@diet/core';

const formatters = new Map<string, Intl.DateTimeFormat>();

type Parts = 'date' | 'date-time' | 'time';

function formatter(zone: TimeZone, parts: Parts): Intl.DateTimeFormat {
  const key = `${zone}|${parts}`;
  let f = formatters.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-NZ', {
      timeZone: zone,
      ...(parts === 'time' ? {} : { day: 'numeric', month: 'long', year: 'numeric' }),
      ...(parts === 'date' ? {} : { hour: 'numeric', minute: '2-digit' }),
    });
    formatters.set(key, f);
  }
  return f;
}

/** "19 October 2026" in `zone` (falling back to the home zone, then UTC). */
export function formatLocalDate(at: Instant, zone: TimeZone): string {
  return formatter(resolveZone(zone, DEFAULT_HOME_TIME_ZONE).timeZone, 'date').format(
    Date.parse(at),
  );
}

/** "19 October 2026 at 8:05 pm" in `zone`. */
export function formatLocalDateTime(at: Instant, zone: TimeZone): string {
  return formatter(resolveZone(zone, DEFAULT_HOME_TIME_ZONE).timeZone, 'date-time').format(
    Date.parse(at),
  );
}

/** "8:05 pm" in `zone`. */
export function formatLocalTime(at: Instant, zone: TimeZone): string {
  return formatter(resolveZone(zone, DEFAULT_HOME_TIME_ZONE).timeZone, 'time').format(
    Date.parse(at),
  );
}
