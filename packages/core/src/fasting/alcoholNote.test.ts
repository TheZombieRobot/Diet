import { describe, expect, it } from 'vitest';
import { zonedWallTimeToInstant } from '../util/time';
import { parseClockTime } from './eatingWindow';
import { alcoholNoteApplies, drinkDuringFast } from './alcoholNote';
import type { Schedule } from './windows';

const NZ = 'Pacific/Auckland';
const iso = (date: string, time: string): string =>
  new Date(zonedWallTimeToInstant(date, parseClockTime(time), NZ)).toISOString();
const NOW = Date.parse(iso('2000-01-05', '09:00'));
const ONE_MEAL: Schedule = {
  standing: { start: '18:00', end: '19:00' },
  switchTo: null,
  overrides: {},
};
const NONE: Schedule = { standing: null, switchTo: null, overrides: {} };
const running = [{ startedAt: iso('2000-01-04', '19:00'), endedAt: null }];
const completed = [{ startedAt: iso('2000-01-03', '19:00'), endedAt: iso('2000-01-04', '18:00') }];
const drink = (date: string, time: string) => ({ at: iso(date, time), timeZone: NZ });

describe('the neutral alcohol note (FS-05, C11, C63)', () => {
  it('applies to a drink inside a running fast, including at its exact start', () => {
    expect(alcoholNoteApplies(drink('2000-01-04', '22:00'), running, NONE, NOW)).toBe(true);
    expect(drinkDuringFast(iso('2000-01-04', '19:00'), running, NOW)).toBe(true);
  });

  it('does not apply before a fast started, or after a completed fast ended, when no pattern is chosen', () => {
    expect(alcoholNoteApplies(drink('2000-01-04', '18:30'), running, NONE, NOW)).toBe(false);
    expect(alcoholNoteApplies(drink('2000-01-04', '18:30'), completed, NONE, NOW)).toBe(false);
  });

  it('with a pattern, applies outside the planned window and not inside it', () => {
    expect(alcoholNoteApplies(drink('2000-01-04', '12:00'), [], ONE_MEAL, NOW)).toBe(true);
    expect(alcoholNoteApplies(drink('2000-01-04', '18:30'), [], ONE_MEAL, NOW)).toBe(false);
  });
});
