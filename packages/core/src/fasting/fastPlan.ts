/**
 * The planned length of a fast (item 15; DOC_REVIEW C30, D47; FS-01, FS-06). A fast is planned
 * from its real start to the start of the next eating window, in real elapsed time, honouring
 * per-day windows. The plan never runs past 24 hours from the start of the fasting span (fasts
 * less than an hour apart count as one, fastState.ts): when the next window opens later than that,
 * the plan ends at 24 hours and the card says it is fine to eat by then.
 */
import type { TimeZone } from '../storage/primitives';
import { localWallClockOf } from '../util/time';
import { type ClockTime, MAX_PLANNED_FAST_HOURS, withinFastCeiling } from './eatingWindow';
import {
  clockTimeFromMinutes,
  isOneMealWindow,
  nextWindowStart,
  type Schedule,
  SNACK_TIME,
  type WindowInstance,
} from './windows';

/** The 24-hour ceiling in milliseconds (HEALTH_SAFETY.md section 3). */
export const FAST_CEILING_MS = MAX_PLANNED_FAST_HOURS * 3_600_000;

const MS_PER_MINUTE = 60_000;

export interface FastPlan {
  /** The eating window planned to end the fast. */
  readonly next: WindowInstance;
  /** next.startMs, or the span start plus 24 hours when capped. */
  readonly targetEndMs: number;
  /** Whole minutes from this fast's start, 1 to 1440. */
  readonly plannedMinutes: number;
  /** The next window opens more than 24 hours after the span start. */
  readonly cappedAtCeiling: boolean;
}

/**
 * The plan for a fast started at `startedAtMs`, in the device's current zone. `spanStartMs` is the
 * start of its fasting span (the start of an earlier fast ended less than an hour before), and
 * defaults to the fast's own start. Null without a window, or when less than a minute is left
 * before the 24-hour point of the span.
 */
export function planFast(
  startedAtMs: number,
  timeZone: TimeZone,
  schedule: Schedule,
  spanStartMs: number = startedAtMs,
): FastPlan | null {
  if (spanStartMs > startedAtMs) throw new RangeError('A fasting span cannot start after its fast');
  const next = nextWindowStart(startedAtMs, timeZone, schedule);
  if (next === null) return null;
  const capMs = spanStartMs + FAST_CEILING_MS;
  if (capMs - startedAtMs < MS_PER_MINUTE) return null;
  const cappedAtCeiling = !withinFastCeiling((next.startMs - spanStartMs) / MS_PER_MINUTE);
  const targetEndMs = cappedAtCeiling ? capMs : next.startMs;
  const plannedMinutes = Math.min(
    Math.max(Math.round((targetEndMs - startedAtMs) / MS_PER_MINUTE), 1),
    MAX_PLANNED_FAST_HOURS * 60,
  );
  return { next, targetEndMs, plannedMinutes, cappedAtCeiling };
}

/**
 * The plan of a running fast at `nowMs`. A fast that runs on after its planned window has closed
 * (one started before that day's window, for example) is planned again from that window's end,
 * with the same span start, so the card never names a window that has closed and the 24-hour cap
 * still applies to the next one (FS-06). The planned minutes stay counted from the fast's own
 * start.
 */
export function runningPlan(
  startedAtMs: number,
  timeZone: TimeZone,
  schedule: Schedule,
  spanStartMs: number,
  nowMs: number,
): FastPlan | null {
  let plan = planFast(startedAtMs, timeZone, schedule, spanStartMs);
  // Each step starts after a later window's end, and planFast gives up 24 hours past the span
  // start, so this ends within a few steps.
  while (plan !== null && !plan.cappedAtCeiling && nowMs >= plan.next.endMs) {
    plan = planFast(plan.next.endMs, timeZone, schedule, spanStartMs);
  }
  if (plan === null) return null;
  return {
    ...plan,
    plannedMinutes: Math.min(
      Math.max(Math.round((plan.targetEndMs - startedAtMs) / MS_PER_MINUTE), 1),
      MAX_PLANNED_FAST_HOURS * 60,
    ),
  };
}

/**
 * The clock time the plan ends, read from the real instant in the zone (never by adding 24 hours
 * to a wall-clock time, so the April daylight-saving night comes out right).
 */
export function planEndClock(plan: FastPlan, timeZone: TimeZone): ClockTime {
  return clockTimeFromMinutes(
    localWallClockOf(new Date(plan.targetEndMs).toISOString(), timeZone).minutes,
  );
}

/**
 * The fields fasts.start() stores for a plan (D47). The planned minutes are always 1 to 1440; a
 * capped plan, or none, records no snack or dinner time.
 */
export function fastRecordPlan(plan: FastPlan | null): {
  plannedFastMinutes: number | null;
  snackTime: ClockTime | null;
  dinnerTime: ClockTime | null;
} {
  if (plan === null) return { plannedFastMinutes: null, snackTime: null, dinnerTime: null };
  if (plan.cappedAtCeiling) {
    return { plannedFastMinutes: plan.plannedMinutes, snackTime: null, dinnerTime: null };
  }
  const { window } = plan.next;
  const snack = window.start === SNACK_TIME && !isOneMealWindow(window);
  return {
    plannedFastMinutes: plan.plannedMinutes,
    snackTime: snack ? SNACK_TIME : null,
    dinnerTime: window.end,
  };
}
