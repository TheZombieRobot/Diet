/**
 * The running fast, measured from stored instants (item 15; HS-02, FS-02, FS-03; DOC_REVIEW C30,
 * C63). Fasts less than MIN_EATING_MINUTES apart form one fasting span: elapsed time, the phase,
 * the over-24 warning, the plan cap and streak credit are all worked out on the span, so ending a
 * fast and starting another a minute later cannot get round the 24-hour ceiling.
 *
 * Elapsed time is real time between stored instants, so midnight, daylight saving and a restart
 * need nothing special: the timer is never an in-memory counter.
 */
import { type Id, type Instant, instantMs, type TimeZone } from '../storage/primitives';
import { MIN_EATING_MINUTES, withinFastCeiling } from './eatingWindow';
import { FAST_CEILING_MS, type FastPlan } from './fastPlan';
import type { WindowInstance } from './windows';

const MS_PER_MINUTE = 60_000;

/** From 23 hours of span time the card says it is fine to eat now (C30; F12). */
export const NEAR_CEILING_MS = 23 * 3_600_000;

/** A phone clock this far behind a fast's start shows the clock note (F16). */
export const CLOCK_BEHIND_TOLERANCE_MS = 5 * MS_PER_MINUTE;

/** A gap shorter than the shortest eating window joins two fasts into one span. */
export const SPAN_JOIN_GAP_MS = MIN_EATING_MINUTES * MS_PER_MINUTE;

/** The stored times of a fast (a FastRecord has more fields). */
export interface FastTimes {
  readonly id: Id;
  readonly startedAt: Instant;
  readonly endedAt: Instant | null;
  readonly timeZone: TimeZone;
  readonly endedTimeZone: TimeZone | null;
}

/** Fasts, by start, whose gaps are each under SPAN_JOIN_GAP_MS. */
export interface FastSpan {
  readonly fasts: readonly FastTimes[];
  readonly startMs: number;
  /** The last fast's end, or null while it runs. */
  readonly endMs: number | null;
}

/** Every fasting span, oldest first. */
export function fastSpans(fasts: readonly FastTimes[]): FastSpan[] {
  const sorted = [...fasts].sort((a, b) => instantMs(a.startedAt) - instantMs(b.startedAt));
  const spans: FastTimes[][] = [];
  for (const fast of sorted) {
    const current = spans.at(-1);
    const previousEnd = current?.at(-1)?.endedAt ?? null;
    if (
      current !== undefined &&
      previousEnd !== null &&
      instantMs(fast.startedAt) - instantMs(previousEnd) < SPAN_JOIN_GAP_MS
    ) {
      current.push(fast);
    } else {
      spans.push([fast]);
    }
  }
  return spans.map((group) => {
    const end = group.at(-1)?.endedAt ?? null;
    return {
      fasts: group,
      startMs: instantMs(group[0]?.startedAt ?? ''),
      endMs: end === null ? null : instantMs(end),
    };
  });
}

/** The span of the running fast (only the latest fast can run), or null. */
export function runningSpan(fasts: readonly FastTimes[]): FastSpan | null {
  const last = fastSpans(fasts).at(-1);
  return last !== undefined && last.endMs === null ? last : null;
}

/** One fast's elapsed time, never below 0. */
export function fastElapsedMs(
  fast: { readonly startedAt: Instant; readonly endedAt: Instant | null },
  nowMs: number,
): number {
  const end = fast.endedAt === null ? nowMs : instantMs(fast.endedAt);
  return Math.max(0, end - instantMs(fast.startedAt));
}

/** A span's elapsed time, never below 0. */
export function spanElapsedMs(span: FastSpan, nowMs: number): number {
  return Math.max(0, (span.endMs ?? nowMs) - span.startMs);
}

/** Strictly more than 24 hours: 24:00:00 is not over, 24:00:00.001 is (HS-02, C30). */
export function isOverCeiling(elapsedMs: number): boolean {
  return !withinFastCeiling(elapsedMs / MS_PER_MINUTE);
}

/** A running span whose last fast started more than 5 minutes after the phone's clock reads now. */
export function clockBehind(span: FastSpan, nowMs: number): boolean {
  const last = span.fasts.at(-1);
  return (
    span.endMs === null &&
    last !== undefined &&
    nowMs < instantMs(last.startedAt) - CLOCK_BEHIND_TOLERANCE_MS
  );
}

export type RunningPhase = 'fasting' | 'window-open' | 'near-ceiling' | 'over-ceiling';

/** Over the ceiling first, then near it (23 hours of span time), then the planned end passed. */
export function runningPhase(
  spanElapsed: number,
  nowMs: number,
  plan: FastPlan | null,
): RunningPhase {
  if (isOverCeiling(spanElapsed)) return 'over-ceiling';
  if (spanElapsed >= NEAR_CEILING_MS) return 'near-ceiling';
  if (plan !== null && nowMs >= plan.targetEndMs) return 'window-open';
  return 'fasting';
}

/** The 24-hour bar from the span start: progress, and the eating window at its place. */
export interface MeterGeometry {
  readonly progressPct: number;
  readonly window: { readonly startPct: number; readonly widthPct: number } | null;
  readonly over: boolean;
}

export function fastMeter(span: FastSpan, nowMs: number, plan: FastPlan | null): MeterGeometry {
  const elapsed = spanElapsedMs(span, nowMs);
  const progressPct = Math.min(1, elapsed / FAST_CEILING_MS) * 100;
  let window: MeterGeometry['window'] = null;
  if (plan !== null && !plan.cappedAtCeiling) {
    const start = (plan.next.startMs - span.startMs) / FAST_CEILING_MS;
    const end = Math.min(plan.next.endMs - span.startMs, FAST_CEILING_MS) / FAST_CEILING_MS;
    if (start < 1) window = { startPct: start * 100, widthPct: (end - start) * 100 };
  }
  return { progressPct, window, over: isOverCeiling(elapsed) };
}

/**
 * What the card says about when to eat. Close to or past 24 hours: eat now; a capped plan: eat by
 * the 24-hour point; otherwise the planned window. No line ever names a window time that would
 * carry the fast past the ceiling.
 */
export type FastEndHint =
  | { readonly kind: 'window'; readonly window: WindowInstance }
  | { readonly kind: 'eat-by'; readonly atMs: number }
  | { readonly kind: 'eat-now' }
  | { readonly kind: 'none' };

export function fastEndHint(phase: RunningPhase, plan: FastPlan | null): FastEndHint {
  if (phase === 'over-ceiling' || phase === 'near-ceiling') return { kind: 'eat-now' };
  if (plan === null) return { kind: 'none' };
  if (plan.cappedAtCeiling) return { kind: 'eat-by', atMs: plan.targetEndMs };
  return { kind: 'window', window: plan.next };
}
