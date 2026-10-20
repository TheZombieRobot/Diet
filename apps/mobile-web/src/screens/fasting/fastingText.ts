/** Fasting wording put together from health.ts (item 15 design 3.3 to 3.8). */
import {
  clockTimeFromMinutes,
  type FastEndHint,
  fillTemplate,
  formatClockRange,
  formatClockTime,
  formatElapsed,
  joinList,
  type LocalDate,
  localDateOf,
  localWallClockOf,
  type SittingHeadline,
  type TimeZone,
  type WindowInstance,
} from '@diet/core';
import { fasting, readiness, schedule } from '@diet/core/copy/health';
import { formatDayPhrase, formatLocalDay, formatLocalTime } from '../../format';
import type { RunningFastView } from './view';

const MINUTE_MS = 60_000;

/** "Started 7:00 pm", or "Started yesterday at 7:00 pm" when the span began on an earlier date. */
export function startedText(running: RunningFastView, today: LocalDate): string {
  const first = running.span.fasts[0];
  const time = first === undefined ? '' : formatLocalTime(first.startedAt, running.startZone);
  return running.startedDate === today
    ? fillTemplate(fasting.card.startedAt, { time })
    : fillTemplate(fasting.card.startedOn, {
        day: formatDayPhrase(running.startedDate, today),
        time,
      });
}

/** The 12-hour clock time of an instant in a zone, read from the real instant: '5:30 pm'. */
export function clockAt(ms: number, zone: TimeZone): string {
  return formatClockTime(
    clockTimeFromMinutes(localWallClockOf(new Date(ms).toISOString(), zone).minutes),
  );
}

/** "Eat 6:00 pm – 7:00 pm", or "Eat tomorrow 6:00 pm – 7:00 pm" for a window on a later date. */
export function eatWindowText(window: WindowInstance, today: LocalDate): string {
  const { start, end } = window.window;
  return fillTemplate(
    window.date > today ? fasting.card.eatWindowTomorrow : fasting.card.eatWindow,
    {
      range: formatClockRange(start, end),
    },
  );
}

/**
 * When to eat, from the end hint: the planned window ("Eat 6:00 pm – 7:00 pm") or, for a capped
 * plan, the 24-hour point ("Eat by 5:30 pm"), each saying "tomorrow" when it falls on a later date
 * than `today` in the device zone. Nothing close to or past 24 hours, so no line ever names a
 * window time that would carry the fast past the ceiling.
 */
export function endHintText(hint: FastEndHint, zone: TimeZone, today: LocalDate): string | null {
  if (hint.kind === 'window') return eatWindowText(hint.window, today);
  if (hint.kind === 'eat-by') {
    const later = localDateOf(new Date(hint.atMs).toISOString(), zone) > today;
    return fillTemplate(later ? fasting.card.eatByTomorrow : fasting.card.eatBy, {
      time: clockAt(hint.atMs, zone),
    });
  }
  return null;
}

/**
 * The note on a span joined to the fast before it (the 24-hour rule counts them as one): the gap
 * between the two, which stays true however long this fast runs.
 */
export function joinedText(gapMs: number): string {
  return gapMs < MINUTE_MS
    ? fasting.card.joinedJustNow
    : fillTemplate(fasting.card.joined, { gap: formatElapsed(gapMs, 'text') });
}

/** The single sitting's protein headline (C64), rounded down; "at least" or "unknown" as known. */
export function headlineText(headline: SittingHeadline, day: 'today' | 'tomorrow'): string {
  const copy = fasting.mealCheck;
  const key = headline.dinnerOnly
    ? day === 'today'
      ? 'tonightDinner'
      : 'tomorrowDinner'
    : day === 'today'
      ? 'todayMeal'
      : 'tomorrowMeal';
  if (headline.unknown) return copy.headlineUnknown[key];
  return fillTemplate(headline.atLeast ? copy.headlineAtLeast[key] : copy.headline[key], {
    protein: headline.proteinG,
  });
}

/** Dates as day phrases in a list: "today and tomorrow". */
export function dayList(dates: readonly LocalDate[], today: LocalDate): string {
  return joinList(
    dates.map((date) => formatDayPhrase(date, today)),
    readiness.listComma,
    readiness.listAnd,
  );
}

/**
 * When the untouched 23:1 Kickstart default applies: from the day a Kickstart starts, or, while one
 * runs, until its due date (F39), never as if it had not started.
 */
export function kickstartWhenText(runsUntil: LocalDate | null): string {
  return runsUntil === null
    ? schedule.kickstartWhen
    : fillTemplate(schedule.kickstartRunsUntil, { date: formatLocalDay(runsUntil) });
}
