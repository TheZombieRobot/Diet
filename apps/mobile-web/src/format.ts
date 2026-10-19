/**
 * Dates as the person reads them: in the device zone, in New Zealand English. Stored instants are
 * UTC (storage spec section 3.1); these are only for display.
 */
import {
  daysBetween,
  DEFAULT_HOME_TIME_ZONE,
  type Instant,
  type LocalDate,
  parseLocalDate,
  resolveZone,
  roundTo,
  type TimeZone,
} from '@diet/core';
import { fasting, today } from '@diet/core/copy/health';

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

/**
 * A stored local date (such as a Kickstart's scheduled last day), "21 February 2000". It is a
 * calendar date, not an instant, so it is formatted at noon UTC in UTC and never shifts a day.
 */
export function formatLocalDay(date: LocalDate): string {
  return formatter('UTC', 'date').format(parseLocalDate(date) + 12 * 3_600_000);
}

/** A weight with one decimal: "96.8", "100.0". */
export function formatKg(kg: number): string {
  return roundTo(kg, 1).toFixed(1);
}

const shortDayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The named parts of `ms` in `zone`, with the given fields. */
function parts(
  ms: number,
  zone: TimeZone,
  options: Intl.DateTimeFormatOptions,
): Partial<Record<Intl.DateTimeFormatPartTypes, string>> {
  const key = `${zone}|${JSON.stringify(options)}`;
  let f = shortDayFormatters.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-NZ', { timeZone: zone, ...options });
    shortDayFormatters.set(key, f);
  }
  return Object.fromEntries(f.formatToParts(ms).map((p) => [p.type, p.value]));
}

/** "Tue 4 Jan" in `zone`, built from parts so no comma the device's ICU may add appears. */
export function formatShortDay(at: Instant, zone: TimeZone): string {
  const p = parts(Date.parse(at), resolveZone(zone, DEFAULT_HOME_TIME_ZONE).timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${p.weekday ?? ''} ${p.day ?? ''} ${p.month ?? ''}`;
}

/**
 * A local date as a short phrase: "today", "yesterday", "tomorrow", a weekday within the last 6
 * days ("Monday"), or the date ("3 January").
 */
export function formatDayPhrase(date: LocalDate, today: LocalDate): string {
  const offset = daysBetween(today, date);
  if (offset === 0) return fasting.day.today;
  if (offset === -1) return fasting.day.yesterday;
  if (offset === 1) return fasting.day.tomorrow;
  const noon = Date.parse(`${date}T12:00:00.000Z`);
  if (offset < 0 && offset >= -6) return parts(noon, 'UTC', { weekday: 'long' }).weekday ?? date;
  const p = parts(noon, 'UTC', { day: 'numeric', month: 'long' });
  return `${p.day ?? ''} ${p.month ?? ''}`;
}

// ---- Item 16: Today ----

/** Today's heading, "Wednesday 15 March", from parts so no comma the device's ICU may add appears. */
export function formatTodayHeading(at: Instant, zone: TimeZone): string {
  const p = parts(Date.parse(at), resolveZone(zone, DEFAULT_HOME_TIME_ZONE).timeZone, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `${p.weekday ?? ''} ${p.day ?? ''} ${p.month ?? ''}`;
}

const litres = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 2 });
const counts = new Intl.NumberFormat('en-NZ');

/** Water as a figure and its unit: under 1,000 mL in mL ("750", "mL"), then litres ("2.25", "L"). */
export function formatWaterMl(ml: number): { readonly value: string; readonly unit: string } {
  if (ml < 1000) return { value: String(Math.round(ml)), unit: today.water.unitMl };
  return { value: litres.format(ml / 1000), unit: today.water.unitL };
}

/** Water in a sentence: "750 mL", "1.25 L". */
export function formatWaterText(ml: number): string {
  const { value, unit } = formatWaterMl(ml);
  return `${value} ${unit}`;
}

/** A step count with thousands separators: "12,000". */
export function formatSteps(steps: number): string {
  return counts.format(steps);
}
