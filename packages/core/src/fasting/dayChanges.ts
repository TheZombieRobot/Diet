/**
 * Per-day eating-window changes: the 5 pm snack, "Eat 1 hour earlier" for reflux, an Undo of
 * either, and the clean-up when the pattern changes (item 15; DOC_REVIEW C30, C47, C104; HS-18).
 *
 * A change is allowed only when every planned fast next to a changed date stays above 0 minutes,
 * within the 24-hour ceiling, and either at most 23 hours or no longer than the same fast under
 * the standing pattern alone. So a change may shorten a fast freely, never pushes one past 23
 * hours unless the pattern itself is that long (23:1 on the April daylight-saving night is 24
 * hours by design, and the plan is capped at the start of the fast), and never past 24 hours.
 */
import type { TimeZone } from '../storage/primitives';
import { addDays, type LocalDate } from '../util/time';
import { type EatingWindow, parseClockTime, withinFastCeiling } from './eatingWindow';
import {
  clockTimeFromMinutes,
  fastAfterDay,
  hasOverride,
  type Schedule,
  shiftWindow,
  snackWindowFor,
  standingOn,
  windowContains,
  windowInstance,
  windowOn,
  windowWidens,
  SNACK_TIME,
} from './windows';

/** The longest planned fast a per-day change may leave next to it, in minutes (23 hours). */
export const DAY_CHANGE_MAX_FAST_MINUTES = 1380;

/** A per-day window for a date; null clears the date's change. */
export interface DayWindowChange {
  readonly date: LocalDate;
  readonly window: EatingWindow | null;
}

/** The schedule with the changes applied. */
export function applyDayChanges(schedule: Schedule, changes: readonly DayWindowChange[]): Schedule {
  const byDate = new Map<LocalDate, EatingWindow | null>(Object.entries(schedule.overrides));
  for (const { date, window } of changes) byDate.set(date, window);
  const overrides: Record<LocalDate, EatingWindow> = {};
  for (const [date, window] of byDate) if (window !== null) overrides[date] = window;
  return { ...schedule, overrides };
}

/** Whether the changes keep every neighbouring planned fast within the per-day limit. */
export function dayWindowChangeAllowed(
  schedule: Schedule,
  changes: readonly DayWindowChange[],
  timeZone: TimeZone,
): boolean {
  if (changes.length === 0) return true;
  const after = applyDayChanges(schedule, changes);
  const standingOnly: Schedule = { ...schedule, overrides: {} };
  const dates = changes.map((c) => c.date).sort();
  const last = dates.at(-1) ?? '';
  for (let date = addDays(dates[0] ?? last, -1); date <= last; date = addDays(date, 1)) {
    const changed = fastAfterDay(date, after, timeZone);
    if (changed === null) continue;
    const standing = fastAfterDay(date, standingOnly, timeZone);
    const ok =
      changed > 0 &&
      withinFastCeiling(changed) &&
      (changed <= DAY_CHANGE_MAX_FAST_MINUTES || (standing !== null && changed <= standing));
    if (!ok) return false;
  }
  return true;
}

/** The writes an option makes, all together. */
export interface DayChangeOption {
  readonly changes: readonly DayWindowChange[];
}

/**
 * "Eat 1 hour earlier" on a date (reflux; C47, C104): the date's window an hour earlier. When that
 * would leave the following fast over 23 hours, the next date's window opens earlier by the excess
 * with the same end (a wider window, never a narrower one), and both are written together. Null
 * when the date already has a change, the window starts before 01:00, the moved window has already
 * started, or no allowed pair exists.
 */
export function earlierOption(
  date: LocalDate,
  schedule: Schedule,
  timeZone: TimeZone,
  nowMs: number,
): DayChangeOption | null {
  const window = windowOn(date, schedule);
  if (window === null || hasOverride(date, schedule) || parseClockTime(window.start) < 60) {
    return null;
  }
  const earlier = shiftWindow(window, -60);
  if (windowInstance(date, earlier, timeZone).startMs <= nowMs) return null;
  const single: DayWindowChange[] = [{ date, window: earlier }];
  if (dayWindowChangeAllowed(schedule, single, timeZone)) return { changes: single };

  const next = addDays(date, 1);
  const nextWindow = windowOn(next, schedule);
  if (nextWindow === null || hasOverride(next, schedule)) return null;
  const following = fastAfterDay(date, applyDayChanges(schedule, single), timeZone);
  const excess = (following ?? 0) - DAY_CHANGE_MAX_FAST_MINUTES;
  if (excess <= 0 || excess >= 24 * 60) return null;
  const widened: EatingWindow = {
    start: clockTimeFromMinutes(parseClockTime(nextWindow.start) - excess),
    end: nextWindow.end,
  };
  if (!windowWidens(widened, nextWindow)) return null;
  const pair: DayWindowChange[] = [...single, { date: next, window: widened }];
  return dayWindowChangeAllowed(schedule, pair, timeZone) ? { changes: pair } : null;
}

/**
 * "Split the meal" on a date (reflux; C47): the 5 pm snack, then a smaller dinner. 'already' when
 * the date's window holds 5 pm; null when the date already has a change, the snack does not fit
 * (see snackWindowFor), 5 pm has passed, or the per-day limit refuses it.
 */
export function splitOption(
  date: LocalDate,
  schedule: Schedule,
  timeZone: TimeZone,
  nowMs: number,
): DayChangeOption | 'already' | null {
  const window = windowOn(date, schedule);
  if (window === null || hasOverride(date, schedule)) return null;
  if (windowContains(window, SNACK_TIME)) return 'already';
  const snack = snackWindowFor(window);
  if (snack === null || windowInstance(date, snack, timeZone).startMs <= nowMs) return null;
  const changes: DayWindowChange[] = [{ date, window: snack }];
  return dayWindowChangeAllowed(schedule, changes, timeZone) ? { changes } : null;
}

/**
 * The dates from today on whose per-day change no longer fits the schedule's standing pattern: a
 * change that does not strictly widen the standing window, or that would leave a neighbouring fast
 * outside the per-day limit. Repeated without the dates found until nothing new appears, so the
 * changes that remain all fit together. Saving a pattern clears them (C30).
 */
export function staleOverrides(
  schedule: Schedule,
  today: LocalDate,
  timeZone: TimeZone,
): LocalDate[] {
  const stale = new Set<LocalDate>();
  for (;;) {
    const remaining = applyDayChanges(
      schedule,
      [...stale].map((date) => ({ date, window: null })),
    );
    const found = Object.keys(remaining.overrides)
      .filter((date) => date >= today)
      .sort()
      .filter((date) => {
        const override = remaining.overrides[date];
        const standing = remaining.standing === null ? null : standingOn(date, remaining);
        if (override === undefined || standing === null || !windowWidens(override, standing)) {
          return true;
        }
        const without = applyDayChanges(remaining, [{ date, window: null }]);
        return !dayWindowChangeAllowed(without, [{ date, window: override }], timeZone);
      });
    if (found.length === 0) return [...stale].sort();
    for (const date of found) stale.add(date);
  }
}
