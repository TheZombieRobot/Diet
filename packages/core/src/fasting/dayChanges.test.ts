import { describe, expect, it } from 'vitest';
import { addDays, zonedWallTimeToInstant } from '../util/time';
import { type EatingWindow, FASTING_PRESETS, parseClockTime } from './eatingWindow';
import {
  applyDayChanges,
  DAY_CHANGE_MAX_FAST_MINUTES,
  dayWindowChangeAllowed,
  earlierOption,
  splitOption,
  staleOverrides,
} from './dayChanges';
import { fastAfterDay, type Schedule } from './windows';

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
const MORNING = at(D, '09:00');

describe('the per-day change limit (C30, HS-18)', () => {
  it('allows a change that shortens a fast, and one that leaves it at 23 hours', () => {
    const s = schedule(SNACK_AND_DINNER);
    expect(dayWindowChangeAllowed(s, [{ date: D, window: w('11:00', '19:00') }], NZ)).toBe(true);
    expect(dayWindowChangeAllowed(s, [{ date: D, window: w('17:00', '18:00') }], NZ)).toBe(true);
  });

  it('refuses a change that leaves a fast at 23 hours and a minute', () => {
    const s = schedule(SNACK_AND_DINNER);
    expect(dayWindowChangeAllowed(s, [{ date: D, window: w('16:30', '17:59') }], NZ)).toBe(false);
    expect(DAY_CHANGE_MAX_FAST_MINUTES).toBe(1380);
  });

  it('allows a fast over 23 hours only when the standing pattern is as long, and never past 24 hours', () => {
    // 23:1 on the night clocks go back is 24 hours by design (the plan is capped at the start).
    const s = schedule(ONE_MEAL);
    expect(fastAfterDay('2026-04-04', s, NZ)).toBe(1440);
    expect(dayWindowChangeAllowed(s, [{ date: '2026-04-04', window: SNACK_AND_DINNER }], NZ)).toBe(
      true,
    );
    expect(
      dayWindowChangeAllowed(s, [{ date: '2026-04-04', window: w('17:00', '18:00') }], NZ),
    ).toBe(false);
  });

  it("refuses to undo a day's snack while the day before holds an earlier window (24 hours)", () => {
    const s = schedule(ONE_MEAL, {
      '2000-01-03': w('17:00', '18:00'),
      [D]: SNACK_AND_DINNER,
    });
    expect(dayWindowChangeAllowed(s, [{ date: D, window: null }], NZ)).toBe(false);
    expect(dayWindowChangeAllowed(s, [{ date: '2000-01-03', window: null }], NZ)).toBe(true);
  });
});

describe('"Eat 1 hour earlier" (reflux; C47, C104)', () => {
  it('on 23:1 moves the day an hour earlier and opens the next day earlier too (22 h and 23 h fasts)', () => {
    const option = earlierOption(D, schedule(ONE_MEAL), NZ, MORNING);
    expect(option?.changes).toEqual([
      { date: D, window: w('17:00', '18:00') },
      { date: '2000-01-05', window: w('17:00', '19:00') },
    ]);
    const after = applyDayChanges(schedule(ONE_MEAL), option?.changes ?? []);
    expect(fastAfterDay('2000-01-03', after, NZ)).toBe(1320);
    expect(fastAfterDay(D, after, NZ)).toBe(1380);
  });

  it('on the night clocks go back, the next day opens two hours earlier', () => {
    expect(
      earlierOption('2026-04-04', schedule(ONE_MEAL), NZ, at('2026-04-04', '09:00'))?.changes,
    ).toEqual([
      { date: '2026-04-04', window: w('17:00', '18:00') },
      { date: '2026-04-05', window: w('16:00', '19:00') },
    ]);
  });

  it('on 22:2 and 16:8 moves only the one day', () => {
    expect(earlierOption(D, schedule(SNACK_AND_DINNER), NZ, MORNING)?.changes).toEqual([
      { date: D, window: w('16:00', '18:00') },
    ]);
    expect(earlierOption(D, schedule(w('11:00', '19:00')), NZ, MORNING)?.changes).toEqual([
      { date: D, window: w('10:00', '18:00') },
    ]);
  });

  it('is not offered once its start has passed, over a change, before 01:00, or when the pair is needed and the next day is changed', () => {
    expect(earlierOption(D, schedule(ONE_MEAL), NZ, at(D, '17:00'))).toBeNull();
    expect(earlierOption(D, schedule(ONE_MEAL, { [D]: SNACK_AND_DINNER }), NZ, MORNING)).toBeNull();
    expect(
      earlierOption(D, schedule(w('00:30', '08:30')), NZ, at('2000-01-03', '20:00')),
    ).toBeNull();
    expect(
      earlierOption(D, schedule(ONE_MEAL, { '2000-01-05': w('17:30', '19:00') }), NZ, MORNING),
    ).toBeNull();
  });
});

describe('"Split the meal" (reflux; C47)', () => {
  it('on 23:1 adds the 5 pm snack', () => {
    expect(splitOption(D, schedule(ONE_MEAL), NZ, MORNING)).toEqual({
      changes: [{ date: D, window: SNACK_AND_DINNER }],
    });
  });

  it.each([
    ['22:2', SNACK_AND_DINNER],
    ['16:8', w('11:00', '19:00')],
    ['20:00–18:00', w('20:00', '18:00')],
  ])('is "already" for %s, whose window holds 5 pm', (_name, window) => {
    expect(splitOption(D, schedule(window), NZ, MORNING)).toBe('already');
  });

  it('is not offered for a morning window, or after 5 pm', () => {
    expect(splitOption(D, schedule(w('06:00', '07:00')), NZ, at('2000-01-03', '20:00'))).toBeNull();
    expect(splitOption(D, schedule(ONE_MEAL), NZ, at(D, '17:30'))).toBeNull();
  });
});

describe('per-day changes that no longer fit a new pattern (C30)', () => {
  it('a snack day is stale under 16:8 (narrower) and kept under 23:1 (still wider)', () => {
    const overrides = { '2000-01-05': SNACK_AND_DINNER };
    expect(staleOverrides(schedule(w('11:00', '19:00'), overrides), D, NZ)).toEqual(['2000-01-05']);
    expect(staleOverrides(schedule(ONE_MEAL, overrides), D, NZ)).toEqual([]);
  });

  it('an earlier-window day is stale after any pattern change, and dates before today are left alone', () => {
    const overrides = { '2000-01-03': w('17:00', '18:00'), '2000-01-05': w('17:00', '18:00') };
    expect(staleOverrides(schedule(ONE_MEAL, overrides), D, NZ)).toEqual(['2000-01-05']);
  });

  it('after clearing the stale dates, every fast next to a remaining change is within the limit (property)', () => {
    const windows = [
      ...FASTING_PRESETS.map((p) => p.window),
      w('17:00', '18:00'),
      w('16:00', '19:00'),
      w('10:00', '18:00'),
      w('19:30', '20:30'),
      w('06:00', '07:00'),
      w('22:00', '02:00'),
    ];
    let seed = 7;
    const pick = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    for (let round = 0; round < 150; round++) {
      const start = round % 2 === 0 ? D : '2026-04-02';
      const overrides: Record<string, EatingWindow> = {};
      for (let day = 0; day < 4; day++) {
        if (pick(2) === 0)
          overrides[addDays(start, day)] = windows[pick(windows.length)] ?? ONE_MEAL;
      }
      const s = schedule(windows[pick(windows.length)] ?? ONE_MEAL, overrides);
      const stale = staleOverrides(s, start, NZ);
      const kept = applyDayChanges(
        s,
        stale.map((date) => ({ date, window: null })),
      );
      const standingOnly = schedule(s.standing);
      for (const date of Object.keys(kept.overrides)) {
        for (const x of [addDays(date, -1), date]) {
          const fast = fastAfterDay(x, kept, NZ) ?? 0;
          const standing = fastAfterDay(x, standingOnly, NZ) ?? 0;
          expect(fast, JSON.stringify({ s, x })).toBeGreaterThan(0);
          expect(fast <= DAY_CHANGE_MAX_FAST_MINUTES || fast <= standing).toBe(true);
          expect(fast).toBeLessThanOrEqual(1440);
        }
      }
    }
  });
});
