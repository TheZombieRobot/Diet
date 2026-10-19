import { assertInRange } from '../util/round';

/** A calendar date "YYYY-MM-DD" in the owner's local time zone. */
export type LocalDate = string;

/**
 * One weigh-in. Times are stored in UTC with the device's time zone recorded (DATA_MODEL.md), so
 * a weigh-in at 11:30 pm counts on the day the owner experienced.
 */
export interface WeighIn {
  /** ISO 8601 instant, e.g. "2026-10-19T18:30:00.000Z". */
  at: string;
  /** IANA time zone recorded on the device, e.g. "Pacific/Auckland". */
  timeZone: string;
  kg: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(date: LocalDate): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Date must be "YYYY-MM-DD", got "${date}"`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Not a real calendar date: "${date}"`);
  }
  return ms;
}

/** The local calendar date of an instant in a time zone. */
export function localDateOf(at: string, timeZone: string): LocalDate {
  const instant = new Date(at);
  if (Number.isNaN(instant.getTime())) throw new RangeError(`Not a valid instant: "${at}"`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Calendar arithmetic on local dates (no daylight-saving surprises). */
export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new RangeError(`days must be a whole number, got ${days}`);
  return new Date(parseLocalDate(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((parseLocalDate(to) - parseLocalDate(from)) / 86_400_000);
}

/** One value per local date: the mean of that day's weigh-ins. */
export function dailyWeightsKg(weighIns: readonly WeighIn[]): Map<LocalDate, number> {
  const sums = new Map<LocalDate, { total: number; count: number }>();
  for (const w of weighIns) {
    assertInRange('kg', w.kg, 20, 400);
    const date = localDateOf(w.at, w.timeZone);
    const s = sums.get(date) ?? { total: 0, count: 0 };
    s.total += w.kg;
    s.count += 1;
    sums.set(date, s);
  }
  return new Map([...sums].map(([date, s]) => [date, s.total / s.count]));
}

/**
 * Fewest days with a weigh-in for an average to be shown: 3 of 7, or 6 of 14. Judgement call:
 * with fewer readings, day-to-day water swings (a litre is a kilogram) dominate the average.
 */
export function minimumDaysFor(windowDays: number): number {
  return Math.ceil((windowDays * 3) / 7);
}

/**
 * Mean of the daily weights in the `windowDays` days ending on `endDate` (inclusive), or null
 * when too few days have a weigh-in (DATA_MODEL.md weights; WT-05).
 */
export function rollingAverageKg(
  weighIns: readonly WeighIn[],
  endDate: LocalDate,
  windowDays: 7 | 14,
): number | null {
  const daily = dailyWeightsKg(weighIns);
  const startDate = addDays(endDate, -(windowDays - 1));
  const values: number[] = [];
  for (const [date, kg] of daily) {
    if (date >= startDate && date <= endDate) values.push(kg);
  }
  if (values.length < minimumDaysFor(windowDays)) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Change in the 7-day average over the week ending on `endDate`, in kg per week. Positive means
 * the average went down (weight lost); negative means it went up. Null when either week has too
 * few weigh-ins to average.
 */
export function weeklyLossKg(weighIns: readonly WeighIn[], endDate: LocalDate): number | null {
  const now = rollingAverageKg(weighIns, endDate, 7);
  const weekBefore = rollingAverageKg(weighIns, addDays(endDate, -7), 7);
  if (now === null || weekBefore === null) return null;
  return weekBefore - now;
}
