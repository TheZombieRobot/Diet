import { describe, expect, it } from 'vitest';
import {
  type EatingWindow,
  fastBetween,
  FASTING_PRESETS,
  KICKSTART_DEFAULT_PRESET,
  MAX_PLANNED_FAST_HOURS,
  MIN_EATING_MINUTES,
  parseClockTime,
  plannedFastMinutes,
  windowLength,
  withinFastCeiling,
} from './eatingWindow';

const NZ = 'Pacific/Auckland';

describe('eating window length from clock times (HS-17)', () => {
  it('5 pm snack and 7 pm final meal is a 2-hour window, 22:2, not 4 hours (NN-02, FL-08)', () => {
    expect(windowLength({ start: '17:00', end: '19:00' })).toEqual({
      eatingMinutes: 120,
      fastingMinutes: 1320,
      ratio: '22:2',
    });
  });

  it('wraps past midnight: 22:00 to 02:00 is 4 hours of eating (FL-09)', () => {
    expect(windowLength({ start: '22:00', end: '02:00' })).toEqual({
      eatingMinutes: 240,
      fastingMinutes: 1200,
      ratio: '20:4',
    });
  });

  it('6 pm to 7 pm is 1 hour eating, 23 hours fasting, within the 24-hour ceiling (FL-14)', () => {
    const result = windowLength({ start: '18:00', end: '19:00' });
    expect(result).toEqual({ eatingMinutes: 60, fastingMinutes: 1380, ratio: '23:1' });
    expect(result.fastingMinutes).toBeLessThan(MAX_PLANNED_FAST_HOURS * 60);
  });

  it.each([
    ['11:00', '19:00', 480, '16:8'],
    ['20:00', '04:00', 480, '16:8'],
    ['23:30', '00:30', 60, '23:1'],
    ['00:00', '23:59', 1439, null],
    ['17:30', '19:00', 90, null],
    ['07:00', '08:01', 61, null],
  ])('%s to %s is %d minutes of eating', (start, end, eatingMinutes, ratio) => {
    const result = windowLength({ start, end });
    expect(result.eatingMinutes).toBe(eatingMinutes);
    expect(result.fastingMinutes).toBe(1440 - eatingMinutes);
    expect(result.ratio).toBe(ratio);
  });

  it('rejects a window that starts and ends at the same time', () => {
    expect(() => windowLength({ start: '19:00', end: '19:00' })).toThrow(RangeError);
  });

  it('rejects a custom window under 60 minutes, so a repeating fast is at most 23 hours', () => {
    expect(MIN_EATING_MINUTES).toBe(60);
    expect(() => windowLength({ start: '18:30', end: '19:00' })).toThrow(RangeError);
    expect(() => windowLength({ start: '07:00', end: '07:01' })).toThrow(RangeError);
    expect(() => windowLength({ start: '23:59', end: '00:58' })).toThrow(RangeError);
    expect(windowLength({ start: '23:59', end: '00:59' }).fastingMinutes).toBe(23 * 60);
  });

  it.each(['24:00', '7:00', '19:60', '19:00 ', 'noon', ''])('rejects clock time %j', (t) => {
    expect(() => parseClockTime(t)).toThrow(RangeError);
  });
});

describe('the fast between two days when the window changes', () => {
  it('equals fastingMinutes when the same window repeats, including past midnight', () => {
    for (const window of [
      ...FASTING_PRESETS.map((p) => p.window),
      { start: '22:00', end: '02:00' },
    ]) {
      expect(fastBetween(window, window)).toBe(windowLength(window).fastingMinutes);
    }
  });

  it('16:00–17:00 then 18:00–19:00 is a 25-hour fast, over the ceiling, although both are 23:1', () => {
    const earlier: EatingWindow = { start: '16:00', end: '17:00' };
    const usual: EatingWindow = { start: '18:00', end: '19:00' };
    expect(windowLength(earlier).fastingMinutes).toBe(1380);
    expect(windowLength(usual).fastingMinutes).toBe(1380);
    expect(fastBetween(earlier, usual)).toBe(1500);
    expect(withinFastCeiling(fastBetween(earlier, usual))).toBe(false);
    expect(fastBetween(usual, earlier)).toBe(1260);
  });

  it('a window ending after midnight ends on the following day', () => {
    expect(fastBetween({ start: '22:00', end: '01:00' }, { start: '12:00', end: '20:00' })).toBe(
      660,
    );
  });

  it('refuses a next window that starts before the previous one ends', () => {
    expect(() =>
      fastBetween({ start: '20:00', end: '02:00' }, { start: '01:00', end: '03:00' }),
    ).toThrow(RangeError);
  });
});

describe('real fast length across daylight-saving changes (24-hour ceiling)', () => {
  it('clocks go back (NZ, 5 April 2026): 19:00 to 18:30 the next day is 1470 real minutes, over the ceiling', () => {
    const minutes = plannedFastMinutes({
      fromDate: '2026-04-04',
      fromTime: '19:00',
      toDate: '2026-04-05',
      toTime: '18:30',
      timeZone: NZ,
    });
    expect(minutes).toBe(1470);
    expect(withinFastCeiling(minutes)).toBe(false);
  });

  it('the 23:1 preset that night is exactly 1440 minutes, which is allowed', () => {
    const minutes = plannedFastMinutes({
      fromDate: '2026-04-04',
      fromTime: '19:00',
      toDate: '2026-04-05',
      toTime: '18:00',
      timeZone: NZ,
    });
    expect(minutes).toBe(1440);
    expect(withinFastCeiling(minutes)).toBe(true);
  });

  it('clocks go forward (NZ, 27 September 2026): 19:00 to 17:00 the next day is 1260 minutes', () => {
    expect(
      plannedFastMinutes({
        fromDate: '2026-09-26',
        fromTime: '19:00',
        toDate: '2026-09-27',
        toTime: '17:00',
        timeZone: NZ,
      }),
    ).toBe(1260);
  });

  it('an ordinary night matches the wall-clock fast', () => {
    expect(
      plannedFastMinutes({
        fromDate: '2026-10-19',
        fromTime: '19:00',
        toDate: '2026-10-20',
        toTime: '18:00',
        timeZone: NZ,
      }),
    ).toBe(windowLength({ start: '18:00', end: '19:00' }).fastingMinutes);
  });

  it('refuses a fast that ends before it starts, and invalid zones', () => {
    const fast = {
      fromDate: '2026-10-20',
      fromTime: '19:00',
      toDate: '2026-10-20',
      toTime: '18:00',
      timeZone: NZ,
    };
    expect(() => plannedFastMinutes(fast)).toThrow(RangeError);
    expect(() =>
      plannedFastMinutes({ ...fast, toDate: '2026-10-21', timeZone: 'Mars/Olympus' }),
    ).toThrow(RangeError);
  });

  it('the ceiling is 24 hours inclusive', () => {
    expect(withinFastCeiling(1440)).toBe(true);
    expect(withinFastCeiling(1441)).toBe(false);
    expect(() => withinFastCeiling(Number.NaN)).toThrow(RangeError);
    expect(() => withinFastCeiling(-1)).toThrow(RangeError);
  });
});

describe('fasting presets', () => {
  it('are exactly 16:8, 18:6, 20:4, 22:2 and 23:1, each computing to its own label', () => {
    expect(FASTING_PRESETS.map((p) => p.id)).toEqual(['16:8', '18:6', '20:4', '22:2', '23:1']);
    for (const preset of FASTING_PRESETS) {
      expect(windowLength(preset.window).ratio).toBe(preset.id);
    }
  });

  it('none plans a fast of 24 hours or more', () => {
    for (const preset of FASTING_PRESETS) {
      expect(windowLength(preset.window).fastingMinutes).toBeLessThan(MAX_PLANNED_FAST_HOURS * 60);
    }
  });

  it('22:2 starts at the 5 pm snack and ends after the 7 pm meal', () => {
    expect(FASTING_PRESETS.find((p) => p.id === '22:2')?.window).toEqual({
      start: '17:00',
      end: '19:00',
    });
  });

  it('23:1 is the Kickstart default', () => {
    expect(KICKSTART_DEFAULT_PRESET).toBe('23:1');
  });

  it('are frozen all the way down, so the shared defaults cannot be changed in place', () => {
    expect(Object.isFrozen(FASTING_PRESETS)).toBe(true);
    for (const preset of FASTING_PRESETS) {
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.window)).toBe(true);
      expect(() => {
        (preset.window as EatingWindow).start = '05:00';
      }).toThrow(TypeError);
    }
    expect(FASTING_PRESETS[0]?.window.start).toBe('11:00');
  });
});
