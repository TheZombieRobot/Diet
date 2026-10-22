/**
 * Weigh-in records read for the weight screens (HEALTH_SAFETY section 2; WT-05; storage spec 3.4,
 * D6; item 14 design section 3.1). Every record is placed on a local date in its own resolved zone
 * (record zone, then the home zone, then Pacific/Auckland, then UTC), so an imported zone this
 * browser does not know never throws. Weigh-ins dated after now are ignored: every window ends
 * today, and the latest weigh-in is the newest one up to now. The gates alone also count one timed
 * after now when it is lower (gateCurrentWeightKg), so a clock that ran ahead never hides a low one.
 */
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import type { Id, Instant, TimeZone } from '../storage/primitives';
import type { WeightRecord } from '../storage/records';
import { roundTo } from '../util/round';
import { addDays, type LocalDate, localDateOf, parseInstant } from '../util/time';
import { isLowWeight } from './bmi';
import {
  dailyWeightsKg,
  rollingAverageFromDaily,
  weeklyLossFromDaily,
  type WeighIn,
} from './trend';

type WeighInRow = Pick<WeightRecord, 'at' | 'timeZone' | 'kg'>;

/** WeighIns for trend.ts with each record's zone resolved; zoneFallback when any row fell back. */
export function weighInsFromRecords(
  rows: readonly WeighInRow[],
  homeTimeZone: TimeZone,
): { readonly weighIns: readonly WeighIn[]; readonly zoneFallback: boolean } {
  let zoneFallback = false;
  const weighIns = rows.map((row) => {
    const zone = resolveZone(row.timeZone, homeTimeZone, DEFAULT_HOME_TIME_ZONE);
    if (zone.fallback) zoneFallback = true;
    return { at: row.at, timeZone: zone.timeZone, kg: row.kg };
  });
  return { weighIns, zoneFallback };
}

/** The daily mean weights of stored rows (see dailyWeightsKg), each read in its resolved zone. */
export function dailyWeightsFromRecords(
  rows: readonly WeighInRow[],
  homeTimeZone: TimeZone,
): Map<LocalDate, number> {
  return dailyWeightsKg(weighInsFromRecords(rows, homeTimeZone).weighIns);
}

/** A weigh-in counts as current for the milestone and goal entry for this many days. */
export const CURRENT_WEIGHT_MAX_AGE_DAYS = 14;

export interface LatestWeighIn {
  readonly id: Id;
  readonly kg: number;
  readonly at: Instant;
  /** The record's resolved zone. */
  readonly timeZone: TimeZone;
  readonly date: LocalDate;
}

/** The newest row with at <= now (ties: the later id). Null when none. */
export function latestWeighIn(
  rows: readonly WeightRecord[],
  now: Instant,
  homeTimeZone: TimeZone,
): LatestWeighIn | null {
  const nowMs = parseInstant(now);
  let latest: WeightRecord | null = null;
  for (const row of rows) {
    const at = parseInstant(row.at);
    if (at > nowMs) continue;
    if (latest === null) {
      latest = row;
      continue;
    }
    const best = parseInstant(latest.at);
    if (at > best || (at === best && row.id > latest.id)) latest = row;
  }
  if (latest === null) return null;
  const zone = resolveZone(latest.timeZone, homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  return {
    id: latest.id,
    kg: latest.kg,
    at: latest.at,
    timeZone: zone,
    date: localDateOf(latest.at, zone),
  };
}

/** The mean daily weight on the latest local date in [today − maxAgeDays + 1, today] with a weigh-in; null when none. */
export function latestDailyKg(
  daily: ReadonlyMap<LocalDate, number>,
  today: LocalDate,
  maxAgeDays: number,
): number | null {
  for (let back = 0; back < maxAgeDays; back++) {
    const kg = daily.get(addDays(today, -back));
    if (kg !== undefined) return kg;
  }
  return null;
}

/**
 * The milestone reference (W3): the higher of the 7-day average and the latest daily weight from
 * the last 14 days, so the milestone is never more than 20% below the average; null without a
 * weigh-in in the last 14 days.
 */
export function milestoneReferenceKg(
  daily: ReadonlyMap<LocalDate, number>,
  today: LocalDate,
): number | null {
  const latest = latestDailyKg(daily, today, CURRENT_WEIGHT_MAX_AGE_DAYS);
  const average = rollingAverageFromDaily(daily, today, 7);
  if (latest === null) return average;
  return average === null ? latest : Math.max(average, latest);
}

/**
 * The current weight for goal entry and profile.goalReferenceKg (storage spec definition): the
 * lower of the 7-day average and the latest daily weight from the last 14 days; null when neither.
 */
export function goalReferenceKgFor(
  daily: ReadonlyMap<LocalDate, number>,
  today: LocalDate,
): number | null {
  const latest = latestDailyKg(daily, today, CURRENT_WEIGHT_MAX_AGE_DAYS);
  const average = rollingAverageFromDaily(daily, today, 7);
  if (latest === null) return average;
  return average === null ? latest : Math.min(average, latest);
}

/**
 * The lower of the 7-day average and the mean weight on the latest local date on or before today
 * with a weigh-in, however old. Null with no weigh-in. Part of the gates' current weight
 * (gateCurrentWeightKg), which also reads the latest single weigh-in.
 */
export function currentWeightFromDaily(
  daily: ReadonlyMap<LocalDate, number>,
  today: LocalDate,
): number | null {
  let latestDate: LocalDate | null = null;
  for (const date of daily.keys()) {
    if (date <= today && (latestDate === null || date > latestDate)) latestDate = date;
  }
  if (latestDate === null) return null;
  const latest = daily.get(latestDate) ?? null;
  const average = rollingAverageFromDaily(daily, today, 7);
  return average === null || latest === null ? latest : Math.min(average, latest);
}

/**
 * The kg of the latest single weigh-in the gates read: the newest at or before now, by instant as
 * the Weight card's "Latest" (latestWeighIn), so a change of zone never drops it; or the newest of
 * all when that is lower. A weigh-in timed after now (saved while the clock ran ahead, or brought
 * in by an import) so never hides a lower one, and counts only when it is lower itself. Ties: the
 * lower kg. Null with none.
 */
function gateLatestWeighInKg(rows: readonly WeighInRow[], now: Instant): number | null {
  type Newest = { readonly ms: number; readonly kg: number } | null;
  const newer = (best: Newest, ms: number, kg: number): boolean =>
    best === null || ms > best.ms || (ms === best.ms && kg < best.kg);
  const nowMs = parseInstant(now);
  let upToNow: Newest = null;
  let newest: Newest = null;
  for (const row of rows) {
    const ms = parseInstant(row.at);
    if (newer(newest, ms, row.kg)) newest = { ms, kg: row.kg };
    if (ms <= nowMs && newer(upToNow, ms, row.kg)) upToNow = { ms, kg: row.kg };
  }
  if (upToNow === null || newest === null) return newest?.kg ?? null;
  return Math.min(upToNow.kg, newest.kg);
}

/**
 * The current weight the readiness gates read (item 13 section 9.1 rule 2; HS-35; DECISIONS "The
 * gates' current weight"): the lowest of the 7-day average, the latest day's mean (on or before
 * today, however old) and the latest single weigh-in (gateLatestWeighInKg), so a low weight is
 * never missed for want of a recent weigh-in, a low evening weigh-in is never averaged away by a
 * higher morning one, and a weigh-in timed after now never hides a lower one. Items 13, 14 and 15
 * use this one rule. Null with no weigh-in.
 */
export function gateCurrentWeightKg(
  rows: readonly WeighInRow[],
  today: LocalDate,
  now: Instant,
  homeTimeZone: TimeZone,
): number | null {
  const { weighIns } = weighInsFromRecords(rows, homeTimeZone);
  const fromDaily = currentWeightFromDaily(dailyWeightsKg(weighIns), today);
  const latest = gateLatestWeighInKg(rows, now);
  if (fromDaily === null || latest === null) return fromDaily ?? latest;
  return Math.min(fromDaily, latest);
}

/**
 * Weight now below BMI 18.5 for the stored height (W32; HS-35): the gates' current weight
 * (gateCurrentWeightKg) fails item 13's strict-side check. False without a height, a weigh-in, or
 * a height in range.
 */
export function belowBmiFloorNow(
  rows: readonly WeighInRow[],
  today: LocalDate,
  now: Instant,
  homeTimeZone: TimeZone,
  heightCm: number | null,
): boolean {
  return isLowWeight(gateCurrentWeightKg(rows, today, now, homeTimeZone), heightCm);
}

export type WeeklyChange = {
  readonly direction: 'down' | 'up' | 'level';
  /** The size of the change, kg a week, unrounded and never negative. */
  readonly kgPerWeek: number;
};

/** From weeklyLossFromDaily(daily, today), where positive is down. 'level' when it rounds to 0.0. Null when the rate is null. */
export function weeklyChange(
  daily: ReadonlyMap<LocalDate, number>,
  today: LocalDate,
): WeeklyChange | null {
  const rate = weeklyLossFromDaily(daily, today);
  if (rate === null) return null;
  const kgPerWeek = Math.abs(rate);
  if (roundTo(kgPerWeek, 1) === 0) return { direction: 'level', kgPerWeek };
  return { direction: rate > 0 ? 'down' : 'up', kgPerWeek };
}
