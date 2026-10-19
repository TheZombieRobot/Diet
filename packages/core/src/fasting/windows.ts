/**
 * The eating windows of each day and their real instants (item 15; HEALTH_SAFETY.md section 3;
 * DOC_REVIEW C30, C55, C73). A Schedule is the standing window plus the per-day changes stored in
 * plan_days.eatingWindow. While fasting is gated, or no pattern is chosen, there is no window on
 * any day and the per-day changes are ignored (C07).
 *
 * The standing window comes from the preset as item 14's effectiveFastingPreset gives it (the only
 * way any screen reads the preset), so the Kickstart default rule lives there, not here.
 */
import type { PlanDayRecord } from '../storage/records';
import type { TimeZone } from '../storage/primitives';
import { addDays, type LocalDate, localDateOf, zonedWallTimeToInstant } from '../util/time';
import {
  type ClockTime,
  type EatingWindow,
  fastBetween,
  type FastingPresetId,
  parseClockTime,
  plannedFastMinutes,
  windowLength,
} from './eatingWindow';

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;

/** The documented 5 pm snack (UX_SCREENS.md section 2, card 2; HEALTH_SAFETY.md section 3). */
export const SNACK_TIME: ClockTime = '17:00';

/** An eating window shorter than 2 hours holds one meal: 23:1 and short custom windows. */
export const ONE_MEAL_MAX_EATING_MINUTES = 119;

/** "HH:MM" for whole minutes after midnight, wrapping past 24 hours. */
export function clockTimeFromMinutes(minutes: number): ClockTime {
  if (!Number.isInteger(minutes)) throw new RangeError(`Minutes must be whole, got ${minutes}`);
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const eating = (window: EatingWindow): number => windowLength(window).eatingMinutes;

/** True for a window under 2 hours of eating: one meal, no room for the 5 pm snack and dinner. */
export function isOneMealWindow(window: EatingWindow): boolean {
  return eating(window) <= ONE_MEAL_MAX_EATING_MINUTES;
}

/** Whether `time` falls inside the window, wrapping past midnight; start inclusive, end exclusive. */
export function windowContains(window: EatingWindow, time: ClockTime): boolean {
  const offset =
    (parseClockTime(time) - parseClockTime(window.start) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return offset < eating(window);
}

/** Whether `wider` strictly contains `narrower` and is longer, wrapping past midnight. */
export function windowWidens(wider: EatingWindow, narrower: EatingWindow): boolean {
  const offset =
    (parseClockTime(narrower.start) - parseClockTime(wider.start) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  return offset + eating(narrower) <= eating(wider) && eating(wider) > eating(narrower);
}

/**
 * The window with the 5 pm snack added: 17:00 to the window's own end. Null when the window
 * already holds 5 pm, starts at or before 5 pm on the clock, or ends at exactly 5 pm, so the result
 * always strictly widens the window it is given (it never moves a meal later or shortens a day).
 */
export function snackWindowFor(window: EatingWindow): EatingWindow | null {
  if (windowContains(window, SNACK_TIME)) return null;
  if (parseClockTime(window.start) <= parseClockTime(SNACK_TIME)) return null;
  if (window.end === SNACK_TIME) return null;
  return { start: SNACK_TIME, end: window.end };
}

/** The window moved by `deltaMinutes` (a whole number under a day either way); same length. */
export function shiftWindow(window: EatingWindow, deltaMinutes: number): EatingWindow {
  if (!Number.isInteger(deltaMinutes) || Math.abs(deltaMinutes) >= MINUTES_PER_DAY) {
    throw new RangeError(
      `The shift must be a whole number of minutes under a day, got ${deltaMinutes}`,
    );
  }
  windowLength(window);
  return {
    start: clockTimeFromMinutes(parseClockTime(window.start) + deltaMinutes),
    end: clockTimeFromMinutes(parseClockTime(window.end) + deltaMinutes),
  };
}

/** The windows a day plans: the standing window, a switch on a later date, and per-day changes. */
export interface Schedule {
  /** Null while fasting is gated or no pattern is chosen; every date then has no window. */
  readonly standing: EatingWindow | null;
  /** From this date on the standing window is another one (the days after a running Kickstart). */
  readonly switchTo: { readonly from: LocalDate; readonly window: EatingWindow } | null;
  /** Per-day changes (plan_days.eatingWindow), by date. */
  readonly overrides: Readonly<Record<LocalDate, EatingWindow>>;
}

/** The preset as item 14's effectiveFastingPreset gives it. */
export interface SchedulePreset {
  readonly fastingPreset: FastingPresetId | 'custom' | null;
  readonly eatingWindow: EatingWindow | null;
}

export interface ScheduleRecords {
  /** effectiveFastingPreset(targets, kickstartRunning) today. */
  readonly preset: SchedulePreset;
  readonly planDays: readonly Pick<PlanDayRecord, 'date' | 'eatingWindow'>[];
  readonly fastingGated: boolean;
  /**
   * While a Kickstart period runs: its scheduled last day, and the preset for the days after it,
   * effectiveFastingPreset(targets, false). Dates after the last day already plan that window.
   */
  readonly kickstart:
    | { readonly running: true; readonly lastDay: LocalDate; readonly presetAfter: SchedulePreset }
    | { readonly running: false };
}

const sameWindow = (a: EatingWindow, b: EatingWindow): boolean =>
  a.start === b.start && a.end === b.end;

const presetWindowOf = (preset: SchedulePreset): EatingWindow | null =>
  preset.fastingPreset === null || preset.eatingWindow === null
    ? null
    : { start: preset.eatingWindow.start, end: preset.eatingWindow.end };

/** The schedule from the stored records (C07, C55; item 13 section 9.1 rules 3 and 4). */
export function scheduleFrom(records: ScheduleRecords): Schedule {
  const overrides: Record<LocalDate, EatingWindow> = {};
  for (const day of records.planDays) {
    if (day.eatingWindow !== null) {
      overrides[day.date] = { start: day.eatingWindow.start, end: day.eatingWindow.end };
    }
  }
  const standing = records.fastingGated ? null : presetWindowOf(records.preset);
  let switchTo: Schedule['switchTo'] = null;
  if (standing !== null && records.kickstart.running) {
    const after = presetWindowOf(records.kickstart.presetAfter);
    if (after !== null && !sameWindow(after, standing)) {
      switchTo = { from: addDays(records.kickstart.lastDay, 1), window: after };
    }
  }
  return { standing, switchTo, overrides };
}

/** The standing window on a date, ignoring per-day changes. */
export function standingOn(date: LocalDate, schedule: Schedule): EatingWindow | null {
  const { switchTo } = schedule;
  return switchTo !== null && date >= switchTo.from ? switchTo.window : schedule.standing;
}

const overrideOn = (date: LocalDate, schedule: Schedule): EatingWindow | undefined =>
  Object.hasOwn(schedule.overrides, date) ? schedule.overrides[date] : undefined;

/** Whether a per-day change is stored for the date (whatever the standing window). */
export function hasOverride(date: LocalDate, schedule: Schedule): boolean {
  return overrideOn(date, schedule) !== undefined;
}

/** The window a date plans: its per-day change, else the standing window; none without a pattern. */
export function windowOn(date: LocalDate, schedule: Schedule): EatingWindow | null {
  if (schedule.standing === null) return null;
  return overrideOn(date, schedule) ?? standingOn(date, schedule);
}

/** True only when the date's change is exactly the standing window with the 5 pm snack added. */
export function isSnackAdded(date: LocalDate, schedule: Schedule): boolean {
  const override = overrideOn(date, schedule);
  const standing = schedule.standing === null ? null : standingOn(date, schedule);
  const snack = standing === null ? null : snackWindowFor(standing);
  return override !== undefined && snack !== null && sameWindow(override, snack);
}

/** One window on one date, as real instants. Its date is the date it starts. */
export interface WindowInstance {
  readonly date: LocalDate;
  readonly window: EatingWindow;
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * The instants of a window on a date in a zone: it ends on the same date, or on the next one when
 * it wraps past midnight. A window over the hour skipped when clocks go forward keeps at least a
 * minute.
 */
export function windowInstance(
  date: LocalDate,
  window: EatingWindow,
  timeZone: TimeZone,
): WindowInstance {
  const start = parseClockTime(window.start);
  const end = parseClockTime(window.end);
  const startMs = zonedWallTimeToInstant(date, start, timeZone);
  const endDate = end > start ? date : addDays(date, 1);
  const endMs = Math.max(zonedWallTimeToInstant(endDate, end, timeZone), startMs + MS_PER_MINUTE);
  return { date, window, startMs, endMs };
}

const dateAt = (ms: number, timeZone: TimeZone): LocalDate =>
  localDateOf(new Date(ms).toISOString(), timeZone);

function instancesOn(
  dates: readonly LocalDate[],
  timeZone: TimeZone,
  schedule: Schedule,
): WindowInstance[] {
  return dates.flatMap((date) => {
    const window = windowOn(date, schedule);
    return window === null ? [] : [windowInstance(date, window, timeZone)];
  });
}

/** The first window instance that starts after `afterMs`, on its local date or the next. */
export function nextWindowStart(
  afterMs: number,
  timeZone: TimeZone,
  schedule: Schedule,
): WindowInstance | null {
  const date = dateAt(afterMs, timeZone);
  return (
    instancesOn([date, addDays(date, 1)], timeZone, schedule).find((w) => w.startMs > afterMs) ??
    null
  );
}

/** The window instance open at `atMs` (today's preferred over yesterday's, which may wrap). */
export function openWindowAt(
  atMs: number,
  timeZone: TimeZone,
  schedule: Schedule,
): WindowInstance | null {
  const date = dateAt(atMs, timeZone);
  return (
    instancesOn([date, addDays(date, -1)], timeZone, schedule).find(
      (w) => w.startMs <= atMs && atMs < w.endMs,
    ) ?? null
  );
}

/** The latest window instance that ended at or before `atMs` (from the last three dates). */
export function lastWindowEndBefore(
  atMs: number,
  timeZone: TimeZone,
  schedule: Schedule,
): WindowInstance | null {
  const date = dateAt(atMs, timeZone);
  const ended = instancesOn([addDays(date, -2), addDays(date, -1), date], timeZone, schedule)
    .filter((w) => w.endMs <= atMs)
    .sort((a, b) => a.endMs - b.endMs);
  return ended.at(-1) ?? null;
}

/**
 * Real minutes of the planned fast from the end of `date`'s window to the start of the next
 * date's, across daylight saving; null when either date has no window, and 0 when the next window
 * would open before this one ends (callers treat 0 as "not allowed").
 */
export function fastAfterDay(
  date: LocalDate,
  schedule: Schedule,
  timeZone: TimeZone,
): number | null {
  const a = windowOn(date, schedule);
  const next = addDays(date, 1);
  const b = windowOn(next, schedule);
  if (a === null || b === null) return null;
  try {
    fastBetween(a, b);
    const wraps = parseClockTime(a.end) <= parseClockTime(a.start);
    return plannedFastMinutes({
      fromDate: wraps ? next : date,
      fromTime: a.end,
      toDate: next,
      toTime: b.start,
      timeZone,
    });
  } catch {
    return 0;
  }
}
