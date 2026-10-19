import { describe, expect, it } from 'vitest';
import { addDays, zonedWallTimeToInstant } from '../util/time';
import { type EatingWindow, parseClockTime } from './eatingWindow';
import { FAST_CEILING_MS, fastRecordPlan, planEndClock, planFast } from './fastPlan';
import type { Schedule } from './windows';

const NZ = 'Pacific/Auckland';
const at = (date: string, time: string): number =>
  zonedWallTimeToInstant(date, parseClockTime(time), NZ);
const w = (start: string, end: string): EatingWindow => ({ start, end });
const schedule = (
  standing: EatingWindow | null,
  overrides: Record<string, EatingWindow> = {},
): Schedule => ({ standing, switchTo: null, overrides });

const ONE_MEAL = w('18:00', '19:00');
const SNACK_AND_DINNER = w('17:00', '19:00');
const D = '2000-01-04';

describe('the planned fast (FS-01, FS-06, C30, D47)', () => {
  it('runs from the real start to the next window: 23:1 after dinner is 23 hours', () => {
    const plan = planFast(at(D, '19:00'), NZ, schedule(ONE_MEAL));
    expect(plan?.plannedMinutes).toBe(1380);
    expect(plan?.cappedAtCeiling).toBe(false);
    expect(fastRecordPlan(plan)).toEqual({
      plannedFastMinutes: 1380,
      snackTime: null,
      dinnerTime: '19:00',
    });
  });

  it('22:2 records the 5 pm snack and dinner', () => {
    expect(fastRecordPlan(planFast(at(D, '19:00'), NZ, schedule(SNACK_AND_DINNER)))).toEqual({
      plannedFastMinutes: 1320,
      snackTime: '17:00',
      dinnerTime: '19:00',
    });
  });

  it('a late start makes the plan shorter: 14:00 before an 18:00 window is 4 hours', () => {
    expect(planFast(at(D, '14:00'), NZ, schedule(ONE_MEAL))?.plannedMinutes).toBe(240);
  });

  it('a start inside the window on the night clocks go back is capped at 24 hours: eat by 5:30 pm', () => {
    const start = at('2026-04-04', '18:30');
    const plan = planFast(start, NZ, schedule(ONE_MEAL));
    expect(plan?.cappedAtCeiling).toBe(true);
    expect(plan?.plannedMinutes).toBe(1440);
    expect((plan?.targetEndMs ?? 0) - start).toBe(86_400_000);
    // 18:30 NZDT is 05:30Z; 24 hours later is 05:30Z, which is 17:30 NZST.
    expect(plan === null ? null : planEndClock(plan, NZ)).toBe('17:30');
    expect(fastRecordPlan(plan)).toEqual({
      plannedFastMinutes: 1440,
      snackTime: null,
      dinnerTime: null,
    });
  });

  it('a start at 19:00 that night is exactly 24 hours and not capped; in September it is 22 hours', () => {
    const start = at('2026-04-04', '19:00');
    const plan = planFast(start, NZ, schedule(ONE_MEAL));
    expect((plan?.targetEndMs ?? 0) - start).toBe(FAST_CEILING_MS);
    expect(plan?.cappedAtCeiling).toBe(false);
    expect(plan?.plannedMinutes).toBe(1440);
    expect(planFast(at('2026-09-26', '19:00'), NZ, schedule(ONE_MEAL))?.plannedMinutes).toBe(1320);
  });

  it('is capped exactly when the next window opens more than 86,400,000 ms after the span start', () => {
    const next = at('2000-01-05', '18:00');
    const s = schedule(ONE_MEAL);
    const start = at(D, '19:00');
    expect(planFast(start, NZ, s, next - FAST_CEILING_MS)?.cappedAtCeiling).toBe(false);
    expect(planFast(start, NZ, s, next - FAST_CEILING_MS - 1)?.cappedAtCeiling).toBe(true);
  });

  it('a later window tomorrow is capped at 24 hours: eat by 7:00 pm', () => {
    const plan = planFast(
      at(D, '19:00'),
      NZ,
      schedule(ONE_MEAL, { '2000-01-05': w('20:00', '21:00') }),
    );
    expect(plan?.cappedAtCeiling).toBe(true);
    expect(plan?.plannedMinutes).toBe(1440);
    expect(plan === null ? null : planEndClock(plan, NZ)).toBe('19:00');
  });

  it('a pattern saved at 19:00 plans from the real start to its next window', () => {
    expect(planFast(at(D, '19:00'), NZ, schedule(w('19:30', '20:30')))?.plannedMinutes).toBe(30);
    expect(planFast(at(D, '19:00'), NZ, schedule(w('06:00', '07:00')))?.plannedMinutes).toBe(660);
  });

  it('a fast started a minute after the last one ended is capped from the span start', () => {
    // 19:00 Monday to 18:50 Tuesday, then a new start at 18:51 Tuesday.
    const plan = planFast(
      at('2000-01-04', '18:51'),
      NZ,
      schedule(ONE_MEAL),
      at('2000-01-03', '19:00'),
    );
    expect(plan?.cappedAtCeiling).toBe(true);
    expect(plan?.targetEndMs).toBe(at('2000-01-04', '19:00'));
    expect(plan?.plannedMinutes).toBe(9);
  });

  it('has no plan without a pattern, or with under a minute left before 24 hours of the span', () => {
    expect(planFast(at(D, '19:00'), NZ, schedule(null))).toBeNull();
    expect(fastRecordPlan(null)).toEqual({
      plannedFastMinutes: null,
      snackTime: null,
      dinnerTime: null,
    });
    const start = at(D, '19:00');
    expect(planFast(start, NZ, schedule(ONE_MEAL), start - FAST_CEILING_MS + 59_000)).toBeNull();
  });

  it('never plans past 24 hours of the span, and stores only 1 to 1440 (property, ordinary and daylight-saving days)', () => {
    const clock = (m: number) =>
      `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const lengths = [60, 105, 120, 480, 1035, 1380];
    const problems: string[] = [];
    for (const day of ['2000-01-04', '2026-04-04', '2026-09-26']) {
      // Window starts on a 15-minute grid (each hour, at a different quarter), every 3 hours of start.
      for (let hour = 0; hour < 24; hour++) {
        const windowStart = hour * 60 + (hour % 4) * 15;
        for (const length of lengths) {
          const s = schedule(w(clock(windowStart), clock(windowStart + length)));
          for (let startAt = (hour % 4) * 45; startAt < 2880; startAt += 180) {
            const start = at(startAt < 1440 ? day : addDays(day, 1), clock(startAt));
            const plan = planFast(start, NZ, s);
            if (plan === null) continue;
            const stored = fastRecordPlan(plan).plannedFastMinutes ?? 0;
            if (
              !Number.isInteger(plan.plannedMinutes) ||
              plan.plannedMinutes < 1 ||
              plan.plannedMinutes > 1440 ||
              plan.targetEndMs - start > FAST_CEILING_MS ||
              stored !== plan.plannedMinutes
            ) {
              problems.push(`${day} ${JSON.stringify(s.standing)} from ${clock(startAt)}`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
