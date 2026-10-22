/**
 * The Trends series and milestones (UX 5b; C21, HS-19; item 28 design 3.7, A14, A15). Each point's
 * totals come from totals.ts over that day or week, so rounding happens once per period.
 *
 * Nothing in this module creates, suggests or changes a milestone (HEALTH_SAFETY section 5): a
 * milestone is a figure the owner, or their GP or another health professional, chose, and
 * milestoneInEffect only reads it. No guidance figure is ever part of a series (A13).
 */
import type { AlcoholMilestoneRecord, DrinkLogRecord } from '../storage/records';
import { roundTo } from '../util/round';
import { addDays, type LocalDate, weekStartOf } from '../util/time';
import {
  alcoholDaysOfPlaced,
  alcoholFreeDays,
  type DrinkingDayContext,
  type EnergyDisplay,
  energyDisplay,
  placeDrinks,
  totalsOfPlaced,
} from './totals';

/** The two "who chose this figure" values, so screens never write the stored word themselves. */
export const MILESTONE_BY_SELF = 'self' as const;
export const MILESTONE_BY_HEALTH_PROFESSIONAL = 'clinician' as const;
export const ALCOHOL_MILESTONE_ENTERED_BY = Object.freeze([
  MILESTONE_BY_SELF,
  MILESTONE_BY_HEALTH_PROFESSIONAL,
] as const);

export interface DailyPoint {
  readonly day: LocalDate;
  /** On or after the tracking start, or the day has entries. */
  readonly tracked: boolean;
  readonly isToday: boolean;
  readonly drinks: number;
  /** Shown, 2 dp, rounded once for the day. */
  readonly std: number;
  readonly energy: EnergyDisplay;
}

/** `days` points ending today, oldest first. */
export function dailySeries(
  rows: readonly DrinkLogRecord[],
  ctx: DrinkingDayContext,
  today: LocalDate,
  trackingStart: LocalDate | null,
  days = 28,
): readonly DailyPoint[] {
  const placed = placeDrinks(rows, ctx);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i + 1 - days);
    const totals = totalsOfPlaced(placed, day, day);
    return {
      day,
      tracked: (trackingStart !== null && day >= trackingStart) || totals.drinks > 0,
      isToday: day === today,
      drinks: totals.drinks,
      std: totals.std,
      energy: energyDisplay(totals),
    };
  });
}

export interface WeekPoint {
  readonly weekStart: LocalDate;
  readonly current: boolean;
  /** Some day of the week is on or after the tracking start, or the week has entries. */
  readonly tracked: boolean;
  readonly drinks: number;
  readonly exactStd: number;
  readonly std: number;
  readonly energy: EnergyDisplay;
  readonly alcoholFreeDays: number;
  readonly countedDays: number;
  /** The week is complete and began on or after the tracking start. */
  readonly fullyTracked: boolean;
  /** Mean of this and the 3 previous weeks' exactStd, rounded once to 2 dp; null unless all 4 are fully tracked (A14). */
  readonly rollingAverageStd: number | null;
  readonly milestone: AlcoholMilestoneRecord | null;
}

/** The milestone in effect for a week: the latest fromDate on or before its Sunday; ties go to the later createdAt (A15). */
export function milestoneInEffect(
  milestones: readonly AlcoholMilestoneRecord[],
  weekEnd: LocalDate,
): AlcoholMilestoneRecord | null {
  let chosen: AlcoholMilestoneRecord | null = null;
  for (const m of milestones) {
    if (m.fromDate > weekEnd) continue;
    if (
      chosen === null ||
      m.fromDate > chosen.fromDate ||
      (m.fromDate === chosen.fromDate && m.createdAt > chosen.createdAt)
    ) {
      chosen = m;
    }
  }
  return chosen;
}

/** The average needs this many complete, fully recorded weeks (A14). */
const ROLLING_WEEKS = 4;

/** `weeks` Monday-start weeks ending with the current one, oldest first (rows from 3 further weeks back). */
export function weeklySeries(
  rows: readonly DrinkLogRecord[],
  ctx: DrinkingDayContext,
  today: LocalDate,
  trackingStart: LocalDate | null,
  milestones: readonly AlcoholMilestoneRecord[],
  weeks = 8,
): readonly WeekPoint[] {
  const placed = placeDrinks(rows, ctx);
  const current = weekStartOf(today);
  const total = weeks + ROLLING_WEEKS - 1;
  const base = Array.from({ length: total }, (_, i) => {
    const weekStart = addDays(current, 7 * (i + 1 - total));
    const weekEnd = addDays(weekStart, 6);
    const totals = totalsOfPlaced(placed, weekStart, weekEnd);
    const alcohol = new Set(alcoholDaysOfPlaced(placed, weekStart, weekEnd).map((d) => d.day));
    const free = alcoholFreeDays(alcohol, weekStart, weekEnd, trackingStart, today);
    const isCurrent = weekStart === current;
    return {
      weekStart,
      current: isCurrent,
      tracked: (trackingStart !== null && weekEnd >= trackingStart) || totals.drinks > 0,
      drinks: totals.drinks,
      exactStd: totals.exactStd,
      std: totals.std,
      energy: energyDisplay(totals),
      alcoholFreeDays: free.count,
      countedDays: free.countedDays,
      fullyTracked: !isCurrent && trackingStart !== null && weekStart >= trackingStart,
      milestone: milestoneInEffect(milestones, weekEnd),
    };
  });
  return base.slice(ROLLING_WEEKS - 1).map((week, i) => {
    const window = base.slice(i, i + ROLLING_WEEKS);
    const rollingAverageStd = window.every((w) => w.fullyTracked)
      ? roundTo(window.reduce((sum, w) => sum + w.exactStd, 0) / ROLLING_WEEKS, 2)
      : null;
    return { ...week, rollingAverageStd };
  });
}
