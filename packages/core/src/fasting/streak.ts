/**
 * The fasting streak (item 15; HS-02, FS-02, FS-07; DOC_REVIEW C63). Credit is computed from the
 * stored fasts at every read, never stored, so editing a fast's times cannot keep credit it no
 * longer earns.
 *
 * - A completed fasting span of 24 hours or less credits its end date, in the end zone of its last
 *   fast.
 * - Every date of a running span, and of a completed span over 24 hours, is neutral: it neither
 *   adds to the streak nor ends it. One long fast never resets the count.
 * - Counting starts at today (or yesterday, when today is neither credited nor neutral) and walks
 *   back over credited dates (counted) and neutral dates (skipped). Any other date stops the count,
 *   silently: the app never says a streak was lost.
 *
 * Alcohol is not an input, so a drink cannot affect the streak (C63).
 */
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import type { TimeZone } from '../storage/primitives';
import { addDays, type LocalDate, localDateOf } from '../util/time';
import { type FastSpan, type FastTimes, fastSpans, isOverCeiling } from './fastState';

const dateIn = (at: number, ...zones: readonly (TimeZone | null)[]): LocalDate =>
  localDateOf(new Date(at).toISOString(), resolveZone(...zones, DEFAULT_HOME_TIME_ZONE).timeZone);

const isOverlong = (span: FastSpan): boolean =>
  span.endMs !== null && isOverCeiling(span.endMs - span.startMs);

/** The date a completed span of 24 hours or less credits; null otherwise. */
export function spanCreditDate(span: FastSpan, homeTimeZone: TimeZone): LocalDate | null {
  const last = span.fasts.at(-1);
  if (span.endMs === null || last === undefined || isOverlong(span)) return null;
  return dateIn(span.endMs, last.endedTimeZone, homeTimeZone);
}

/** The dates a span makes neutral: all of a running span, or of one over 24 hours, up to today. */
export function spanNeutralDates(
  span: FastSpan,
  today: LocalDate,
  homeTimeZone: TimeZone,
): LocalDate[] {
  const first = span.fasts[0];
  const last = span.fasts.at(-1);
  if (first === undefined || last === undefined) return [];
  if (span.endMs !== null && !isOverlong(span)) return [];
  const from = dateIn(span.startMs, first.timeZone, homeTimeZone);
  const to = span.endMs === null ? today : dateIn(span.endMs, last.endedTimeZone, homeTimeZone);
  const [low, high] = from <= to ? [from, to] : [to, from];
  const dates: LocalDate[] = [];
  for (let date = low; date <= high; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Days in a row with a completed fast, counted back from today (C63). */
export function fastingStreak(
  fasts: readonly FastTimes[],
  today: LocalDate,
  homeTimeZone: TimeZone,
): number {
  const credited = new Set<LocalDate>();
  const neutral = new Set<LocalDate>();
  for (const span of fastSpans(fasts)) {
    const credit = spanCreditDate(span, homeTimeZone);
    if (credit !== null) credited.add(credit);
    for (const date of spanNeutralDates(span, today, homeTimeZone)) neutral.add(date);
  }
  const marked = (date: LocalDate) => credited.has(date) || neutral.has(date);
  let date = marked(today) ? today : addDays(today, -1);
  let count = 0;
  // Each step visits a different marked date, so the walk ends within their number.
  for (let steps = credited.size + neutral.size + 1; steps > 0 && marked(date); steps--) {
    if (credited.has(date)) count += 1;
    date = addDays(date, -1);
  }
  return count;
}
