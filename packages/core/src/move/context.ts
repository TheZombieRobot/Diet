/**
 * What every Move view reads (checklist item 27; item 27 design section 2.2): one derivation from
 * the stored records, the gates and the clock, so the Move tab, the session screen, the plan
 * editor and Today's Movement card always agree. Built only on item 26's exercise API, item 14's
 * stop-sign window and item 15's fasting span.
 */
import {
  type DayView,
  type EquipmentToggles,
  type ExerciseData,
  jogStatus,
  type JogState,
  resolveWeeklyPattern,
  type ResolvedWeek,
  sessionStartGate,
  type StartGate,
  templateById,
  weekDays,
} from '../exercise';
import { type FastTimes, isOverCeiling, runningSpan, spanElapsedMs } from '../fasting/fastState';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import type { Id, Instant } from '../storage/primitives';
import type { ReadinessGates } from '../storage/readiness';
import type {
  DietMode,
  KickstartCheckRecord,
  ProfileRecord,
  SessionRecord,
  SettingsRecord,
} from '../storage/records';
import {
  addDays,
  type IsoWeekday,
  type LocalDate,
  localDateOf,
  parseInstant,
  weekStartOf,
} from '../util/time';
import { KICKSTART_START_AFTER_STOP_SIGN_HOURS } from '../weight/phase';
import { recentPreStartStopSignDay } from '../weight/preStart';
import { type TodayItem, todaySessions } from './items';

export interface MoveRecords {
  readonly profile: Pick<
    ProfileRecord,
    'equipmentBands' | 'equipmentDumbbells' | 'jogOptIn' | 'dietMode'
  >;
  readonly weeklyPattern: SettingsRecord['weeklyPattern'];
  /** Every stored session row (item 26's history-based functions need the old ones too). */
  readonly sessions: readonly SessionRecord[];
  /** repos.fasts.list(): item 15's span rule needs the neighbouring fasts. */
  readonly fasts: readonly FastTimes[];
  /** repos.kickstart.listChecks(): item 14's stored stop-sign checks. */
  readonly kickstartChecks: readonly KickstartCheckRecord[];
  /** Item 14's latest pre-start "yes" in the last 336 hours (preStartStopSignDay), or null. */
  readonly preStartStopSignDay: LocalDate | null;
}

export interface MoveContext {
  readonly today: LocalDate;
  readonly now: Instant;
  readonly gates: ReadinessGates;
  readonly equipment: EquipmentToggles;
  readonly dietMode: DietMode;
  readonly sessions: readonly SessionRecord[];
  /** The stored jog opt-in, exactly true (the switch on Move's beach card). */
  readonly jogOptIn: boolean;
  readonly jog: { readonly state: JogState; readonly toleratedWalks: number };
  readonly jogUnlocked: boolean;
  readonly week: ResolvedWeek;
  /** Weekdays whose stored jog is shown as the beach walk while jogging is not unlocked. */
  readonly jogAsWalkDays: readonly IsoWeekday[];
  /** This ISO week, Monday first (item 26's weekDays). */
  readonly days: readonly DayView[];
  readonly items: readonly TodayItem[];
  /** A fast runs, fasting is not gated, and its span is at most 24 hours. */
  readonly fastingNow: boolean;
  /** The running fast's span is over 24 hours (item 15), gated or not. */
  readonly fastOverCeiling: boolean;
  /** The latest day with a Kickstart stop-sign answer in item 14's 336-hour window, or null. */
  readonly stopSignOn: LocalDate | null;
}

const STOP_SIGN_ANSWERS = Object.freeze([
  'dizzyOnStanding',
  'palpitations',
  'crampsNotSettling',
  'faintAtWork',
] as const satisfies readonly (keyof KickstartCheckRecord)[]);

/**
 * Item 14's pre-start "yes" for the check (cross-item ruling 9; full review F6, F18): the latest
 * one in the last 336 hours from its card_state record (recentPreStartStopSignDay), or a "yes"
 * this page still holds because its record is not written yet (or could not be). A held "yes" has
 * a date and no time, so it counts on that date and the 14 days after it: the cautious reading.
 */
export function preStartStopSignDay(
  cardStates: Parameters<typeof recentPreStartStopSignDay>[0],
  held: LocalDate | null,
  clock: { readonly today: LocalDate; readonly now: Instant },
): LocalDate | null {
  const recorded = recentPreStartStopSignDay(cardStates, clock.now);
  const heldDays = Math.round(KICKSTART_START_AFTER_STOP_SIGN_HOURS / 24);
  // A date after today (a clock set back) counts too, as a stored check does.
  const counts = held !== null && held >= addDays(clock.today, -heldDays) ? held : null;
  if (recorded === null) return counts;
  return counts !== null && counts > recorded ? counts : recorded;
}

/**
 * The latest local day with a Kickstart stop-sign answer in the last 336 hours (item 14's W31
 * window), or null. A stored check counts when its outcome is 'stop-sign' or any of its four
 * stop-sign answers is not exactly 'no'; one dated after `now` (a clock set back) counts too, the
 * cautious reading. `preStartDay` is the pre-start "yes" (preStartStopSignDay), already within
 * the window, so it counts in every tab, after a relaunch and on the days after it.
 */
export function recentStopSignDay(
  checks: readonly KickstartCheckRecord[],
  preStartDay: LocalDate | null,
  clock: { readonly today: LocalDate; readonly now: Instant },
): LocalDate | null {
  const nowMs = parseInstant(clock.now);
  const windowMs = KICKSTART_START_AFTER_STOP_SIGN_HOURS * 3_600_000;
  const days: LocalDate[] = [];
  for (const check of checks) {
    const stopSign =
      check.outcome === 'stop-sign' || STOP_SIGN_ANSWERS.some((key) => check[key] !== 'no');
    if (stopSign && nowMs - parseInstant(check.askedAt) < windowMs) {
      days.push(
        localDateOf(check.askedAt, resolveZone(check.timeZone, DEFAULT_HOME_TIME_ZONE).timeZone),
      );
    }
  }
  if (preStartDay !== null) days.push(preStartDay);
  return days.length === 0 ? null : (days.sort().at(-1) ?? null);
}

/** The weekdays, Monday first, whose stored plan holds a jog now shown as the beach walk. */
export function jogAsWalkWeekdays(
  data: ExerciseData,
  stored: SettingsRecord['weeklyPattern'],
  week: ResolvedWeek,
): IsoWeekday[] {
  if (!week.jogShownAsWalk || stored === null) return [];
  return stored
    .filter((day) => day.templateIds.some((id) => templateById(data, id)?.kind === 'jog'))
    .map((day) => day.weekday as IsoWeekday)
    .sort((a, b) => a - b);
}

export function moveContext(
  data: ExerciseData,
  records: MoveRecords,
  gates: ReadinessGates,
  clock: { readonly today: LocalDate; readonly now: Instant },
): MoveContext {
  const { today, now } = clock;
  const { profile, sessions } = records;
  // Compared as unknown: only exactly true turns a toggle on, so a damaged value never unlocks
  // jogging or an equipment version.
  const equipment = {
    bands: (profile.equipmentBands as unknown) === true,
    dumbbells: (profile.equipmentDumbbells as unknown) === true,
  };
  const jogOptIn = (profile.jogOptIn as unknown) === true;
  const jog = jogStatus(data, { jogOptIn, sessions, today });
  const jogUnlocked = jog.state === 'unlocked';
  const week = resolveWeeklyPattern(data, records.weeklyPattern, { jogUnlocked });
  const span = runningSpan(records.fasts);
  const fastOverCeiling = span !== null && isOverCeiling(spanElapsedMs(span, parseInstant(now)));
  return Object.freeze({
    today,
    now,
    gates,
    equipment: Object.freeze(equipment),
    dietMode: profile.dietMode,
    sessions,
    jogOptIn,
    jog,
    jogUnlocked,
    week,
    jogAsWalkDays: Object.freeze(jogAsWalkWeekdays(data, records.weeklyPattern, week)),
    days: Object.freeze(weekDays(data, week, sessions, weekStartOf(today), today)),
    items: Object.freeze(todaySessions(data, week, sessions, today)),
    // Compared as unknown, as readiness/gates.ts does: only exactly false lets the fasted note show.
    fastingNow: (gates.fastingGated as unknown) === false && span !== null && !fastOverCeiling,
    fastOverCeiling,
    stopSignOn: recentStopSignDay(records.kickstartChecks, records.preStartStopSignDay, clock),
  });
}

/** Item 26's start gate with the context's inputs: the only way the app calls it (M29). */
export function startGateFor(
  data: ExerciseData,
  ctx: MoveContext,
  templateId: string,
  sessionId: Id | null,
): StartGate {
  return sessionStartGate(data, {
    gates: ctx.gates,
    templateId,
    today: ctx.today,
    week: ctx.week,
    jogUnlocked: ctx.jogUnlocked,
    sessions: ctx.sessions,
    equipment: ctx.equipment,
    sessionId,
  });
}
