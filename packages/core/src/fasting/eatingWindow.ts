import { assertInRange } from '../util/round';
import { type LocalDate, zonedWallTimeToInstant } from '../util/time';

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

/** The longest fast the app will plan, in hours (HEALTH_SAFETY.md section 3). */
export const MAX_PLANNED_FAST_HOURS = 24;

/**
 * The shortest eating window, preset or custom, in minutes. 23:1 is the shortest window, so the
 * fast between two identical windows is at most 23 hours, leaving an hour of margin under the
 * 24-hour ceiling for a daylight-saving change or a later start.
 */
export const MIN_EATING_MINUTES = 60;

export interface WindowLength {
  eatingMinutes: number;
  /**
   * Fast length if this window repeats every day (wall clock): 24 h minus the eating window.
   * On the day the window changes, or on a daylight-saving night, the real fast differs; use
   * fastBetween and plannedFastMinutes for those.
   */
  fastingMinutes: number;
  /** "22:2" style label when both parts are whole hours, otherwise null. */
  ratio: string | null;
}

/**
 * Window length is computed from the clock times, wrapping past midnight (HS-17, NN-02,
 * FL-08, FL-09, FL-14). A 5 pm snack and a 7 pm final meal is 2 hours of eating and 22 hours of
 * fasting (22:2), not 4 hours. Equal start and end is rejected: it would mean either no eating
 * window or no fast, and the app plans neither. A window shorter than MIN_EATING_MINUTES is
 * rejected too.
 */
export function windowLength(window: EatingWindow): WindowLength {
  const start = parseClockTime(window.start);
  const end = parseClockTime(window.end);
  const eatingMinutes = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (eatingMinutes === 0) {
    throw new RangeError('The eating window must start and end at different times');
  }
  if (eatingMinutes < MIN_EATING_MINUTES) {
    throw new RangeError(
      `The eating window must be at least ${MIN_EATING_MINUTES} minutes, got ${eatingMinutes}`,
    );
  }
  const fastingMinutes = MINUTES_PER_DAY - eatingMinutes;
  const ratio = eatingMinutes % 60 === 0 ? `${fastingMinutes / 60}:${eatingMinutes / 60}` : null;
  return { eatingMinutes, fastingMinutes, ratio };
}

/**
 * Wall-clock minutes of fasting from the end of `previous` (eaten on one day) to the start of
 * `next` (eaten on the following day). When the window changes between days this differs from
 * either day's fastingMinutes: 16:00–17:00 followed by 18:00–19:00 is a 25-hour fast although
 * both are 23:1 windows. A window that wraps past midnight ends on the following calendar day.
 * Throws if `next` would start before `previous` has ended.
 */
export function fastBetween(previous: EatingWindow, next: EatingWindow): number {
  const previousEnd = parseClockTime(previous.start) + windowLength(previous).eatingMinutes;
  const nextStart = MINUTES_PER_DAY + parseClockTime(next.start);
  windowLength(next); // validates the next window too
  const minutes = nextStart - previousEnd;
  if (minutes <= 0) {
    throw new RangeError('The next eating window starts before the previous one ends');
  }
  return minutes;
}

export interface PlannedFast {
  /** Local date and clock time the fast starts (the end of the eating window). */
  fromDate: LocalDate;
  fromTime: ClockTime;
  /** Local date and clock time the fast ends (the start of the next eating window). */
  toDate: LocalDate;
  toTime: ClockTime;
  /** IANA time zone the clock times are read in, e.g. "Pacific/Auckland". */
  timeZone: string;
}

/**
 * Real elapsed minutes of a planned fast between two local clock times, measured across
 * daylight-saving changes (DATA_MODEL.md: fasts are measured in UTC). In New Zealand the night
 * clocks go back is an hour longer: 19:00 on 4 April 2026 to 18:30 on 5 April 2026 is 1470 minutes,
 * not 1410. A time skipped when clocks go forward moves to the first valid minute after it.
 */
export function plannedFastMinutes(fast: PlannedFast): number {
  const from = zonedWallTimeToInstant(fast.fromDate, parseClockTime(fast.fromTime), fast.timeZone);
  const to = zonedWallTimeToInstant(fast.toDate, parseClockTime(fast.toTime), fast.timeZone);
  const minutes = (to - from) / 60_000;
  if (minutes <= 0) throw new RangeError('A planned fast must end after it starts');
  return minutes;
}

/** True when a planned fast of `minutes` is within the 24-hour ceiling (HEALTH_SAFETY.md section 3). */
export function withinFastCeiling(minutes: number): boolean {
  assertInRange('minutes', minutes, 0, Number.MAX_SAFE_INTEGER);
  return minutes <= MAX_PLANNED_FAST_HOURS * 60;
}

export type FastingPresetId = '16:8' | '18:6' | '20:4' | '22:2' | '23:1';

export interface FastingPreset {
  readonly id: FastingPresetId;
  /** Default clock times; the owner can move the window and the length is recomputed. */
  readonly window: Readonly<EatingWindow>;
}

const preset = (id: FastingPresetId, start: ClockTime, end: ClockTime): FastingPreset =>
  Object.freeze({ id, window: Object.freeze({ start, end }) });

/**
 * Presets (HEALTH_SAFETY.md section 3; DECISIONS.md). Every default window ends at 7 pm, the
 * planned dinner time; 22:2 starts at the 5 pm snack. 23:1 is the Kickstart default. Frozen all
 * the way down, so an edit screen cannot change the shared defaults by mutating a preset.
 */
export const FASTING_PRESETS: readonly FastingPreset[] = Object.freeze([
  preset('16:8', '11:00', '19:00'),
  preset('18:6', '13:00', '19:00'),
  preset('20:4', '15:00', '19:00'),
  preset('22:2', '17:00', '19:00'),
  preset('23:1', '18:00', '19:00'),
]);

export const KICKSTART_DEFAULT_PRESET: FastingPresetId = '23:1';
