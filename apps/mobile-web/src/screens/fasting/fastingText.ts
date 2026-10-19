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
  localWallClockOf,
  type SittingHeadline,
  type TimeZone,
} from '@diet/core';
import { fasting, readiness } from '@diet/core/copy/health';
import { formatDayPhrase, formatLocalTime } from '../../format';
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

/**
 * When to eat, from the end hint: the planned window ("Eat 6:00 pm – 7:00 pm") or, for a capped
 * plan, the 24-hour point ("Eat by 5:30 pm"). Nothing close to or past 24 hours, so no line ever
 * names a window time that would carry the fast past the ceiling.
 */
export function endHintText(hint: FastEndHint, zone: TimeZone): string | null {
  if (hint.kind === 'window') {
    const { start, end } = hint.window.window;
    return fillTemplate(fasting.card.eatWindow, { range: formatClockRange(start, end) });
  }
  if (hint.kind === 'eat-by')
    return fillTemplate(fasting.card.eatBy, { time: clockAt(hint.atMs, zone) });
  return null;
}

/** The note on a span joined to the fast before it (the 24-hour rule counts them as one). */
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
