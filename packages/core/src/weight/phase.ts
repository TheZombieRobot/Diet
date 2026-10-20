/**
 * The phase engine (HEALTH_SAFETY section 2; WT-08, WT-09, WT-11, WT-12; C08, C45, C56, C59; D27,
 * D28; item 14 design section 3.3). The phase is read from the stored Kickstart periods and checks
 * at a given moment, never stored:
 *
 * - Where the latest period stands comes only from item 12's kickstartPeriodState (in the device
 *   zone and its own start zone): not started yet, running, past its last day, or ended.
 * - Kickstart runs for the latest period only while it is 'running', the diet mode is keto and has
 *   stayed keto since the period began (ketoUnbrokenSince), and every Kickstart gate is open.
 *   Otherwise the phase is Steady, or 'none' while readiness closes the deficit. A natural end is
 *   never written: on day 22 the phase reads Steady even if the app was not opened that day. A
 *   period whose start is dated ahead (the clock was ahead) has not started: Steady until day 1.
 * - A period that can still be ended (running, or not started yet) whose conditions fail reports
 *   the end to write (kickstartEndNeeded): the one rule for every end on a gate or mode change.
 *   Once due, an end stays latched by the app until written, so reopened gates never resume it.
 * - Nothing here starts a Kickstart: a start is the owner's, after the four stop-sign questions.
 * - The first 21 Kickstart days ever, counted across every period, are the only days free of the
 *   rapid-loss card (D27).
 * - A period ended before its first day came (endedBeforeDay1 in storage/kickstart.ts: the clock was
 *   ahead when it started) never ran: no Kickstart day, no exemption, no rebound note and no
 *   "Kickstart has finished". Only the cap still counts its 1 day, and a new start waits until
 *   after its day 1.
 */
import { extensionOfferTrigger } from '../storage/cards';
import {
  canExtendKickstart,
  canStartKickstart,
  effectiveLastDay,
  endedBeforeDay1,
  extensionsOf,
  extensionWindow,
  inWindow,
  kickstartDayNumber,
  kickstartPeriodState,
  type KickstartPeriodState,
  kickstartRunningAt,
  kickstartUsage,
  periodDay1,
  scheduledLastDay,
} from '../storage/kickstart';
import { KICKSTART_DAYS } from '../storage/limits';
import type { Id, Instant, TimeZone } from '../storage/primitives';
import type { ReadinessGates } from '../storage/readiness';
import type {
  DietMode,
  KickstartCheckRecord,
  KickstartEndReason,
  KickstartPeriodRecord,
} from '../storage/records';
import { ketoUnbrokenSince } from '../targets/ketoRun';
import { addDays, type LocalDate, parseInstant } from '../util/time';

export type PhaseGates = Pick<
  ReadinessGates,
  'deficitAllowed' | 'kickstartAvailable' | 'ketoCeilingAvailable' | 'carbCeilingBelow50Allowed'
>;

/** Every gate a Kickstart needs is open (DECISIONS C06/C07/C41 row; C56). */
function kickstartGatesOpen(gates: PhaseGates): boolean {
  return (
    gates.deficitAllowed &&
    gates.kickstartAvailable &&
    gates.ketoCeilingAvailable &&
    gates.carbCeilingBelow50Allowed
  );
}

/** Kickstart may run (DECISIONS C56 row; C06; item 21 T7): keto mode and every Kickstart gate open. */
export function kickstartConditionsHold(dietMode: DietMode, gates: PhaseGates): boolean {
  return dietMode === 'keto' && kickstartGatesOpen(gates);
}

export type Phase =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'kickstart';
      readonly periodId: Id;
      readonly day: number;
      readonly week: number;
      readonly weeks: number;
      readonly extensionsInPeriod: number;
      readonly scheduledLastDay: LocalDate;
      /** exempt: one of the first 21 Kickstart days ever; extension: day 22 on; later: neither. */
      readonly dayKind: 'exempt' | 'extension' | 'later';
    }
  | { readonly kind: 'steady'; readonly lastKickstartEnd: LocalDate | null };

export interface PhaseInput {
  readonly now: Instant;
  /** The local date of `now` in the device zone. */
  readonly today: LocalDate;
  readonly deviceTimeZone: TimeZone;
  readonly homeTimeZone: TimeZone;
  readonly dietMode: DietMode;
  /** profile.carbCeilingStartedAt, for the unbroken keto run (ketoUnbrokenSince). */
  readonly carbCeilingStartedAt: Instant | null;
  readonly gates: PhaseGates;
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  /** Ends that were due but are not yet written (the app's end latch). Default empty. */
  readonly endsPending?: ReadonlyMap<Id, KickstartEndReason>;
}

const startOrder = (a: KickstartPeriodRecord, b: KickstartPeriodRecord): number =>
  parseInstant(a.startedAt) - parseInstant(b.startedAt) || (a.id < b.id ? -1 : 1);

/** The periods in start order (they never overlap: storage invariant kickstart-overlap). */
export function periodsInOrder(periods: readonly KickstartPeriodRecord[]): KickstartPeriodRecord[] {
  return [...periods].sort(startOrder);
}

/** The periods in start order, without those ended before their first day (they never ran). */
export function periodsThatRan(periods: readonly KickstartPeriodRecord[]): KickstartPeriodRecord[] {
  return periodsInOrder(periods).filter((p) => !endedBeforeDay1(p));
}

/** The latest period by start, or null when none was ever started. */
export function latestKickstartPeriod(
  periods: readonly KickstartPeriodRecord[],
): KickstartPeriodRecord | null {
  return periodsInOrder(periods).at(-1) ?? null;
}

/**
 * The latest period if it is running by time at `at` (not ended early, and its scheduled phase not
 * over in the device zone nor in its own start zone), whatever the diet mode and gates. The one
 * "running now" rule: the Kickstart repository and item 21's targets use it too.
 */
export function runningKickstartPeriod(
  periods: readonly KickstartPeriodRecord[],
  checks: readonly Pick<KickstartCheckRecord, 'periodId' | 'outcome'>[],
  at: Instant,
  deviceTimeZone: TimeZone,
  homeTimeZone: TimeZone,
): KickstartPeriodRecord | null {
  const latest = latestKickstartPeriod(periods);
  if (latest === null) return null;
  const extensions = extensionsOf(latest.id, checks);
  return kickstartRunningAt(latest, extensions, at, deviceTimeZone, homeTimeZone) ? latest : null;
}

/**
 * The latest period, where it stands now (item 12's kickstartPeriodState, never re-derived here),
 * and whether Kickstart may run for it now.
 */
function latestState(input: PhaseInput): {
  readonly period: KickstartPeriodRecord;
  readonly extensions: number;
  readonly state: KickstartPeriodState;
  readonly holds: boolean;
} | null {
  const period = latestKickstartPeriod(input.periods);
  if (period === null) return null;
  const extensions = extensionsOf(period.id, input.checks);
  const state = kickstartPeriodState(
    period,
    extensions,
    input.now,
    input.deviceTimeZone,
    input.homeTimeZone,
  );
  const holds =
    kickstartConditionsHold(input.dietMode, input.gates) &&
    ketoUnbrokenSince(input.carbCeilingStartedAt, period.startedAt) &&
    input.endsPending?.has(period.id) !== true;
  return { period, extensions, state, holds };
}

/** endPeriod can still end the period: it runs, or its first day has not arrived (item 12). */
const endable = (state: KickstartPeriodState): boolean =>
  state === 'running' || state === 'not-started';

/**
 * Every Kickstart date up to `today`, in period order: day 1 to the effective last day, and for a
 * period still running by time up to today (a pending end counts as ending today). A period ended
 * before its first day has none.
 */
export function kickstartDates(
  periods: readonly KickstartPeriodRecord[],
  checks: readonly KickstartCheckRecord[],
  today: LocalDate,
  homeTimeZone: TimeZone,
): LocalDate[] {
  const dates: LocalDate[] = [];
  for (const period of periodsThatRan(periods)) {
    const last = effectiveLastDay(period, extensionsOf(period.id, checks), homeTimeZone);
    const end = last < today ? last : today;
    for (let d = periodDay1(period, homeTimeZone); d <= end; d = addDays(d, 1)) dates.push(d);
  }
  return dates;
}

/** The first 21 Kickstart dates ever: the only dates free of the rapid-loss card (D27). */
export function rapidLossExemptDates(
  periods: readonly KickstartPeriodRecord[],
  checks: readonly KickstartCheckRecord[],
  today: LocalDate,
  homeTimeZone: TimeZone,
): ReadonlySet<LocalDate> {
  return new Set(kickstartDates(periods, checks, today, homeTimeZone).slice(0, KICKSTART_DAYS));
}

/**
 * The phase now. 'none' while readiness closes the deficit; Kickstart for the latest period while
 * it runs and its conditions hold (and no end is latched); otherwise Steady, with the last date
 * the latest period counted (today for one running by time whose conditions fail), or that of the
 * Kickstart before it when it has not run.
 */
export function phaseOn(input: PhaseInput): Phase {
  if (!input.gates.deficitAllowed) return { kind: 'none' };
  const latest = latestState(input);
  if (latest === null) return { kind: 'steady', lastKickstartEnd: null };
  const { period, extensions, state, holds } = latest;
  if (state === 'not-started' || endedBeforeDay1(period)) {
    // Its first day has not come, or it was ended before it came: Steady, after any earlier
    // Kickstart that ran.
    const previous = periodsThatRan(input.periods)
      .filter((p) => p.id !== period.id)
      .at(-1);
    return {
      kind: 'steady',
      lastKickstartEnd:
        previous === undefined
          ? null
          : effectiveLastDay(previous, extensionsOf(previous.id, input.checks), input.homeTimeZone),
    };
  }
  if (state !== 'running' || !holds) {
    return {
      kind: 'steady',
      lastKickstartEnd:
        state === 'running'
          ? input.today
          : effectiveLastDay(period, extensions, input.homeTimeZone),
    };
  }
  const day = kickstartDayNumber(period, input.today, input.homeTimeZone);
  const exempt = rapidLossExemptDates(
    input.periods,
    input.checks,
    input.today,
    input.homeTimeZone,
  ).has(input.today);
  return {
    kind: 'kickstart',
    periodId: period.id,
    day,
    week: Math.ceil(day / 7),
    weeks: 3 + extensions,
    extensionsInPeriod: extensions,
    scheduledLastDay: scheduledLastDay(period, extensions, input.homeTimeZone),
    dayKind: exempt ? 'exempt' : day > KICKSTART_DAYS ? 'extension' : 'later',
  };
}

/** For items 15, 16 and 22: phaseOn(input).kind === 'kickstart'. */
export function isKickstartDay(input: PhaseInput): boolean {
  return phaseOn(input).kind === 'kickstart';
}

/**
 * The end to write now: a period that can still be ended (running, or not started yet because its
 * start is dated ahead) whose conditions no longer hold. Gates are checked first
 * ('readiness-gated'), then the diet mode and the unbroken keto run ('left-keto'). A latched period
 * keeps its latched reason whatever the conditions are now. Null otherwise; this never asks for a
 * start. The one rule for ending on a readiness, weight or mode change: item 13's readiness and
 * profile saves, the weigh-in actions and the app's reconciler all write what this says.
 */
export function kickstartEndNeeded(input: PhaseInput): KickstartEndReason | null {
  const latest = latestState(input);
  if (latest === null || !endable(latest.state)) return null;
  const latched = input.endsPending?.get(latest.period.id);
  if (latched !== undefined) return latched;
  if (!kickstartGatesOpen(input.gates)) return 'readiness-gated';
  if (
    input.dietMode !== 'keto' ||
    !ketoUnbrokenSince(input.carbCeilingStartedAt, latest.period.startedAt)
  ) {
    return 'left-keto';
  }
  return null;
}

/**
 * The latest period has not begun: its first day has not arrived in the device zone or in its own
 * start zone (item 12's 'not-started'; the clock was ahead when it started). Null otherwise, and
 * while its end is latched. The Phase card says so honestly and offers End Kickstart.
 */
export function kickstartNotStarted(
  input: PhaseInput,
): { readonly periodId: Id; readonly day1: LocalDate } | null {
  const latest = latestState(input);
  if (latest?.state !== 'not-started') return null;
  if (input.endsPending?.has(latest.period.id) === true) return null;
  return { periodId: latest.period.id, day1: periodDay1(latest.period, input.homeTimeZone) };
}

/**
 * The last day a Kickstart stop-sign answer's pause holds (HEALTH_SAFETY sections 2 to 4; T27):
 * the latest period that ran has a stop-sign check and today is on or before its scheduled last
 * day, whether it still runs or was ended early, so ending it early never brings the deficit back
 * sooner. While it holds no deficit is planned, no fast is timed to the eating window ("the app
 * never insists on a fast") and no note says a fast drop is expected. Null otherwise.
 */
export function stopSignPauseUntil(
  periods: readonly KickstartPeriodRecord[],
  checks: readonly Pick<KickstartCheckRecord, 'periodId' | 'outcome'>[],
  today: LocalDate,
  homeTimeZone: TimeZone,
): LocalDate | null {
  const period = periodsThatRan(periods).at(-1);
  if (period === undefined) return null;
  if (!checks.some((c) => c.periodId === period.id && c.outcome === 'stop-sign')) return null;
  const last = scheduledLastDay(period, extensionsOf(period.id, checks), homeTimeZone);
  return today <= last ? last : null;
}

/**
 * The end of a Kickstart would be due only because of `after`, the gates a readiness answer or a
 * profile save would give (F23, F32): nothing is due to end now, and with those gates the one end
 * rule (kickstartEndNeeded) ends the period. The app asks before it saves such a change.
 */
export function kickstartEndsWithGates(input: PhaseInput, after: PhaseGates): boolean {
  return (
    kickstartEndNeeded(input) === null && kickstartEndNeeded({ ...input, gates: after }) !== null
  );
}

/** A new Kickstart waits this long (elapsed) after any stored stop-sign check (W31). */
export const KICKSTART_START_AFTER_STOP_SIGN_HOURS = 336;

/** A stored stop-sign check in the last 336 hours (elapsed), in any period. */
export function recentStopSignCheck(
  checks: readonly Pick<KickstartCheckRecord, 'outcome' | 'askedAt'>[],
  now: Instant,
): boolean {
  const nowMs = parseInstant(now);
  const waitMs = KICKSTART_START_AFTER_STOP_SIGN_HOURS * 3_600_000;
  return checks.some((c) => c.outcome === 'stop-sign' && nowMs - parseInstant(c.askedAt) < waitMs);
}

export type StartUnavailable =
  | 'low-weight'
  | 'gated'
  | 'not-keto'
  | 'running'
  | 'not-started'
  | 'cap'
  | 'recent-stop-sign'
  | 'ended-ahead'
  | 'ended-today'
  | 'stop-sign-today';

export interface StartRefusal {
  readonly available: false;
  readonly reason: StartUnavailable;
  /** 'ended-ahead': the first day of the period that was ended before it came. */
  readonly day1?: LocalDate;
}

export type StartAvailability = { readonly available: true } | StartRefusal;

export interface StartContext {
  /** belowBmiFloorNow. */
  readonly lowWeight: boolean;
  /** A pre-start "yes" today (held for the local day by the app). */
  readonly preStartStopSignToday: boolean;
}

/**
 * Whether a new Kickstart may start now, or the reason it may not, the longest wait first (the
 * line shown must stay true until the start is offered): weight below BMI 18.5; a Kickstart gate
 * closed; not keto; the latest period still running, or not started yet; a full 21 days no longer
 * fit (D27; never); a stored stop-sign in the last 336 hours; the latest period was ended before
 * its first day, which is still to come or today (a new day 1 must come after it: invariant
 * kickstart-overlap); it ended today (the same rule); a pre-start "yes" today.
 */
export function kickstartStartAvailability(
  input: PhaseInput,
  ctx: StartContext,
): StartAvailability {
  const no = (reason: StartUnavailable): StartAvailability => ({ available: false, reason });
  if (ctx.lowWeight) return no('low-weight');
  if (!kickstartGatesOpen(input.gates)) return no('gated');
  if (input.dietMode !== 'keto') return no('not-keto');
  const latest = latestState(input);
  if (latest?.state === 'running') return no('running');
  if (latest?.state === 'not-started') return no('not-started');
  if (!canStartKickstart(kickstartUsage(input.periods, input.checks, input.homeTimeZone))) {
    return no('cap');
  }
  if (recentStopSignCheck(input.checks, input.now)) return no('recent-stop-sign');
  if (latest !== null) {
    const last = effectiveLastDay(latest.period, latest.extensions, input.homeTimeZone);
    if (endedBeforeDay1(latest.period) && last >= input.today) {
      return { available: false, reason: 'ended-ahead', day1: last };
    }
    if (last >= input.today) return no('ended-today');
  }
  if (ctx.preStartStopSignToday) return no('stop-sign-today');
  return { available: true };
}

/** Today's start card (W14): opted in at setup, onboarding complete, no period ever, and a start is available. */
export function kickstartPending(input: {
  readonly kickstartOptIn: boolean;
  readonly onboardingCompleted: boolean;
  readonly periods: readonly KickstartPeriodRecord[];
  readonly start: StartAvailability;
}): boolean {
  return (
    input.kickstartOptIn &&
    input.onboardingCompleted &&
    input.periods.length === 0 &&
    input.start.available
  );
}

export interface ExtensionOffer {
  readonly periodId: Id;
  /** The card_state trigger: 'period:<id>:<n>', n = extensions already in the period. */
  readonly trigger: string;
  readonly scheduledLastDay: LocalDate;
  /** Extensions used over every period (the WT-09 counter). */
  readonly extensionsUsed: number;
}

/**
 * The extension offer due today (C59, D27, D28): phase Kickstart, today in the period's extension
 * window, an extension still allowed by both caps, no stop-sign check in the period, and weight not
 * below BMI 18.5. Ignores card state.
 */
export function extensionOfferDue(
  phase: Phase,
  input: PhaseInput,
  lowWeight: boolean,
): ExtensionOffer | null {
  if (phase.kind !== 'kickstart' || lowWeight) return null;
  const period = input.periods.find((p) => p.id === phase.periodId);
  if (period === undefined) return null;
  const window = extensionWindow(period, phase.extensionsInPeriod, input.homeTimeZone);
  const usage = kickstartUsage(input.periods, input.checks, input.homeTimeZone);
  const stopSign = input.checks.some((c) => c.periodId === period.id && c.outcome === 'stop-sign');
  if (!inWindow(input.today, window) || !canExtendKickstart(usage) || stopSign) return null;
  return {
    periodId: period.id,
    trigger: extensionOfferTrigger(period.id, phase.extensionsInPeriod),
    scheduledLastDay: window.to,
    extensionsUsed: usage.extensions,
  };
}

export interface StopSignsDue {
  readonly periodId: Id;
  /** The card_state trigger: 'period:<id>'. */
  readonly trigger: string;
  /** After a stop-sign answer: shown whatever was dismissed, and it cannot be hidden. */
  readonly forced: boolean;
  /** Shows the after-check lines and End Kickstart now. */
  readonly expanded: boolean;
  /** The period is still running by time. */
  readonly running: boolean;
  readonly scheduledLastDay: LocalDate;
}

/**
 * The Kickstart stop-sign card (HS-27; W22): (a) every Kickstart day of the latest period, which
 * its own dismissal can hide for the day; or (b) after a stop-sign check in that period, through
 * its last day (the scheduled last day while it runs by time, else the day it ended), forced and
 * expanded whatever the phase, so every dismissal is ignored. Ignores card state in (a). A latest
 * period that was ended before its first day is passed over for the one before it.
 */
export function stopSignsDue(phase: Phase, input: PhaseInput): StopSignsDue | null {
  const period = periodsThatRan(input.periods).at(-1) ?? null;
  if (period === null) return null;
  const extensions = extensionsOf(period.id, input.checks);
  const scheduled = scheduledLastDay(period, extensions, input.homeTimeZone);
  const running =
    runningKickstartPeriod(
      input.periods,
      input.checks,
      input.now,
      input.deviceTimeZone,
      input.homeTimeZone,
    ) !== null;
  const base = { periodId: period.id, trigger: `period:${period.id}`, running };
  const stopSign = input.checks.some((c) => c.periodId === period.id && c.outcome === 'stop-sign');
  const lastDay = running ? scheduled : effectiveLastDay(period, extensions, input.homeTimeZone);
  if (stopSign && input.today <= lastDay) {
    return { ...base, forced: true, expanded: true, scheduledLastDay: scheduled };
  }
  if (phase.kind === 'kickstart' && phase.periodId === period.id) {
    return { ...base, forced: false, expanded: false, scheduledLastDay: scheduled };
  }
  return null;
}
