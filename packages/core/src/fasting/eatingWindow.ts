const MINUTES_PER_DAY = 24 * 60;

/** A wall-clock time "HH:MM" on a 24-hour clock, for example "17:00" for 5 pm. */
export type ClockTime = string;

/** Minutes after midnight for a "HH:MM" clock time. Throws on anything else. */
export function parseClockTime(time: ClockTime): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new RangeError(`Clock time must be "HH:MM" (00:00 to 23:59), got "${time}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface EatingWindow {
  /** First moment of the eating window, for example "17:00" for a 5 pm snack. */
  start: ClockTime;
  /** End of the eating window, for example "19:00" when the final meal is at 7 pm. */
  end: ClockTime;
}

export interface WindowLength {
  eatingMinutes: number;
  fastingMinutes: number;
  /** "22:2" style label when both parts are whole hours, otherwise null. */
  ratio: string | null;
}

/**
 * Window length is computed from the clock times, wrapping past midnight (HS-17, NN-02,
 * FL-08, FL-09, FL-14). A 5 pm snack and a 7 pm final meal is 2 hours of eating and 22 hours of
 * fasting (22:2), not 4 hours. Equal start and end is rejected: it would mean either no eating
 * window or no fast, and the app plans neither.
 */
export function windowLength(window: EatingWindow): WindowLength {
  const start = parseClockTime(window.start);
  const end = parseClockTime(window.end);
  const eatingMinutes = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (eatingMinutes === 0) {
    throw new RangeError('The eating window must start and end at different times');
  }
  const fastingMinutes = MINUTES_PER_DAY - eatingMinutes;
  const ratio = eatingMinutes % 60 === 0 ? `${fastingMinutes / 60}:${eatingMinutes / 60}` : null;
  return { eatingMinutes, fastingMinutes, ratio };
}

export type FastingPresetId = '16:8' | '18:6' | '20:4' | '22:2' | '23:1';

export interface FastingPreset {
  id: FastingPresetId;
  /** Default clock times; the owner can move the window and the length is recomputed. */
  window: EatingWindow;
}

/**
 * Presets (HEALTH_SAFETY.md section 3; DECISIONS.md). Every default window ends at 7 pm, the
 * planned dinner time; 22:2 starts at the 5 pm snack. 23:1 is the Kickstart default.
 */
export const FASTING_PRESETS: readonly FastingPreset[] = [
  { id: '16:8', window: { start: '11:00', end: '19:00' } },
  { id: '18:6', window: { start: '13:00', end: '19:00' } },
  { id: '20:4', window: { start: '15:00', end: '19:00' } },
  { id: '22:2', window: { start: '17:00', end: '19:00' } },
  { id: '23:1', window: { start: '18:00', end: '19:00' } },
];

export const KICKSTART_DEFAULT_PRESET: FastingPresetId = '23:1';

/** The longest fast the app will plan, in hours (HEALTH_SAFETY.md section 3). */
export const MAX_PLANNED_FAST_HOURS = 24;
