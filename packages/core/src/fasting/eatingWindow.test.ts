import { describe, expect, it } from 'vitest';
import {
  FASTING_PRESETS,
  KICKSTART_DEFAULT_PRESET,
  MAX_PLANNED_FAST_HOURS,
  parseClockTime,
  windowLength,
} from './eatingWindow';

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
    ['07:00', '07:01', 1, null],
  ])('%s to %s is %d minutes of eating', (start, end, eatingMinutes, ratio) => {
    const result = windowLength({ start, end });
    expect(result.eatingMinutes).toBe(eatingMinutes);
    expect(result.fastingMinutes).toBe(1440 - eatingMinutes);
    expect(result.ratio).toBe(ratio);
  });

  it('rejects a window that starts and ends at the same time', () => {
    expect(() => windowLength({ start: '19:00', end: '19:00' })).toThrow(RangeError);
  });

  it.each(['24:00', '7:00', '19:60', '19:00 ', 'noon', ''])('rejects clock time %j', (t) => {
    expect(() => parseClockTime(t)).toThrow(RangeError);
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
});
