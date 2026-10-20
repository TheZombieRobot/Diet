/**
 * Today's one-line status (item 16 design sections 1.2 and 2.1; UX_SCREENS section 2, top; HS-02,
 * HS-03, HS-18, RD-06, C30). Pure: the caller passes the clock, the device zone, the fasting gate,
 * item 15's schedule (the standing window with its per-day changes, such as the 5 pm snack) and
 * the stored fasts.
 *
 * - A running fast is measured as item 15's fasting span (fasts less than an hour apart are one),
 *   so the status line and the Fast card always agree.
 * - Strictly over 24 hours the HS-02 sentence shows, whether or not fasting is gated: a gate
 *   switches a feature off, never a warning.
 * - While fasting is gated, a running fast gets only a neutral "still open" line, and with no fast
 *   there is no status line at all (HS-03, RD-06).
 * - No line names a time past the 24-hour point of a running fast (C30). Item 15's end hint comes
 *   first, worked out as on the Fast card: close to 24 hours (from 23 hours) the line says it is
 *   fine to eat now, and when the plan is capped at the 24-hour point it says it is fine to widen
 *   the window. A window open now that ends past the 24-hour point is named without its end, and
 *   a next window that opens past it is not named: the line says it is fine to widen the window.
 */
import { FAST_CEILING_MS, runningPlan } from '../fasting/fastPlan';
import {
  fastEndHint,
  type FastTimes,
  isOverCeiling,
  runningPhase,
  runningSpan,
  spanElapsedMs,
  type FastSpan,
} from '../fasting/fastState';
import {
  isOneMealWindow,
  nextWindowStart,
  openWindowAt,
  type Schedule,
  SNACK_TIME,
  type WindowInstance,
} from '../fasting/windows';
import { type Instant, instantMs, type TimeZone } from '../storage/primitives';
import { localDateOf } from '../util/time';

const MS_PER_MINUTE = 60_000;

/** The window part of the status line. Instants are canonical ISO strings. */
export type StatusWindow =
  /** The window open now, and when it ends. */
  | { readonly kind: 'open-until'; readonly at: Instant }
  /** Later today at 5 pm, holding the snack (not a one-meal window). */
  | { readonly kind: 'snack-opens'; readonly at: Instant }
  | { readonly kind: 'opens-today'; readonly at: Instant }
  | { readonly kind: 'opens-tomorrow'; readonly at: Instant }
  /** A running fast whose next window would carry it past 24 hours: no time is named. */
  | { readonly kind: 'widen' }
  /** A running fast close to 24 hours (item 15's eat-now hint): no time is named. */
  | { readonly kind: 'eat-now' }
  /** A window open now that ends past the running fast's 24-hour point: its end is not named. */
  | { readonly kind: 'open-now' };

type ClockWindow = Exclude<StatusWindow, { readonly kind: 'widen' | 'eat-now' | 'open-now' }>;

export type TodayStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'over-ceiling'; readonly elapsedMinutes: number }
  | { readonly kind: 'open-while-off'; readonly elapsedMinutes: number }
  | {
      readonly kind: 'fasting';
      readonly elapsedMinutes: number;
      readonly window: StatusWindow | null;
    }
  | { readonly kind: 'not-fasting'; readonly window: ClockWindow };

export interface TodayStatusInput {
  readonly now: Instant;
  /** The device zone, resolved. */
  readonly timeZone: TimeZone;
  /** readinessGates(...).fastingGated (item 13). */
  readonly fastingGated: boolean;
  /** Item 15's scheduleFrom(...): standing null while gated or with no pattern; per-day changes. */
  readonly schedule: Schedule;
  /** The stored fasts (item 15's runningSpan finds the running one). */
  readonly fasts: readonly FastTimes[];
}

const iso = (ms: number): Instant => new Date(ms).toISOString();

/** Tomorrow, the 5 pm snack, or another time today. */
function classify(next: WindowInstance, nowMs: number, timeZone: TimeZone): ClockWindow {
  const at = iso(next.startMs);
  if (localDateOf(at, timeZone) !== localDateOf(iso(nowMs), timeZone)) {
    return { kind: 'opens-tomorrow', at };
  }
  if (next.window.start === SNACK_TIME && !isOneMealWindow(next.window)) {
    return { kind: 'snack-opens', at };
  }
  return { kind: 'opens-today', at };
}

/** The window part for a running fast that is not over 24 hours and not gated. */
function runningWindow(
  span: FastSpan,
  elapsedMs: number,
  nowMs: number,
  timeZone: TimeZone,
  schedule: Schedule,
): StatusWindow | null {
  // Item 15's end hint first, from the same plan as the Fast card's, so the line never names a
  // window while the card says to eat now or by the 24-hour point.
  const last = span.fasts.at(-1);
  const plan =
    last === undefined
      ? null
      : runningPlan(instantMs(last.startedAt), timeZone, schedule, span.startMs, nowMs);
  const hint = fastEndHint(runningPhase(elapsedMs, nowMs, plan), plan);
  if (hint.kind === 'eat-now') return { kind: 'eat-now' };
  if (hint.kind === 'eat-by') return { kind: 'widen' };
  const ceilingMs = span.startMs + FAST_CEILING_MS;
  const open = openWindowAt(nowMs, timeZone, schedule);
  if (open !== null) {
    return open.endMs > ceilingMs
      ? { kind: 'open-now' }
      : { kind: 'open-until', at: iso(open.endMs) };
  }
  const next = nextWindowStart(nowMs, timeZone, schedule);
  if (next === null) return null;
  if (next.startMs > ceilingMs) return { kind: 'widen' };
  return classify(next, nowMs, timeZone);
}

/** What Today's top line says at `now` (the rules of design section 2.1, in order). */
export function todayStatus(input: TodayStatusInput): TodayStatus {
  const nowMs = instantMs(input.now);
  const { schedule, timeZone } = input;
  const span = runningSpan(input.fasts);
  if (span !== null) {
    const elapsedMs = spanElapsedMs(span, nowMs);
    const elapsedMinutes = Math.floor(elapsedMs / MS_PER_MINUTE);
    if (isOverCeiling(elapsedMs)) return { kind: 'over-ceiling', elapsedMinutes };
    if (input.fastingGated) return { kind: 'open-while-off', elapsedMinutes };
    return {
      kind: 'fasting',
      elapsedMinutes,
      window: runningWindow(span, elapsedMs, nowMs, timeZone, schedule),
    };
  }
  if (input.fastingGated || schedule.standing === null) return { kind: 'none' };
  const open = openWindowAt(nowMs, timeZone, schedule);
  if (open !== null)
    return { kind: 'not-fasting', window: { kind: 'open-until', at: iso(open.endMs) } };
  const next = nextWindowStart(nowMs, timeZone, schedule);
  return next === null
    ? { kind: 'none' }
    : { kind: 'not-fasting', window: classify(next, nowMs, timeZone) };
}
