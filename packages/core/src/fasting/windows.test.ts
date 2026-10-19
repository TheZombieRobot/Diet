import { describe, expect, it } from 'vitest';
import { zonedWallTimeToInstant } from '../util/time';
import { type EatingWindow, parseClockTime } from './eatingWindow';
import {
  fastAfterDay,
  isOneMealWindow,
  isSnackAdded,
  lastWindowEndBefore,
  nextWindowStart,
  openWindowAt,
  type Schedule,
  scheduleFrom,
  type SchedulePreset,
  snackWindowFor,
  standingOn,
  windowContains,
  windowInstance,
  windowOn,
  windowWidens,
} from './windows';

const NZ = 'Pacific/Auckland';
const at = (date: string, time: string): number =>
  zonedWallTimeToInstant(date, parseClockTime(time), NZ);
const w = (start: string, end: string): EatingWindow => ({ start, end });
const preset = (window: EatingWindow | null): SchedulePreset => ({
  fastingPreset: window === null ? null : 'custom',
  eatingWindow: window,
});
const schedule = (
  standing: EatingWindow | null,
  overrides: Record<string, EatingWindow> = {},
): Schedule => ({ standing, switchTo: null, overrides });

const ONE_MEAL = w('18:00', '19:00');
const SNACK_AND_DINNER = w('17:00', '19:00');

/** Every window on a 15-minute grid that windowLength accepts. */
function gridWindows(): EatingWindow[] {
  const clock = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const windows: EatingWindow[] = [];
  for (let start = 0; start < 1440; start += 15) {
    for (let length = 60; length < 1440; length += 15) {
      windows.push(w(clock(start), clock(start + length)));
    }
  }
  return windows;
}

describe('the schedule from the stored records (C07, C55)', () => {
  it('has no window on any day while fasting is gated or no pattern is chosen, overrides included', () => {
    const planDays = [{ date: '2000-01-05', eatingWindow: SNACK_AND_DINNER }];
    for (const s of [
      scheduleFrom({
        preset: preset(ONE_MEAL),
        planDays,
        fastingGated: true,
        kickstart: { running: false },
      }),
      scheduleFrom({
        preset: preset(null),
        planDays,
        fastingGated: false,
        kickstart: { running: false },
      }),
    ]) {
      expect(s.standing).toBeNull();
      expect(windowOn('2000-01-05', s)).toBeNull();
      expect(windowOn('2000-01-06', s)).toBeNull();
    }
  });

  it('plans the effective preset, and the days after a running Kickstart already plan the preset for after it', () => {
    const s = scheduleFrom({
      preset: preset(ONE_MEAL),
      planDays: [],
      fastingGated: false,
      kickstart: { running: true, lastDay: '2000-01-21', presetAfter: preset(SNACK_AND_DINNER) },
    });
    expect(windowOn('2000-01-21', s)).toEqual(ONE_MEAL);
    expect(windowOn('2000-01-22', s)).toEqual(SNACK_AND_DINNER);
    const steady = scheduleFrom({
      preset: preset(SNACK_AND_DINNER),
      planDays: [],
      fastingGated: false,
      kickstart: { running: false },
    });
    expect(steady.switchTo).toBeNull();
    expect(windowOn('2000-01-22', steady)).toEqual(SNACK_AND_DINNER);
  });

  it('a per-day change wins on its own date only; the standing window ignores it', () => {
    const s = scheduleFrom({
      preset: preset(ONE_MEAL),
      planDays: [
        { date: '2000-01-05', eatingWindow: SNACK_AND_DINNER },
        { date: '2000-01-06', eatingWindow: null },
      ],
      fastingGated: false,
      kickstart: { running: false },
    });
    expect(windowOn('2000-01-05', s)).toEqual(SNACK_AND_DINNER);
    expect(standingOn('2000-01-05', s)).toEqual(ONE_MEAL);
    expect(windowOn('2000-01-06', s)).toEqual(ONE_MEAL);
  });

  it('counts a date as "snack added" only for exactly the standing window with the 5 pm snack', () => {
    const s = schedule(ONE_MEAL, {
      '2000-01-05': SNACK_AND_DINNER,
      '2000-01-06': w('17:00', '18:00'), // "Eat 1 hour earlier", not a snack
    });
    expect(isSnackAdded('2000-01-05', s)).toBe(true);
    expect(isSnackAdded('2000-01-06', s)).toBe(false);
    expect(isSnackAdded('2000-01-07', s)).toBe(false);
    expect(isSnackAdded('2000-01-05', schedule(null, s.overrides))).toBe(false);
  });
});

describe('window shapes', () => {
  it('a one-meal window is under 2 hours', () => {
    expect(isOneMealWindow(w('18:00', '19:00'))).toBe(true);
    expect(isOneMealWindow(w('17:01', '19:00'))).toBe(true);
    expect(isOneMealWindow(SNACK_AND_DINNER)).toBe(false);
  });

  it('contains is wrap-aware, start inclusive, end exclusive', () => {
    expect(windowContains(w('22:00', '02:00'), '01:00')).toBe(true);
    expect(windowContains(w('22:00', '02:00'), '02:00')).toBe(false);
    expect(windowContains(SNACK_AND_DINNER, '17:00')).toBe(true);
    expect(windowContains(ONE_MEAL, '17:00')).toBe(false);
  });

  it('widens only when strictly containing and longer', () => {
    expect(windowWidens(SNACK_AND_DINNER, ONE_MEAL)).toBe(true);
    expect(windowWidens(w('17:00', '00:30'), w('23:00', '00:30'))).toBe(true);
    expect(windowWidens(ONE_MEAL, ONE_MEAL)).toBe(false);
    expect(windowWidens(w('17:00', '18:00'), ONE_MEAL)).toBe(false);
    expect(windowWidens(w('16:00', '18:30'), ONE_MEAL)).toBe(false);
  });

  it.each([
    ['18:00', '19:00', w('17:00', '19:00')],
    ['23:00', '00:30', w('17:00', '00:30')],
    ['22:00', '02:00', w('17:00', '02:00')],
    ['20:00', '18:00', null], // already holds 5 pm
    ['18:00', '17:30', null],
    ['17:00', '19:00', null],
    ['11:00', '19:00', null],
    ['06:00', '07:00', null],
  ])('the 5 pm snack for %s–%s is %j', (start, end, expected) => {
    expect(snackWindowFor(w(start, end))).toEqual(expected);
  });

  it('the 5 pm snack never narrows a window: every result widens it (property, 15-minute grid)', () => {
    for (const window of gridWindows()) {
      const snack = snackWindowFor(window);
      if (snack !== null) expect(windowWidens(snack, window), JSON.stringify(window)).toBe(true);
    }
  });
});

describe('window instances in real time', () => {
  it('a window that wraps past midnight ends on the next date', () => {
    const instance = windowInstance('2000-01-04', w('22:00', '02:00'), NZ);
    expect(instance.startMs).toBe(at('2000-01-04', '22:00'));
    expect(instance.endMs).toBe(at('2000-01-05', '02:00'));
  });

  it('a one-hour window over the hour skipped in spring still lasts at least a minute', () => {
    const instance = windowInstance('2026-09-27', w('02:00', '03:00'), NZ);
    expect(instance.endMs).toBeGreaterThanOrEqual(instance.startMs + 60_000);
  });

  it('the next window: before, inside and after a window, across an override, none without a pattern', () => {
    const s = schedule(ONE_MEAL, { '2000-01-05': SNACK_AND_DINNER });
    expect(nextWindowStart(at('2000-01-04', '14:00'), NZ, s)?.startMs).toBe(
      at('2000-01-04', '18:00'),
    );
    expect(nextWindowStart(at('2000-01-04', '18:30'), NZ, s)?.startMs).toBe(
      at('2000-01-05', '17:00'),
    );
    expect(nextWindowStart(at('2000-01-04', '19:00'), NZ, s)?.date).toBe('2000-01-05');
    expect(nextWindowStart(at('2000-01-04', '14:00'), NZ, schedule(null))).toBeNull();
  });

  it("a wrapped window open at 01:00 is yesterday's instance", () => {
    const s = schedule(w('22:00', '02:00'));
    expect(openWindowAt(at('2000-01-05', '01:00'), NZ, s)?.date).toBe('2000-01-04');
    expect(openWindowAt(at('2000-01-05', '02:00'), NZ, s)).toBeNull();
    expect(lastWindowEndBefore(at('2000-01-05', '09:00'), NZ, s)?.date).toBe('2000-01-04');
  });
});

describe('the fast after a day, across daylight saving (C30)', () => {
  it('a window moved an hour earlier makes a 24-hour fast after it', () => {
    expect(
      fastAfterDay('2000-01-04', schedule(ONE_MEAL, { '2000-01-04': w('17:00', '18:00') }), NZ),
    ).toBe(1440);
  });

  it('the same on the night clocks go back is 25 hours', () => {
    expect(
      fastAfterDay('2026-04-04', schedule(ONE_MEAL, { '2026-04-04': w('17:00', '18:00') }), NZ),
    ).toBe(1500);
  });

  it('a standing 23:1 is 24 hours on the April night and 22 hours on the September night', () => {
    expect(fastAfterDay('2026-04-04', schedule(ONE_MEAL), NZ)).toBe(1440);
    expect(fastAfterDay('2026-09-26', schedule(ONE_MEAL), NZ)).toBe(1320);
    expect(fastAfterDay('2000-01-04', schedule(ONE_MEAL), NZ)).toBe(1380);
  });

  it('is 0 when the next window opens before this one ends, and null without a pattern', () => {
    const s = schedule(w('18:00', '20:00'), { '2000-01-04': w('20:00', '19:00') });
    expect(fastAfterDay('2000-01-04', s, NZ)).toBe(0);
    expect(fastAfterDay('2000-01-04', schedule(null), NZ)).toBeNull();
  });
});
