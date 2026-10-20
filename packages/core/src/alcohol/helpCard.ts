/**
 * When the "talk to someone" card shows (HEALTH_SAFETY.md section 5; HS-06, AL-06 to AL-10,
 * AL-09b; C05, C21, C44, C46, C58; D8, D43; item 28 design 3.6, A7 to A10, A36, A37, A39).
 *
 * Four triggers, each independent and each with its own registry dismissal: question 7 (back 30
 * days after "Not now"), and three from the records, which "Not now" hides until the next
 * drinking day while they still hold. The two drinking triggers are worked out with the owner's
 * cut-over and with the default 5:00 am one, and either is enough, so moving the cut-over can never
 * break a run or split a window the default would see. Each holds for 7 drinking days after the
 * drinking that raised it, because the days after a heavy stretch matter most.
 */
import { type CardStateTimes, cardHidden, cardNextChange, cardTrigger } from '../storage/cards';
import {
  DEFAULT_HOME_TIME_ZONE,
  areConsecutiveDrinkingDays,
  drinkingDayOf,
  resolveZone,
} from '../storage/dates';
import { DRINKING_DAY_CUTOVER_MINUTES } from '../storage/limits';
import type { Instant, TimeZone } from '../storage/primitives';
import type { DrinkLogRecord } from '../storage/records';
import { addDays, type LocalDate } from '../util/time';
import { reachesDoubleGuidance } from './guidance';
import {
  type AlcoholDay,
  alcoholDaysOfPlaced,
  type DrinkingDayContext,
  placeDrinks,
  totalsOfPlaced,
} from './totals';

export type AlcoholHelpTrigger =
  'readiness-q7' | 'consecutive-days' | 'double-guidance' | 'withdrawal-tick';

/** In CARD_REGISTRY order (storage spec section 4.12). */
export const ALCOHOL_HELP_TRIGGERS: readonly AlcoholHelpTrigger[] = Object.freeze([
  'readiness-q7',
  'consecutive-days',
  'double-guidance',
  'withdrawal-tick',
]);

export const HELP_CARD_RULES = Object.freeze({
  /** HEALTH_SAFETY section 5: "7 or more consecutive days with alcohol logged". */
  consecutiveDays: 7,
  /** A run, or a 7-day window, counts while it ended within the last 7 drinking days (A7, A8). */
  recentDays: 7,
  /** C21 point 2: rolling 7 drinking days. */
  rollingDays: 7,
  /** C05: a tick within the last 30 days, today included. */
  withdrawalWindowDays: 30,
  /** The rolling window plus the hold: today − 13 to today. */
  lookbackDays: 14,
});

export interface HelpTriggerInput {
  readonly now: Instant;
  readonly deviceZone: TimeZone;
  /** The owner's home zone and cut-over. */
  readonly ctx: DrinkingDayContext;
  /** Drinks covering at least the last 15 drinking days. */
  readonly rows: readonly DrinkLogRecord[];
  /** guidanceFor(profile.sex, settings.alcoholGuidanceSet).perWeek (the stricter set, C46). */
  readonly weeklyGuidance: number;
  /** Dates of alcohol_day_notes rows with withdrawalTick true. */
  readonly withdrawalTickDates: readonly LocalDate[];
  /** Today's calendar date in the device zone (notes are keyed by calendar date). */
  readonly noteToday: LocalDate;
  /** readinessGates(...).alcoholHelpCardFromDayOne: question 7 yes or unanswered (C58). */
  readonly q7Gated: boolean;
}

export interface DrinkingRun {
  readonly start: LocalDate;
  readonly end: LocalDate;
  /** Drinking days in the run (a date skipped by crossing the date line is not one). */
  readonly length: number;
}

/** Runs of consecutive drinking days (D8: areConsecutiveDrinkingDays), oldest first. */
export function drinkingRuns(
  days: readonly AlcoholDay[],
  cutoverMinutes: number,
): readonly DrinkingRun[] {
  const runs: DrinkingRun[] = [];
  let previous: AlcoholDay | null = null;
  for (const day of days) {
    const last = runs.at(-1);
    const joins =
      previous !== null &&
      last !== undefined &&
      areConsecutiveDrinkingDays(
        { day: previous.day, timeZone: previous.lastZone },
        { day: day.day, firstAt: day.firstAt, timeZone: day.firstZone },
        cutoverMinutes,
      );
    if (joins) runs[runs.length - 1] = { start: last.start, end: day.day, length: last.length + 1 };
    else runs.push({ start: day.day, end: day.day, length: 1 });
    previous = day;
  }
  return runs;
}

/** The two drinking triggers under one cut-over. */
function drinkingTriggers(
  input: HelpTriggerInput,
  cutoverMinutes: number,
): { readonly consecutive: boolean; readonly double: boolean } {
  const ctx = { ...input.ctx, cutoverMinutes };
  const deviceZone = resolveZone(
    input.deviceZone,
    input.ctx.homeTimeZone,
    DEFAULT_HOME_TIME_ZONE,
  ).timeZone;
  const today = drinkingDayOf(input.now, deviceZone, cutoverMinutes);
  const placed = placeDrinks(input.rows, ctx);
  const days = alcoholDaysOfPlaced(placed, addDays(today, 1 - HELP_CARD_RULES.lookbackDays), today);
  const recentEnd = addDays(today, 1 - HELP_CARD_RULES.recentDays);
  const consecutive = drinkingRuns(days, cutoverMinutes).some(
    (run) => run.length >= HELP_CARD_RULES.consecutiveDays && run.end >= recentEnd,
  );
  let double = false;
  for (let k = 0; k < HELP_CARD_RULES.recentDays && !double; k++) {
    const end = addDays(today, -k);
    const totals = totalsOfPlaced(placed, addDays(end, 1 - HELP_CARD_RULES.rollingDays), end);
    double = reachesDoubleGuidance(totals.triggerStd, input.weeklyGuidance);
  }
  return { consecutive, double };
}

/** The triggers that hold now, in registry order. Each is independent of the others. */
export function activeHelpTriggers(input: HelpTriggerInput): readonly AlcoholHelpTrigger[] {
  const cutovers = [...new Set([input.ctx.cutoverMinutes, DRINKING_DAY_CUTOVER_MINUTES.default])];
  const drinking = cutovers.map((c) => drinkingTriggers(input, c));
  const firstCounted = addDays(input.noteToday, 1 - HELP_CARD_RULES.withdrawalWindowDays);
  const active: Record<AlcoholHelpTrigger, boolean> = {
    'readiness-q7': input.q7Gated,
    'consecutive-days': drinking.some((d) => d.consecutive),
    'double-guidance': drinking.some((d) => d.double),
    // A date after today can only come from an import; counting it is the safe direction (A9).
    'withdrawal-tick': input.withdrawalTickDates.some((d) => d >= firstCounted),
  };
  return ALCOHOL_HELP_TRIGGERS.filter((t) => active[t]);
}

export interface HelpCardState {
  readonly visible: boolean;
  /** Active triggers whose own dismissal does not hide them now. */
  readonly showing: readonly AlcoholHelpTrigger[];
  /** Which return line the card shows. */
  readonly returns: 'next-drinking-day' | 'in-30-days';
}

type HelpRows = Readonly<Partial<Record<AlcoholHelpTrigger, CardStateTimes>>>;

function visibilityInput(
  trigger: AlcoholHelpTrigger,
  rows: HelpRows,
  now: Instant,
  cutoverMinutes: number,
) {
  const entry = cardTrigger('alcohol-help', trigger);
  if (entry === null) throw new RangeError(`alcohol-help has no trigger ${trigger}`);
  return {
    now,
    row: rows[trigger] ?? null,
    dismissal: entry.dismissal,
    drinkingDayCutoverMinutes: cutoverMinutes,
  };
}

/** Which active triggers show now, by each one's own dismissal rule (cardHidden; C44, D43). */
export function helpCardState(
  active: readonly AlcoholHelpTrigger[],
  rows: HelpRows,
  now: Instant,
  cutoverMinutes: number,
): HelpCardState {
  const showing = active.filter((t) => !cardHidden(visibilityInput(t, rows, now, cutoverMinutes)));
  const collapsed = showing.some(
    (t) => visibilityInput(t, rows, now, cutoverMinutes).dismissal.kind === 'collapsed',
  );
  return {
    visible: showing.length > 0,
    showing,
    returns: collapsed ? 'next-drinking-day' : 'in-30-days',
  };
}

/** The next instant any active trigger's dismissal can change (cardNextChange), for a redraw. */
export function helpCardNextChange(
  active: readonly AlcoholHelpTrigger[],
  rows: HelpRows,
  now: Instant,
  cutoverMinutes: number,
): number | null {
  const times = active
    .map((t) => cardNextChange(visibilityInput(t, rows, now, cutoverMinutes)))
    .filter((ms): ms is number => ms !== null);
  return times.length === 0 ? null : Math.min(...times);
}
