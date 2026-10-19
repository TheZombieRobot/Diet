/**
 * How an eating window reads on screen (C101; FL-08, FL-09, FL-14, NN-02, HS-17). The lengths
 * always come from windowLength, never re-derived here, so 17:00–19:00 reads 2 hours of eating and
 * 22 of fasting, not 4. No Intl: the text never depends on the device locale. Wording is from
 * copy/health.ts (schedule).
 */
import { fasting, schedule } from '../copy/health';
import { fillTemplate } from '../copy/template';
import { type ClockTime, type EatingWindow, parseClockTime, windowLength } from './eatingWindow';
import { isOneMealWindow, SNACK_TIME } from './windows';

const MINUTES_PER_DAY = 24 * 60;

/**
 * A 12-hour clock time: '00:00' → '12:00 am', '11:59' → '11:59 am', '12:00' → '12:00 pm',
 * '13:00' → '1:00 pm', '23:59' → '11:59 pm'.
 */
export function formatClockTime(time: ClockTime): string {
  const minutes = parseClockTime(time);
  const hours24 = Math.floor(minutes / 60);
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hours12}:${mm} ${hours24 < 12 ? 'am' : 'pm'}`;
}

/**
 * Whole minutes 1–1440 in words (24 hours is a valid planned fast). long: '1 hour',
 * '22 hours 30 minutes', '45 minutes', '24 hours'; short: '1 h', '1 h 30 m', '45 m', '24 h'.
 */
export function formatDuration(minutes: number, style: 'long' | 'short'): string {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MINUTES_PER_DAY) {
    throw new RangeError(`minutes must be a whole number from 1 to 1440, got ${minutes}`);
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (style === 'long') {
    if (hours > 0)
      parts.push(hours === 1 ? schedule.hourOne : fillTemplate(schedule.hours, { n: hours }));
    if (rest > 0)
      parts.push(rest === 1 ? schedule.minuteOne : fillTemplate(schedule.minutes, { n: rest }));
  } else {
    if (hours > 0) parts.push(fillTemplate(schedule.hoursShort, { n: hours }));
    if (rest > 0) parts.push(fillTemplate(schedule.minutesShort, { n: rest }));
  }
  return parts.join(' ');
}

export interface EatingWindowDescription {
  /** formatClockTime of each end. */
  readonly start: string;
  readonly end: string;
  readonly eatingMinutes: number;
  readonly fastingMinutes: number;
  /** From windowLength: "22:2" when both parts are whole hours, otherwise null. */
  readonly ratio: string | null;
  /** Screen 1e: 'Eating 5:00 pm to 7:00 pm = 2 hours. Fasting 22 hours.' */
  readonly summary: string;
  /** The Fast card (item 15): '2 h eating, 22 h fasting'. */
  readonly short: string;
}

/** The words for a window. Throws (through windowLength) for a window the app would not plan. */
export function describeEatingWindow(window: EatingWindow): EatingWindowDescription {
  const { eatingMinutes, fastingMinutes, ratio } = windowLength(window);
  const start = formatClockTime(window.start);
  const end = formatClockTime(window.end);
  return {
    start,
    end,
    eatingMinutes,
    fastingMinutes,
    ratio,
    summary: fillTemplate(schedule.windowSummary, {
      start,
      end,
      eating: formatDuration(eatingMinutes, 'long'),
      fasting: formatDuration(fastingMinutes, 'long'),
    }),
    short: fillTemplate(schedule.windowShort, {
      eating: formatDuration(eatingMinutes, 'short'),
      fasting: formatDuration(fastingMinutes, 'short'),
    }),
  };
}

/**
 * The eating part of a 24-hour bar, in percent of the day: one segment, or two when the window
 * wraps past midnight (22:00–02:00 → [{91.67, 8.33}, {0, 8.33}]).
 */
export function dayBarSegments(
  window: EatingWindow,
): readonly { readonly startPct: number; readonly widthPct: number }[] {
  const { eatingMinutes } = windowLength(window);
  const start = parseClockTime(window.start);
  const pct = (minutes: number) => (minutes / MINUTES_PER_DAY) * 100;
  if (start + eatingMinutes <= MINUTES_PER_DAY) {
    return [{ startPct: pct(start), widthPct: pct(eatingMinutes) }];
  }
  return [
    { startPct: pct(start), widthPct: pct(MINUTES_PER_DAY - start) },
    { startPct: 0, widthPct: pct(start + eatingMinutes - MINUTES_PER_DAY) },
  ];
}

// ---- Item 15: ranges, elapsed time and the pattern pill (item 15 design 4.1) ----

/** Both ends in full with an en dash: '6:00 pm – 7:00 pm', '10:00 pm – 2:00 am'. */
export function formatClockRange(start: ClockTime, end: ClockTime): string {
  return `${formatClockTime(start)} – ${formatClockTime(end)}`;
}

/**
 * Elapsed time in whole minutes, rounded down, of any length (a fast can run past 24 hours and the
 * timer stays honest). figure: both parts always, '0 h 45 m', '25 h 3 m' (the Fast card); text: a
 * zero part dropped, '45 m', '2 h', '19 h 20 m', and '0 m' for nothing yet.
 */
export function formatElapsed(ms: number, style: 'figure' | 'text'): string {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(`elapsed time must be a finite number from 0, got ${ms}`);
  }
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = fillTemplate(schedule.hoursShort, { n: hours });
  const m = fillTemplate(schedule.minutesShort, { n: rest });
  if (style === 'figure') return `${h} ${m}`;
  if (hours === 0) return m;
  return rest === 0 ? h : `${h} ${m}`;
}

/**
 * The pill on the Fast and Eating pattern cards, from the window's clock times and never from the
 * preset id (C55): '23:1 · One meal' for any one-meal window, '22:2 · 5 pm snack + dinner' for a
 * window from 5 pm with room for the snack, otherwise the ratio alone ('22:2' at 18:00–20:00,
 * '16:8'), and 'Custom times' when the lengths are not whole hours.
 */
export function patternPill(window: EatingWindow): string {
  const { ratio } = windowLength(window);
  if (ratio === null) return schedule.custom;
  if (isOneMealWindow(window)) {
    return fillTemplate(fasting.card.pill, { ratio, name: schedule.presetNames['23:1'] });
  }
  if (window.start === SNACK_TIME) {
    return fillTemplate(fasting.card.pill, { ratio, name: schedule.presetNames['22:2'] });
  }
  return ratio;
}
