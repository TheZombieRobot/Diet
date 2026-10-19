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
 */
import { addDays, daysBetween, type LocalDate, localDateOf } from '../util/time';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from './dates';
import {
  KICKSTART_DAYS,
  KICKSTART_EXTENSION_DAYS,
  KICKSTART_MAX_EXTENSIONS,
  KICKSTART_MAX_TOTAL_DAYS,
  KICKSTART_OFFER_DAYS,
} from './limits';
import type { Instant, TimeZone, YesNo } from './primitives';
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
 * Whether a period that has not ended early is still in its scheduled phase at `at`: the date is
 * on or before the scheduled last day both in the device zone and in the period's own start zone.
 * Requiring both means travelling west cannot stretch a phase past its scheduled last day in the
 * zone it started in, so the counted days always cover the real time (D27).
 */
export function kickstartRunningAt(
  period: PeriodTimes,
  extensions: number,
  at: Instant,
  deviceZone: TimeZone,
  homeTimeZone?: TimeZone,
): boolean {
  if (period.endedAt !== null) return false;
  const last = scheduledLastDay(period, extensions, homeTimeZone);
  return (
    recordLocalDate(at, deviceZone, homeTimeZone) <= last &&
    recordLocalDate(at, period.timeZone, homeTimeZone) <= last
  );
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
