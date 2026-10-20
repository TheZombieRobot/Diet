/**
 * Kickstart period arithmetic (storage spec section 4.5; C08, C45, C56, C59, WT-08; D27, D28).
 * Used by the invariants and by the kickstart repository. All local dates; each instant is read in
 * its record's own zone through resolveZone, so an unknown zone falls back instead of throwing.
 *
 * - Day 1 is the local date of startedAt; Kickstart day N on `today` is daysBetween(day1, today) + 1.
 * - extensions(P) = P's checks with outcome 'extended' (the single source of truth; no count is stored).
 * - scheduledLastDay(P) = day1 + 21 + 7 × extensions − 1 days. A natural end is derived from it and
 *   never written, so the WT-08 flip happens even with no launch on day 22.
 * - effectiveLastDay(P) = the earlier of the scheduled last day and the local date of an early
 *   endedAt (the later of its date in the end zone and in the start zone), never before day 1; the
 *   day of an early end counts as used. A running period counts its full scheduled length.
 * - extensionWindow(P, e) = the last KICKSTART_OFFER_DAYS local dates of the scheduled phase with e extensions.
 *
 * The restart rule (D27): Kickstart days over all periods total at most 42 and extensions at most 3.
 * A new period starts only if a full 21 days still fit; an extension only if it passes neither cap.
 *
 * A period ended before its first day came (endedBeforeDay1; item 14 review) never ran: its end is
 * 1 ms after its start. It still counts 1 day toward the 42-day cap and holds its day 1 against an
 * overlap, but the phase engine gives it no Kickstart day.
 */
import { addDays, daysBetween, type LocalDate, localDateOf } from '../util/time';
import { notBeforeAny } from './clock';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from './dates';
import {
  KICKSTART_DAYS,
  KICKSTART_EXTENSION_DAYS,
  KICKSTART_MAX_EXTENSIONS,
  KICKSTART_MAX_TOTAL_DAYS,
  KICKSTART_OFFER_DAYS,
} from './limits';
import { type Instant, instantMs, type TimeZone, type YesNo } from './primitives';
import type { KickstartCheckRecord, KickstartOutcome, KickstartPeriodRecord } from './records';

type PeriodTimes = Pick<
  KickstartPeriodRecord,
  'startedAt' | 'timeZone' | 'endedAt' | 'endedTimeZone'
>;
type CheckOutcome = Pick<KickstartCheckRecord, 'periodId' | 'outcome'>;

/** The local date of an instant in a record's zone, falling back to the home zone, then Auckland, then UTC. */
export function recordLocalDate(
  at: Instant,
  zone: TimeZone | null,
  homeTimeZone: TimeZone = DEFAULT_HOME_TIME_ZONE,
): LocalDate {
  return localDateOf(at, resolveZone(zone, homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone);
}

export function periodDay1(period: PeriodTimes, homeTimeZone?: TimeZone): LocalDate {
  return recordLocalDate(period.startedAt, period.timeZone, homeTimeZone);
}

/** Kickstart day N on `today` (day 1 is the start date). */
export function kickstartDayNumber(
  period: PeriodTimes,
  today: LocalDate,
  homeTimeZone?: TimeZone,
): number {
  return daysBetween(periodDay1(period, homeTimeZone), today) + 1;
}

/** The number of `extended` checks of a period. */
export function extensionsOf(periodId: string, checks: readonly CheckOutcome[]): number {
  return checks.filter((c) => c.periodId === periodId && c.outcome === 'extended').length;
}

export function scheduledLastDay(
  period: PeriodTimes,
  extensions: number,
  homeTimeZone?: TimeZone,
): LocalDate {
  return addDays(
    periodDay1(period, homeTimeZone),
    KICKSTART_DAYS + KICKSTART_EXTENSION_DAYS * extensions - 1,
  );
}

/**
 * The last Kickstart day of a period. An early end counts as used on the later of its local date
 * in the zone it ended in and its local date in the period's own start zone, so a period ended in
 * a zone behind its start zone (Kiritimati to Pago Pago) can never count fewer calendar days than
 * really passed in the start zone. The result lies between day 1 and the scheduled last day, so
 * effectiveDays is always at least 1 and at most the scheduled length, whatever the zones.
 */
export function effectiveLastDay(
  period: PeriodTimes,
  extensions: number,
  homeTimeZone?: TimeZone,
): LocalDate {
  const scheduled = scheduledLastDay(period, extensions, homeTimeZone);
  if (period.endedAt === null) return scheduled;
  const day1 = periodDay1(period, homeTimeZone);
  const inEndZone = recordLocalDate(period.endedAt, period.endedTimeZone, homeTimeZone);
  const inStartZone = recordLocalDate(period.endedAt, period.timeZone, homeTimeZone);
  const ended = inEndZone > inStartZone ? inEndZone : inStartZone;
  const capped = ended < scheduled ? ended : scheduled;
  return capped > day1 ? capped : day1;
}

export function effectiveDays(
  period: PeriodTimes,
  extensions: number,
  homeTimeZone?: TimeZone,
): number {
  return (
    daysBetween(
      periodDay1(period, homeTimeZone),
      effectiveLastDay(period, extensions, homeTimeZone),
    ) + 1
  );
}

/**
 * Where a period stands at instant `at` (storage spec section 4.5; D27; the health-rules review).
 * Item 14's phase engine reads the period through this one function.
 * - 'ended': it was ended early (endedAt is set), whatever `at` is.
 * - 'not-started': not ended, and day 1 has not yet arrived at `at` in the device zone or in the
 *   period's own start zone (a start dated ahead: the clock was ahead when it started, or a file
 *   carried it). No Kickstart figures and no rapid-loss exemption before the period really starts.
 * - 'past-last-day': not ended, and `at` is after the scheduled last day in the device zone or in
 *   the start zone (the natural end; never written).
 * - 'running': otherwise. Both zones must agree, so travelling cannot start a period early or
 *   stretch it past its scheduled last day in the zone it started in, and the counted days always
 *   cover the real time.
 */
export type KickstartPeriodState = 'not-started' | 'running' | 'past-last-day' | 'ended';

export function kickstartPeriodState(
  period: PeriodTimes,
  extensions: number,
  at: Instant,
  deviceZone: TimeZone,
  homeTimeZone?: TimeZone,
): KickstartPeriodState {
  if (period.endedAt !== null) return 'ended';
  const day1 = periodDay1(period, homeTimeZone);
  const last = scheduledLastDay(period, extensions, homeTimeZone);
  const here = recordLocalDate(at, deviceZone, homeTimeZone);
  const there = recordLocalDate(at, period.timeZone, homeTimeZone);
  if (here < day1 || there < day1) return 'not-started';
  if (here > last || there > last) return 'past-last-day';
  return 'running';
}

/** The end of a period that never ran: this long after its start. */
export const NEVER_RAN_END_MS = 1;

/** The instant `ms` after an instant. */
const after = (at: Instant, ms: number): Instant => new Date(instantMs(at) + ms).toISOString();

/**
 * The period was ended before its first day came (item 14 review): endPeriod wrote its end 1 ms
 * after its start. It never ran, so it has no Kickstart day, no rapid-loss exemption, no "Kickstart
 * has finished" and no rebound note; it still counts 1 day toward the cap (effectiveDays).
 */
export function endedBeforeDay1(period: PeriodTimes): boolean {
  return (
    period.endedAt !== null &&
    instantMs(period.endedAt) - instantMs(period.startedAt) <= NEVER_RAN_END_MS
  );
}

/**
 * Where endPeriod ends the latest period (D27; item 12's clock rules; item 14 review): at the latest
 * of now, the clock high-water mark and 1 ms after its start, so a clock set back never makes the
 * days already lived count as fewer. When its first day has not come by the phone's date now
 * (kickstartPeriodState 'not-started') and nothing saved lies on a later date than day 1, it never
 * ran: 1 ms after its start (endedBeforeDay1). Either way it counts 1 day toward the cap.
 */
export function kickstartEndAt(
  period: PeriodTimes,
  extensions: number,
  now: Instant,
  highWater: Instant | null,
  deviceZone: TimeZone,
  homeTimeZone?: TimeZone,
): Instant {
  const neverRan = after(period.startedAt, NEVER_RAN_END_MS);
  const lifted = notBeforeAny(now, highWater, neverRan);
  if (kickstartPeriodState(period, extensions, now, deviceZone, homeTimeZone) !== 'not-started') {
    return lifted;
  }
  const day1 = periodDay1(period, homeTimeZone);
  const livedPastDay1 =
    recordLocalDate(lifted, deviceZone, homeTimeZone) > day1 ||
    recordLocalDate(lifted, period.timeZone, homeTimeZone) > day1;
  return livedPastDay1 ? lifted : neverRan;
}

/** Whether a period is running at `at`: kickstartPeriodState(...) is 'running'. */
export function kickstartRunningAt(
  period: PeriodTimes,
  extensions: number,
  at: Instant,
  deviceZone: TimeZone,
  homeTimeZone?: TimeZone,
): boolean {
  return kickstartPeriodState(period, extensions, at, deviceZone, homeTimeZone) === 'running';
}

/** The local dates (inclusive) in which the extension check may be asked, with e extensions so far (C59; D28). */
export function extensionWindow(
  period: PeriodTimes,
  extensions: number,
  homeTimeZone?: TimeZone,
): { from: LocalDate; to: LocalDate } {
  const to = scheduledLastDay(period, extensions, homeTimeZone);
  return { from: addDays(to, -(KICKSTART_OFFER_DAYS - 1)), to };
}

/** Whether a local date lies in a window. */
export function inWindow(date: LocalDate, window: { from: LocalDate; to: LocalDate }): boolean {
  return date >= window.from && date <= window.to;
}

export interface KickstartUsage {
  /** effectiveDays over all periods. */
  readonly days: number;
  /** extended checks over all periods. */
  readonly extensions: number;
}

/** Kickstart days and extensions used over every period ever (D27). */
export function kickstartUsage(
  periods: readonly (PeriodTimes & { readonly id: string })[],
  checks: readonly CheckOutcome[],
  homeTimeZone?: TimeZone,
): KickstartUsage {
  const extended = new Map<string, number>();
  for (const c of checks) {
    if (c.outcome === 'extended') extended.set(c.periodId, (extended.get(c.periodId) ?? 0) + 1);
  }
  let days = 0;
  let extensions = 0;
  for (const p of periods) {
    const e = extended.get(p.id) ?? 0;
    extensions += e;
    days += effectiveDays(p, e, homeTimeZone);
  }
  return { days, extensions };
}

/** A new period starts only if a full 21 days still fit under the 42-day cap (D27). */
export function canStartKickstart(usage: KickstartUsage): boolean {
  return usage.days + KICKSTART_DAYS <= KICKSTART_MAX_TOTAL_DAYS;
}

/** An extension is allowed only if it passes neither the 3-extension nor the 42-day cap (D27). */
export function canExtendKickstart(usage: KickstartUsage): boolean {
  return (
    usage.extensions < KICKSTART_MAX_EXTENSIONS &&
    usage.days + KICKSTART_EXTENSION_DAYS <= KICKSTART_MAX_TOTAL_DAYS
  );
}

/** The four stop-sign answers of the extension check (HS section 2). */
export interface StopSignAnswers {
  readonly dizzyOnStanding: YesNo;
  readonly palpitations: YesNo;
  readonly crampsNotSettling: YesNo;
  readonly faintAtWork: YesNo;
}

/** 'extended' exactly when all four answers are no; otherwise 'stop-sign' (C59, WT-09). */
export function kickstartCheckOutcome(answers: StopSignAnswers): KickstartOutcome {
  const { dizzyOnStanding, palpitations, crampsNotSettling, faintAtWork } = answers;
  return [dizzyOnStanding, palpitations, crampsNotSettling, faintAtWork].every((a) => a === 'no')
    ? 'extended'
    : 'stop-sign';
}
