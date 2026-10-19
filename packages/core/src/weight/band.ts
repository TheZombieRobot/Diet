/**
 * The projection band on the four-week chart (HEALTH_SAFETY section 2; HS-26, WT-10; C27; item 14
 * design section 3.5, W19, W20, W34). A shaded typical range, never a target: no line, no goal,
 * no kg-by-date figure.
 *
 * - Steady edges: 0.5 kg a week and the lower of 1.0 kg a week and the rapid-loss threshold in use,
 *   so the band never shades as typical a pace the check-in card calls losing quickly.
 * - In the first Kickstart ever, and only when it started the carb ceiling, a one-off water and
 *   glycogen offset of 1.0 to 1.5 kg is spread evenly over days 0 to 14: front-loaded, then
 *   flattening to the Steady edges. A later Kickstart may follow weeks of keto, with no glycogen
 *   left to lose, so it is linear.
 * - The chart shows four-week blocks aligned to the start of the current phase segment, and the
 *   band is re-anchored at each block start, so it never drifts from the real trend.
 * These constants are judgement calls for the owner (STOP 17, item 42), recorded in DATA_MODEL.md.
 */
import type { Instant, Id, TimeZone } from '../storage/primitives';
import { effectiveLastDay, extensionsOf, periodDay1, scheduledLastDay } from '../storage/kickstart';
import type { ReadinessGates } from '../storage/readiness';
import type { DietMode, KickstartCheckRecord, KickstartPeriodRecord } from '../storage/records';
import { addDays, daysBetween, type LocalDate, parseInstant } from '../util/time';
import { latestDailyKg } from './weighIns';
import { periodsInOrder } from './phase';
import { rollingAverageFromDaily } from './trend';

/** Steady edges, kg a week (HEALTH_SAFETY section 2: "about 0.5–1 kg a week"). The fast edge is also capped at the check-in threshold in use. */
export const BAND_STEADY_KG_PER_WEEK = Object.freeze({ slow: 0.5, fast: 1.0 });
/** One-off water and glycogen offset in the first Kickstart ever, kg, spread evenly over BAND_OFFSET_DAYS. */
export const BAND_KICKSTART_OFFSET_KG = Object.freeze({ slow: 1.0, fast: 1.5 });
/** "Weeks 1–2" (C27). */
export const BAND_OFFSET_DAYS = 14;
/** The first Kickstart is front-loaded only if the carb ceiling started with it: firstLowCarbAt within this many hours of its start. */
export const BAND_FRONT_LOAD_MAX_HOURS = 24;
/** The four-week chart. */
export const CHART_BLOCK_DAYS = 28;

export type BandShape = 'front-loaded' | 'linear';

/**
 * The band's edges t days after the anchor (t ≥ 0): the Steady pace (fast edge at most
 * fastKgPerWeek, the threshold in use), less the Kickstart offset spread over days 0–14 when
 * front-loaded. The slow edge is never below the fast edge.
 */
export function bandEdgesAt(
  anchorKg: number,
  shape: BandShape,
  t: number,
  fastKgPerWeek: number,
): { readonly slowKg: number; readonly fastKg: number } {
  const fast = Math.min(BAND_STEADY_KG_PER_WEEK.fast, fastKgPerWeek);
  const share = shape === 'front-loaded' ? Math.min(t, BAND_OFFSET_DAYS) / BAND_OFFSET_DAYS : 0;
  return {
    slowKg:
      anchorKg - (BAND_STEADY_KG_PER_WEEK.slow * t) / 7 - BAND_KICKSTART_OFFSET_KG.slow * share,
    fastKg: anchorKg - (fast * t) / 7 - BAND_KICKSTART_OFFSET_KG.fast * share,
  };
}

export interface PhaseSegment {
  readonly kind: 'kickstart' | 'steady';
  readonly start: LocalDate;
  readonly periodId: Id | null;
  readonly frontLoaded: boolean;
}

/**
 * The phase segments the chart's blocks align to: Steady from the first weigh-in when that is
 * before the first Kickstart (or there is none); for each period, Kickstart from day 1 (none when
 * it ended on day 1), then Steady from the day after its scheduled last day, or from the day it
 * ended early. Only the first period's Kickstart can be front-loaded, and only when firstLowCarbAt
 * is within 24 hours of its start.
 */
export function phaseSegments(
  periods: readonly KickstartPeriodRecord[],
  checks: readonly KickstartCheckRecord[],
  firstWeighInDate: LocalDate | null,
  firstLowCarbAt: Instant | null,
  homeTimeZone: TimeZone,
): PhaseSegment[] {
  const ordered = periodsInOrder(periods);
  const segments: PhaseSegment[] = [];
  const firstDay1 = ordered[0] === undefined ? null : periodDay1(ordered[0], homeTimeZone);
  if (firstWeighInDate !== null && (firstDay1 === null || firstWeighInDate < firstDay1)) {
    segments.push({ kind: 'steady', start: firstWeighInDate, periodId: null, frontLoaded: false });
  }
  ordered.forEach((period, i) => {
    const day1 = periodDay1(period, homeTimeZone);
    const extensions = extensionsOf(period.id, checks);
    const steadyFrom =
      period.endedAt === null
        ? addDays(scheduledLastDay(period, extensions, homeTimeZone), 1)
        : effectiveLastDay(period, extensions, homeTimeZone);
    const frontLoaded =
      i === 0 &&
      firstLowCarbAt !== null &&
      Math.abs(parseInstant(period.startedAt) - parseInstant(firstLowCarbAt)) <=
        BAND_FRONT_LOAD_MAX_HOURS * 3_600_000;
    if (steadyFrom > day1) {
      segments.push({ kind: 'kickstart', start: day1, periodId: period.id, frontLoaded });
    }
    segments.push({ kind: 'steady', start: steadyFrom, periodId: null, frontLoaded: false });
  });
  return segments;
}

export interface ChartBlock {
  readonly blockStart: LocalDate;
  /** 0 for the segment's first four weeks. */
  readonly blockNumber: number;
  readonly shape: BandShape;
}

/** The four-week block holding today, in the last segment started by today; null before any. */
export function chartBlock(segments: readonly PhaseSegment[], today: LocalDate): ChartBlock | null {
  const current = segments.filter((s) => s.start <= today).at(-1);
  if (current === undefined) return null;
  const blockNumber = Math.floor(daysBetween(current.start, today) / CHART_BLOCK_DAYS);
  return {
    blockStart: addDays(current.start, CHART_BLOCK_DAYS * blockNumber),
    blockNumber,
    shape: current.frontLoaded && blockNumber === 0 ? 'front-loaded' : 'linear',
  };
}

/**
 * Where the band starts: the 7-day average ending on the block start (index 0); else the latest
 * daily weight in the 7 days ending on it (index 0); else the first daily weight on block days 0
 * to 2 (its own index); else null.
 */
export function bandAnchor(
  daily: ReadonlyMap<LocalDate, number>,
  blockStart: LocalDate,
): { readonly index: number; readonly kg: number } | null {
  const average = rollingAverageFromDaily(daily, blockStart, 7);
  if (average !== null) return { index: 0, kg: average };
  const recent = latestDailyKg(daily, blockStart, 7);
  if (recent !== null) return { index: 0, kg: recent };
  for (let index = 1; index <= 2; index++) {
    const kg = daily.get(addDays(blockStart, index));
    if (kg !== undefined) return { index, kg };
  }
  return null;
}

/** A carb ceiling is active: keto with the keto ceiling available, or moderate low-carb (C27: no band when the carb ceiling is off). */
export function carbCeilingActive(
  dietMode: DietMode,
  gates: Pick<ReadinessGates, 'ketoCeilingAvailable'>,
): boolean {
  if (dietMode === 'keto') return gates.ketoCeilingAvailable;
  return dietMode === 'moderate-low-carb';
}
