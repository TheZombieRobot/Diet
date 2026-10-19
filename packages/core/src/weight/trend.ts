import { assertInRange } from '../util/round';
import {
  addDays,
  assertValidTimeZone,
  type LocalDate,
  localDateOf,
  parseInstant,
} from '../util/time';

// Re-exported so existing imports from this module keep working; the code lives in util/time.
export { addDays, daysBetween, type LocalDate, localDateOf } from '../util/time';

/**
 * One weigh-in. Times are stored in UTC with the device's time zone recorded (DATA_MODEL.md), so
 * a weigh-in at 11:30 pm counts on the day the owner experienced.
 */
export interface WeighIn {
  /** Strict ISO 8601 instant with Z or an offset, e.g. "2026-10-19T18:30:00.000Z". */
  at: string;
  /** IANA time zone recorded on the device, e.g. "Pacific/Auckland" (see deviceTimeZone). */
  timeZone: string;
  kg: number;
}

/** Plausible body weights, kg. */
export const WEIGHT_LIMITS_KG = { min: 20, max: 400 } as const;

/**
 * Throws a RangeError unless the weigh-in can be placed on a local date: a strict ISO 8601 `at`
 * (Z or an offset, never a bare local time read in the host's zone), a time zone Intl accepts and
 * a plausible weight. Call it when the record is written as well as when it is read.
 */
export function assertValidWeighIn(w: WeighIn): void {
  assertInRange('kg', w.kg, WEIGHT_LIMITS_KG.min, WEIGHT_LIMITS_KG.max);
  parseInstant(w.at);
  assertValidTimeZone(w.timeZone);
}

/** One value per local date: the mean of that day's weigh-ins. */
export function dailyWeightsKg(weighIns: readonly WeighIn[]): Map<LocalDate, number> {
  const sums = new Map<LocalDate, { total: number; count: number }>();
  for (const w of weighIns) {
    assertValidWeighIn(w);
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

interface WindowStats {
  meanKg: number;
  /** Mean position of the days with a weigh-in, in days relative to the window's end (≤ 0). */
  centroidDays: number;
}

function windowStats(
  daily: ReadonlyMap<LocalDate, number>,
  endDate: LocalDate,
  windowDays: 7 | 14,
): WindowStats | null {
  const days: number = windowDays;
  if (days !== 7 && days !== 14) throw new RangeError(`windowDays must be 7 or 14, got ${days}`);
  let total = 0;
  let positions = 0;
  let count = 0;
  for (let back = 0; back < windowDays; back++) {
    const kg = daily.get(addDays(endDate, -back));
    if (kg === undefined) continue;
    assertInRange('kg', kg, WEIGHT_LIMITS_KG.min, WEIGHT_LIMITS_KG.max);
    total += kg;
    positions -= back;
    count += 1;
  }
  if (count < minimumDaysFor(windowDays)) return null;
  return { meanKg: total / count, centroidDays: positions / count };
}

/**
 * Mean of the daily weights (see dailyWeightsKg) in the `windowDays` days ending on `endDate`
 * (inclusive), or null when too few days have a weigh-in (DATA_MODEL.md weights; WT-05). Takes the
 * daily values precomputed, so a chart works them out once rather than once per point.
 */
export function rollingAverageFromDaily(
  daily: ReadonlyMap<LocalDate, number>,
  endDate: LocalDate,
  windowDays: 7 | 14,
): number | null {
  return windowStats(daily, endDate, windowDays)?.meanKg ?? null;
}

/** As rollingAverageFromDaily, from the weigh-ins themselves. */
export function rollingAverageKg(
  weighIns: readonly WeighIn[],
  endDate: LocalDate,
  windowDays: 7 | 14,
): number | null {
  return rollingAverageFromDaily(dailyWeightsKg(weighIns), endDate, windowDays);
}

/** Fewest days between the centres of the two weeks for a weekly rate to be shown. */
export const MIN_RATE_SPAN_DAYS = 4;

/**
 * Rate of change of the 7-day average over the fortnight ending on `endDate`, in kg per week.
 * Positive means the average went down (weight lost); negative means it went up. Feeds the
 * Steady rapid-loss card (HEALTH_SAFETY.md section 2; HS-11).
 *
 * Weigh-ins need not be daily, so the readings in each week can sit anywhere in it. The
 * difference of the two weekly means is therefore divided by the real time between the weeks'
 * centres (the mean date of each week's weigh-ins), not by a nominal 7 days:
 *   rate = (previous mean − current mean) × 7 ÷ (current centre − previous centre).
 * Null when either week has too few weigh-ins to average, or when the two centres are under
 * MIN_RATE_SPAN_DAYS apart (too close together to measure a weekly rate).
 */
export function weeklyLossFromDaily(
  daily: ReadonlyMap<LocalDate, number>,
  endDate: LocalDate,
): number | null {
  const current = windowStats(daily, endDate, 7);
  const previous = windowStats(daily, addDays(endDate, -7), 7);
  if (current === null || previous === null) return null;
  // Both centres in days before endDate; the previous week ends 7 days before it.
  const spanDays = current.centroidDays - (previous.centroidDays - 7);
  if (spanDays < MIN_RATE_SPAN_DAYS) return null;
  return ((previous.meanKg - current.meanKg) * 7) / spanDays;
}

/** As weeklyLossFromDaily, from the weigh-ins themselves. */
export function weeklyLossKg(weighIns: readonly WeighIn[], endDate: LocalDate): number | null {
  return weeklyLossFromDaily(dailyWeightsKg(weighIns), endDate);
}
