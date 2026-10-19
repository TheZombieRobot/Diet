import { describe, expect, it } from 'vitest';
import { zonedWallTimeToInstant } from '../util/time';
import { type EatingWindow, parseClockTime } from './eatingWindow';
import { FAST_CEILING_MS, planFast } from './fastPlan';
import {
  clockBehind,
  fastElapsedMs,
  fastEndHint,
  fastMeter,
  fastSpans,
  type FastTimes,
  isOverCeiling,
  runningPhase,
  runningSpan,
  spanElapsedMs,
} from './fastState';
import type { Schedule } from './windows';

const NZ = 'Pacific/Auckland';
const MIN = 60_000;
const HOUR = 3_600_000;
const at = (date: string, time: string): number =>
  zonedWallTimeToInstant(date, parseClockTime(time), NZ);
const iso = (ms: number): string => new Date(ms).toISOString();
const fast = (id: string, startMs: number, endMs: number | null): FastTimes => ({
  id,
  startedAt: iso(startMs),
  endedAt: endMs === null ? null : iso(endMs),
  timeZone: NZ,
  endedTimeZone: endMs === null ? null : NZ,
});
const schedule = (standing: EatingWindow | null): Schedule => ({
  standing,
  switchTo: null,
  overrides: {},
});
const ONE_MEAL = { start: '18:00', end: '19:00' };
const T0 = at('2000-01-03', '19:00');

describe('fasting spans (HS-02, C63)', () => {
  it.each([
    [59, 1],
    [60, 2],
    [61, 2],
  ])('a gap of %d minutes gives %d span(s)', (gap, spans) => {
    const first = fast('a', T0, T0 + 10 * HOUR);
    const second = fast('b', T0 + 10 * HOUR + gap * MIN, null);
    expect(fastSpans([second, first])).toHaveLength(spans);
  });

  it('ending at 23 h 50 m and starting again a minute later cannot get round the ceiling', () => {
    const firstEnd = T0 + 23 * HOUR + 50 * MIN;
    const fasts = [fast('a', T0, firstEnd), fast('b', firstEnd + MIN, null)];
    const now = firstEnd + MIN + 23 * HOUR + 49 * MIN;
    const span = runningSpan(fasts);
    expect(span?.fasts).toHaveLength(2);
    const elapsed = span === null ? 0 : spanElapsedMs(span, now);
    expect(elapsed).toBe(47 * HOUR + 40 * MIN);
    expect(isOverCeiling(elapsed)).toBe(true);
    expect(runningPhase(elapsed, now, null)).toBe('over-ceiling');
    // The second fast alone would look short.
    expect(fastElapsedMs(fasts[1] ?? fast('x', 0, 0), now)).toBe(23 * HOUR + 49 * MIN);
  });

  it('has no running span once the last fast has ended', () => {
    expect(runningSpan([fast('a', T0, T0 + HOUR)])).toBeNull();
    expect(runningSpan([])).toBeNull();
  });
});

describe('elapsed time and the 24-hour ceiling (HS-02, FS-02, FS-03)', () => {
  it('24:00:00 is not over the ceiling; 24:00:00.001 is', () => {
    expect(isOverCeiling(FAST_CEILING_MS)).toBe(false);
    expect(isOverCeiling(FAST_CEILING_MS + 1)).toBe(true);
  });

  it('is real time from stored instants: 19:00 on 4 April 2026 to 18:00 the next day is exactly 24 hours', () => {
    const span = runningSpan([fast('a', at('2026-04-04', '19:00'), null)]);
    const elapsed = (now: number) => (span === null ? 0 : spanElapsedMs(span, now));
    expect(elapsed(at('2026-04-05', '18:00'))).toBe(FAST_CEILING_MS);
    expect(isOverCeiling(elapsed(at('2026-04-05', '18:00')))).toBe(false);
    expect(isOverCeiling(elapsed(at('2026-04-05', '18:00') + 1000))).toBe(true);
  });

  it('a fast across midnight counts from its stored start, and never below 0', () => {
    expect(fastElapsedMs(fast('a', T0, null), at('2000-01-04', '09:30'))).toBe(14.5 * HOUR);
    expect(fastElapsedMs(fast('a', T0, null), T0 - HOUR)).toBe(0);
  });

  it('notes a phone clock more than 5 minutes behind the start', () => {
    const span = runningSpan([fast('a', T0, null)]);
    expect(span !== null && clockBehind(span, T0 - 4 * MIN)).toBe(false);
    expect(span !== null && clockBehind(span, T0 - 6 * MIN)).toBe(true);
  });

  it('phase: over the ceiling, then 23 hours, then the planned end, then fasting', () => {
    // 22:2 started at 7 pm: the window opens 22 hours later.
    const plan = planFast(T0, NZ, schedule({ start: '17:00', end: '19:00' }));
    expect(runningPhase(22 * HOUR - 1, T0 + 22 * HOUR - 1, plan)).toBe('fasting');
    expect(runningPhase(22 * HOUR, T0 + 22 * HOUR, plan)).toBe('window-open');
    expect(runningPhase(23 * HOUR - 1, T0 + 23 * HOUR - 1, plan)).toBe('window-open');
    expect(runningPhase(23 * HOUR, T0 + 23 * HOUR, plan)).toBe('near-ceiling');
    expect(runningPhase(FAST_CEILING_MS + 1, T0 + FAST_CEILING_MS + 1, plan)).toBe('over-ceiling');
    expect(runningPhase(23 * HOUR - 1, T0 + 23 * HOUR - 1, null)).toBe('fasting');
  });
});

describe('the meter and the end hint (C30)', () => {
  it('23:1 started at 7 pm, at 7:45 pm: 3.125 % progress, the window from 95.833 % for 4.167 %', () => {
    const span = runningSpan([fast('a', T0, null)]);
    const plan = planFast(T0, NZ, schedule(ONE_MEAL));
    const meter = span === null ? null : fastMeter(span, T0 + 45 * MIN, plan);
    expect(meter?.progressPct).toBeCloseTo(3.125, 3);
    expect(meter?.window?.startPct).toBeCloseTo(95.833, 3);
    expect(meter?.window?.widthPct).toBeCloseTo(4.167, 3);
    expect(meter?.over).toBe(false);
  });

  it('16:8 shows its whole window; a capped plan shows none; past 24 hours the bar is full and over', () => {
    const span = runningSpan([fast('a', T0, null)]);
    if (span === null) throw new Error('no span');
    const sixteen = fastMeter(
      span,
      T0 + HOUR,
      planFast(T0, NZ, schedule({ start: '11:00', end: '19:00' })),
    );
    expect(sixteen.window?.startPct).toBeCloseTo((16 / 24) * 100, 3);
    expect(sixteen.window?.widthPct).toBeCloseTo((8 / 24) * 100, 3);
    const capped = planFast(T0, NZ, schedule(ONE_MEAL), T0 - 2 * HOUR);
    expect(capped?.cappedAtCeiling).toBe(true);
    expect(fastMeter(span, T0 + HOUR, capped).window).toBeNull();
    const over = fastMeter(span, T0 + 25 * HOUR, null);
    expect(over).toEqual({ progressPct: 100, window: null, over: true });
  });

  it('the end hint never names a window time near or past the ceiling', () => {
    const plan = planFast(T0, NZ, schedule(ONE_MEAL));
    const capped = planFast(T0, NZ, schedule(ONE_MEAL), T0 - 2 * HOUR);
    expect(fastEndHint('fasting', plan).kind).toBe('window');
    expect(fastEndHint('window-open', plan).kind).toBe('window');
    expect(fastEndHint('near-ceiling', plan)).toEqual({ kind: 'eat-now' });
    expect(fastEndHint('over-ceiling', plan)).toEqual({ kind: 'eat-now' });
    expect(fastEndHint('fasting', capped)).toEqual({ kind: 'eat-by', atMs: T0 + 22 * HOUR });
    expect(fastEndHint('fasting', null)).toEqual({ kind: 'none' });
  });
});
