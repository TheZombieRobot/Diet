/**
 * The planner's display week and planning range (item 22 design 3.1; STORAGE_DESIGN 3.2; V2, V3,
 * V41). A display week runs Monday to Sunday. Dates from today to the Sunday of next week can be
 * planned; earlier dates are past and read-only, later ones are too far ahead, because a later
 * date's targets would rest on today's weight and gates.
 */
import type { Instant, TimeZone } from '../storage/primitives';
import {
  addDays,
  isoWeekdayOf,
  type LocalDate,
  weekStartOf,
  zonedWallTimeToInstant,
} from '../util/time';

export const PLAN_WEEK_DAYS = 7;

/** The seven dates of a display week; RangeError when weekStart is not a Monday. */
export function planWeekDates(weekStart: LocalDate): LocalDate[] {
  if (isoWeekdayOf(weekStart) !== 1) throw new RangeError(`${weekStart} is not a Monday`);
  return Array.from({ length: PLAN_WEEK_DAYS }, (_, i) => addDays(weekStart, i));
}

/** The last date that can be planned: the Sunday of next week. */
export function lastPlanDate(today: LocalDate): LocalDate {
  return addDays(weekStartOf(today), 2 * PLAN_WEEK_DAYS - 1);
}

export type PlanDateState = 'past' | 'editable' | 'too-far';

export function planDateState(date: LocalDate, today: LocalDate): PlanDateState {
  if (date < today) return 'past';
  return date <= lastPlanDate(today) ? 'editable' : 'too-far';
}

export function isEditablePlanDate(date: LocalDate, today: LocalDate): boolean {
  return planDateState(date, today) === 'editable';
}

export interface PlanWeekNav {
  readonly current: LocalDate;
  readonly previous: LocalDate;
  /** Offered only on the current week: next week is the furthest forward (V2). */
  readonly next: LocalDate | null;
  readonly isCurrent: boolean;
}

export function planWeekNav(shownWeekStart: LocalDate, today: LocalDate): PlanWeekNav {
  const current = weekStartOf(today);
  const isCurrent = shownWeekStart === current;
  return {
    current,
    previous: addDays(shownWeekStart, -PLAN_WEEK_DAYS),
    next: isCurrent ? addDays(current, PLAN_WEEK_DAYS) : null,
    isCurrent,
  };
}

/** The first planned week (item 20 section 7 step 5): no stored day before it holds a meal. */
export function isFirstPlannedWeek(hasMealsBefore: boolean): boolean {
  return !hasMealsBefore;
}

/** 12:00 on the date in the zone: the instant used to ask whether a Kickstart runs that day. */
export function noonOf(date: LocalDate, timeZone: TimeZone): Instant {
  return new Date(zonedWallTimeToInstant(date, 12 * 60, timeZone)).toISOString();
}
