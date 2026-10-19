/**
 * When the neutral alcohol note applies (item 15; HEALTH_SAFETY.md section 3; FS-05; DOC_REVIEW
 * C11, C63): a drink logged during a fast, or outside the planned eating window. The note never
 * changes the fast, the streak or the meal check; none of them has a drinks input.
 */
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import { type Instant, instantMs, type TimeZone } from '../storage/primitives';
import { addDays, localDateOf } from '../util/time';
import { type Schedule, windowInstance, windowOn } from './windows';

type FastInterval = { readonly startedAt: Instant; readonly endedAt: Instant | null };

/** A drink at or between a fast's start and its end (or now, while it runs). */
export function drinkDuringFast(
  drinkAt: Instant,
  fasts: readonly FastInterval[],
  nowMs: number,
): boolean {
  const at = instantMs(drinkAt);
  return fasts.some(
    (f) =>
      instantMs(f.startedAt) <= at && at <= (f.endedAt === null ? nowMs : instantMs(f.endedAt)),
  );
}

/** A drink in no planned window of its local date or the date before (with a pattern chosen). */
export function drinkOutsideWindow(
  drinkAt: Instant,
  drinkZone: TimeZone,
  schedule: Schedule,
): boolean {
  if (schedule.standing === null) return false;
  const at = instantMs(drinkAt);
  const date = localDateOf(drinkAt, drinkZone);
  return ![addDays(date, -1), date].some((d) => {
    const window = windowOn(d, schedule);
    if (window === null) return false;
    const instance = windowInstance(d, window, drinkZone);
    return instance.startMs <= at && at < instance.endMs;
  });
}

/**
 * The neutral note shows for a drink during a fast or outside the planned window. The drink is read
 * in its own zone (falling back to the home zone when this phone does not know it).
 */
export function alcoholNoteApplies(
  drink: { readonly at: Instant; readonly timeZone: TimeZone },
  fasts: readonly FastInterval[],
  schedule: Schedule,
  nowMs: number,
): boolean {
  return (
    drinkDuringFast(drink.at, fasts, nowMs) ||
    drinkOutsideWindow(
      drink.at,
      resolveZone(drink.timeZone, DEFAULT_HOME_TIME_ZONE).timeZone,
      schedule,
    )
  );
}
