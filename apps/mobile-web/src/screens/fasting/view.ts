/**
 * What the Fast card and the Fasting screen show (item 15 design 3.3 to 3.10), worked out from the
 * stored records and the clock by core functions only. Pure: the gate, the effective preset, the
 * Kickstart state, the protein target and the meal figures come in as a FastingContext, which
 * integration.ts builds from items 13, 14 and 21 to 23. Nothing here formats text.
 *
 * Everything is recomputed from stored instants at every render, so a restart, an import or an
 * edit changes nothing about how a fast is measured (FS-03).
 */
import {
  addDays,
  cardHidden,
  type CardStateRecord,
  clockBehind,
  dayWindowChangeAllowed,
  type DayChangeOption,
  DEFAULT_HOME_TIME_ZONE,
  drinkDuringFast,
  type EatingWindow,
  earlierOption,
  cardTrigger,
  FAST_CEILING_MS,
  fastElapsedMs,
  type FastEndHint,
  fastEndHint,
  fastingStreak,
  fastMeter,
  type FastPlan,
  type FastRecord,
  type FastSpan,
  fastSpans,
  hasOverride,
  isOneMealWindow,
  isOverCeiling,
  isSnackAdded,
  type LocalDate,
  localDateOf,
  mealCheck,
  type MealCheckReason,
  type MeterGeometry,
  nextWindowStart,
  openWindowAt,
  parseClockTime,
  type RefluxNudge,
  refluxNudge,
  refluxOptionsVisible,
  resolveZone,
  runningPhase,
  type RunningPhase,
  runningPlan,
  runningSpan,
  type Schedule,
  scheduleFrom,
  type ScheduleRecords,
  type SchedulePreset,
  SPAN_JOIN_GAP_MS,
  type SittingHeadline,
  snackWindowFor,
  spanElapsedMs,
  splitOption,
  standingOn,
  type SymptomRecord,
  symptomDate,
  type TimeZone,
  windowInstance,
  type WindowInstance,
  windowOn,
} from '@diet/core';
import type { FastingInputs } from './inputs';
import type { MealSources } from './integration';
import type { MealTargets } from './mealTargets';

/** The decisions items 13, 14 and 21 to 23 make, as values (integration.ts builds them). */
export interface FastingContext {
  readonly gate: {
    /** readinessGates(...).fastingGated (item 13). */
    readonly fastingGated: boolean;
    /** readinessGates(...).pharmacistReminder: readiness answer 4 yes or unanswered (C07). */
    readonly pharmacistReminder: boolean;
    /** A stated reason in the deficit group (under 18, pregnancy, eating disorder, low weight; F41). */
    readonly quiet: boolean;
  };
  /** effectiveFastingPreset(targets, isKickstartDay(...), gates) (item 14). */
  readonly preset: SchedulePreset;
  /** The running Kickstart period's last day and the preset after it (item 14), or not running. */
  readonly kickstart: ScheduleRecords['kickstart'];
  /** Item 21's protein and energy for a date's meal check (mealTargets.ts), never the phase alone. */
  readonly mealTargets: (date: LocalDate) => MealTargets;
  readonly mealSources: MealSources;
  /**
   * A Kickstart stop-sign answer's pause holds, or a pre-start "yes" was given today (item 14;
   * integration.ts): no fast is timed to the eating window, it is fine to eat now, and nothing
   * offers or names a window time (no 5 pm snack, no reflux option, no next window; F20).
   */
  readonly stopSignPause: boolean;
}

export interface RunningFastView {
  readonly fast: FastRecord;
  readonly span: FastSpan;
  readonly elapsedMs: number;
  readonly phase: RunningPhase;
  readonly plan: FastPlan | null;
  /** The plan's length from the span start, in whole minutes (the card's "of 23 h"). */
  readonly spanPlannedMinutes: number | null;
  readonly meter: MeterGeometry;
  readonly endHint: FastEndHint;
  /** The gap since the fast before, when it joined this one's span. */
  readonly joinedGapMs: number | null;
  readonly clockBehind: boolean;
  readonly alcoholNote: boolean;
  /** The local date the span began, in its own zone, and that zone. */
  readonly startedDate: LocalDate;
  readonly startZone: TimeZone;
  readonly zoneFallback: boolean;
}

export type MealCheckKind =
  'hidden' | 'after' | 'offer' | 'offer-collapsed' | 'ok' | 'snack-added' | 'one-meal-unavailable';

/** The kinds whose rendering carries an "Add 5 pm snack" button when the snack fits. */
export const SNACK_BUTTON_KINDS: readonly MealCheckKind[] = [
  'offer',
  'offer-collapsed',
  'one-meal-unavailable',
];

export interface MealCheckView {
  readonly region: 'upcoming' | 'closed';
  readonly date: LocalDate;
  readonly day: 'today' | 'tomorrow';
  readonly kind: MealCheckKind;
  readonly reasons: readonly MealCheckReason[];
  readonly headline: SittingHeadline | null;
  readonly energyChecked: boolean;
  /** The date's window when its 5 pm snack is added; the snack window when it fits. */
  readonly snack: { readonly added: EatingWindow | null; readonly fits: EatingWindow | null };
  /**
   * The date's window opens more than 24 hours after the running fast's span began: no line names
   * its times, and the one-meal line shows only while a 5 pm snack opening inside those 24 hours
   * can still be added (snack.fits never offers one past them; item 15 review).
   */
  readonly afterCeiling: boolean;
  readonly undoSnackAllowed: boolean;
  /**
   * context.stopSignPause: no 5 pm snack is offered (it sets a timed window) and no line names the
   * window's times, so a snack added before reads without them (F20).
   */
  readonly stopSignPause: boolean;
  /** A symptom was logged today (C62). */
  readonly refluxDay: boolean;
  /** For the after-window region: tomorrow's 5 pm snack, when it fits and is not offered above. */
  readonly tomorrowSnack: EatingWindow | null;
}

/** A per-day change stored for today or tomorrow. */
export interface DayChangeView {
  readonly date: LocalDate;
  readonly day: 'today' | 'tomorrow';
  readonly window: EatingWindow;
  readonly snackAdded: boolean;
  readonly undoAllowed: boolean;
}

export interface RefluxOptionsView {
  readonly date: LocalDate;
  readonly day: 'today' | 'tomorrow';
  readonly symptomTriggered: boolean;
  readonly earlier: DayChangeOption | null;
  readonly split: DayChangeOption | 'already' | null;
  /** The date's own change, when it has one: only that line and its Undo show. */
  readonly changed: { readonly window: EatingWindow; readonly undoAllowed: boolean } | null;
}

export interface RefluxView {
  /** Symptoms of the last 14 local days, newest first. */
  readonly recent: readonly SymptomRecord[];
  readonly nudge: RefluxNudge & { readonly visible: boolean };
  /** Null while fasting is gated, or when no option is visible. */
  readonly options: RefluxOptionsView | null;
  readonly preferEarlier: boolean;
  readonly preferSplit: boolean;
}

export interface HistoryRow {
  readonly fast: FastRecord;
  readonly lengthMs: number;
  /** The fast's span is over 24 hours. */
  readonly over24: boolean;
  /** Joined to the fast before it: the gap and the whole span's length. */
  readonly joined: { readonly gapMs: number; readonly spanMs: number } | null;
  /** The first fast of a span that later fasts joined: the whole span's length. */
  readonly joinedFirst: { readonly spanMs: number } | null;
}

/** The latest completed fast, for the "Fast ended" line. */
export interface LastEndedView {
  readonly fast: FastRecord;
  readonly spanMs: number;
  readonly over24: boolean;
  /** The phone's clock reads earlier than the stored end (End stored the start; repos/fasts.ts). */
  readonly clockBehind: boolean;
}

export interface PatternView {
  readonly standing: EatingWindow;
  readonly next: WindowInstance | null;
}

export type FastingView =
  | {
      readonly kind: 'gated';
      readonly quiet: boolean;
      readonly openFast: RunningFastView | null;
      readonly reflux: RefluxView;
    }
  | {
      readonly kind: 'open';
      readonly schedule: Schedule;
      readonly pattern: PatternView | null;
      /** "No fasting plan for now" is stored (rather than nothing chosen yet). */
      readonly noPlanChosen: boolean;
      readonly running: RunningFastView | null;
      readonly idle: {
        readonly openUntil: WindowInstance | null;
        readonly next: WindowInstance | null;
      } | null;
      readonly lastEnded: LastEndedView | null;
      readonly upcoming: MealCheckView | null;
      readonly closed: MealCheckView | null;
      readonly dayChanges: readonly DayChangeView[];
      readonly reflux: RefluxView;
      readonly history: { readonly streakDays: number; readonly rows: readonly HistoryRow[] };
      readonly pharmacist: boolean;
      readonly kickstartActive: boolean;
      /**
       * No fast runs and the last one ended less than an hour ago, so a fast started now would
       * join it (the 24-hour rule): Start asks first, naming when a new fast counts on its own
       * (F21). Null otherwise.
       */
      readonly joinIfStartedNow: {
        readonly endedMs: number;
        readonly separateFromMs: number;
      } | null;
      /** context.stopSignPause: the cards say it is fine to eat now, with the stop-signs. */
      readonly stopSignPause: boolean;
      readonly startVariant: 'primary' | 'secondary';
    };

const iso = (ms: number): string => new Date(ms).toISOString();
const ms = (at: string): number => Date.parse(at);

/**
 * The running fast. During a stop-sign pause it has no plan: no planned length, no window on the
 * meter and no window to wait for, only "It's fine to eat now" (F20).
 */
function runningView(
  inputs: FastingInputs,
  schedule: Schedule,
  home: TimeZone,
  nowMs: number,
  deviceZone: TimeZone,
  stopSignPause: boolean,
): RunningFastView | null {
  const span = runningSpan(inputs.fasts);
  const fast = inputs.fasts.find((f) => f.id === span?.fasts.at(-1)?.id);
  const first = span?.fasts[0];
  if (span === null || fast === undefined || first === undefined) return null;
  const elapsedMs = spanElapsedMs(span, nowMs);
  const plan = stopSignPause
    ? null
    : runningPlan(ms(fast.startedAt), deviceZone, schedule, span.startMs, nowMs);
  const phase = runningPhase(elapsedMs, nowMs, plan);
  const previousEnd = span.fasts.at(-2)?.endedAt ?? null;
  const zone = resolveZone(first.timeZone, home, DEFAULT_HOME_TIME_ZONE);
  return {
    fast,
    span,
    elapsedMs,
    phase,
    plan,
    spanPlannedMinutes:
      plan === null
        ? null
        : Math.min(Math.max(Math.round((plan.targetEndMs - span.startMs) / 60_000), 1), 1440),
    meter: fastMeter(span, nowMs, plan),
    endHint: stopSignPause ? { kind: 'eat-now' } : fastEndHint(phase, plan),
    joinedGapMs: previousEnd === null ? null : ms(fast.startedAt) - ms(previousEnd),
    clockBehind: clockBehind(span, nowMs),
    alcoholNote: inputs.drinks.some((d) => drinkDuringFast(d.at, span.fasts, nowMs)),
    startedDate: localDateOf(first.startedAt, zone.timeZone),
    startZone: zone.timeZone,
    zoneFallback: zone.fallback,
  };
}

function refluxBase(
  inputs: FastingInputs,
  home: TimeZone,
  nowMs: number,
): Omit<RefluxView, 'options'> {
  const from = addDays(inputs.today, -13);
  const recent = inputs.symptoms
    .filter((s) => {
      const date = symptomDate(s, home);
      return date >= from && date <= inputs.today;
    })
    .sort((a, b) => ms(b.at) - ms(a.at));
  const nudge = refluxNudge(inputs.symptoms, inputs.today, home);
  const hidden = cardHidden({
    now: iso(nowMs),
    row: inputs.nudgeCard,
    dismissal: cardTrigger('reflux-gp-nudge', 'rolling')?.dismissal ?? { kind: 'final' },
    drinkingDayCutoverMinutes: inputs.settings.drinkingDayCutoverMinutes,
  });
  return {
    recent,
    nudge: { ...nudge, visible: nudge.due && !hidden },
    preferEarlier: inputs.targets.refluxPreferEarlier,
    preferSplit: inputs.targets.refluxPreferSplit,
  };
}

const dayOf = (date: LocalDate, today: LocalDate): 'today' | 'tomorrow' =>
  date > today ? 'tomorrow' : 'today';

/**
 * The 5 pm snack for a date, when it can be added now (design 3.7) and, during a fast, opens
 * within 24 hours of the span's start (`ceilingMs`), so it is never offered as a time to eat that
 * lies past the ceiling.
 */
function snackThatFits(
  date: LocalDate,
  schedule: Schedule,
  deviceZone: TimeZone,
  nowMs: number,
  ceilingMs: number | null,
): EatingWindow | null {
  const window = windowOn(date, schedule);
  if (window === null || hasOverride(date, schedule)) return null;
  const snack = snackWindowFor(window);
  if (snack === null) return null;
  const startMs = windowInstance(date, snack, deviceZone).startMs;
  if (startMs <= nowMs || (ceilingMs !== null && startMs > ceilingMs)) return null;
  return dayWindowChangeAllowed(schedule, [{ date, window: snack }], deviceZone) ? snack : null;
}

/** "Not now" on the date's snack offer (final for that date; FL-12, C73). */
function snackDismissed(
  date: LocalDate,
  card: CardStateRecord | undefined,
  nowMs: number,
): boolean {
  return cardHidden({
    now: iso(nowMs),
    row: card,
    dismissal: cardTrigger('single-meal-snack', `date:${date}`)?.dismissal ?? { kind: 'final' },
    drinkingDayCutoverMinutes: 0,
  });
}

function mealCheckView(
  region: 'upcoming' | 'closed',
  date: LocalDate,
  day: 'today' | 'tomorrow',
  inputs: FastingInputs,
  context: FastingContext,
  schedule: Schedule,
  refluxDay: boolean,
  deviceZone: TimeZone,
  nowMs: number,
  ceilingMs: number | null,
): MealCheckView {
  const window = windowOn(date, schedule);
  const afterCeiling =
    window !== null &&
    ceilingMs !== null &&
    windowInstance(date, window, deviceZone).startMs > ceilingMs;
  const { mealSources } = context;
  const { proteinTargetG, energyTargetKj } = context.mealTargets(date);
  const result = mealCheck({
    proteinTargetG,
    dayEnergyTargetKj: energyTargetKj,
    planned: mealSources.plannedMeals(date),
    logged: mealSources.loggedIntake(date),
    windowClosed: region === 'closed',
    oneMealWindow: window !== null && isOneMealWindow(window),
  });
  const added = isSnackAdded(date, schedule) ? window : null;
  const fits = context.stopSignPause
    ? null
    : snackThatFits(date, schedule, deviceZone, nowMs, ceilingMs);
  const snack = { added, fits };
  let kind: MealCheckKind = 'hidden';
  if (region === 'closed') {
    kind = result.kind === 'short-after' ? 'after' : 'hidden';
  } else if (result.kind === 'short-before') {
    kind = snackDismissed(date, inputs.snackCards[date], nowMs) ? 'offer-collapsed' : 'offer';
  } else if (result.kind === 'ok') {
    kind = 'ok';
  } else if (result.kind === 'unavailable' && added !== null) {
    kind = 'snack-added';
  } else if (
    result.kind === 'unavailable' &&
    window !== null &&
    isOneMealWindow(window) &&
    // Past the ceiling, only while a snack inside it can still be added (it brings eating in).
    (!afterCeiling || snack.fits !== null)
  ) {
    kind = 'one-meal-unavailable';
  }
  return {
    region,
    date,
    day,
    kind,
    reasons: result.kind === 'short-before' || result.kind === 'short-after' ? result.reasons : [],
    headline: result.kind === 'ok' || result.kind === 'short-before' ? result.sitting : null,
    energyChecked: energyTargetKj !== null,
    snack,
    afterCeiling,
    undoSnackAllowed:
      added !== null && dayWindowChangeAllowed(schedule, [{ date, window: null }], deviceZone),
    stopSignPause: context.stopSignPause,
    refluxDay,
    tomorrowSnack: null,
  };
}

/** The view of the fasting records at `nowMs` in the device's zone. */
export function fastingView(
  inputs: FastingInputs,
  context: FastingContext,
  nowMs: number,
  deviceZone: TimeZone,
): FastingView {
  const home = resolveZone(inputs.settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  const { today } = inputs;
  const tomorrow = addDays(today, 1);
  const schedule = scheduleFrom({
    preset: context.preset,
    planDays: inputs.planDays,
    fastingGated: context.gate.fastingGated,
    kickstart: context.kickstart,
  });
  const running = runningView(inputs, schedule, home, nowMs, deviceZone, context.stopSignPause);
  const reflux = refluxBase(inputs, home, nowMs);
  // During a fast, no window opening past 24 hours of its span is offered or timed (review).
  const ceilingMs = running === null ? null : running.span.startMs + FAST_CEILING_MS;

  if (context.gate.fastingGated) {
    return {
      kind: 'gated',
      quiet: context.gate.quiet,
      openFast: running,
      reflux: { ...reflux, options: null },
    };
  }

  // The upcoming check date: the window open now (a wrapped one is still "tonight"), else the next.
  const open = openWindowAt(nowMs, deviceZone, schedule);
  const next = nextWindowStart(nowMs, deviceZone, schedule);
  const upcomingInstance = open ?? next;
  const refluxDay = inputs.symptoms.some((s) => symptomDate(s, home) === today);
  const upcoming =
    upcomingInstance === null
      ? null
      : mealCheckView(
          'upcoming',
          upcomingInstance.date,
          open !== null ? 'today' : dayOf(upcomingInstance.date, today),
          inputs,
          context,
          schedule,
          refluxDay,
          deviceZone,
          nowMs,
          ceilingMs,
        );

  // The closed check date: today's window started and ended today, before now (no wrap; F33).
  const todayWindow = windowOn(today, schedule);
  const todayInstance =
    todayWindow === null ? null : windowInstance(today, todayWindow, deviceZone);
  const wraps =
    todayWindow !== null && parseClockTime(todayWindow.end) <= parseClockTime(todayWindow.start);
  let closed: MealCheckView | null = null;
  if (todayInstance !== null && !wraps && todayInstance.endMs <= nowMs) {
    const view = mealCheckView(
      'closed',
      today,
      'today',
      inputs,
      context,
      schedule,
      refluxDay,
      deviceZone,
      nowMs,
      ceilingMs,
    );
    // Only one "Add 5 pm snack" for tomorrow: the upcoming region's, when it shows one.
    const offeredAbove =
      upcoming?.date === tomorrow &&
      upcoming.snack.fits !== null &&
      SNACK_BUTTON_KINDS.includes(upcoming.kind);
    closed = {
      ...view,
      tomorrowSnack:
        offeredAbove || context.stopSignPause
          ? null
          : snackThatFits(tomorrow, schedule, deviceZone, nowMs, ceilingMs),
    };
  }

  const dayChanges: DayChangeView[] = [today, tomorrow].flatMap((date) => {
    const window = windowOn(date, schedule);
    if (window === null || !hasOverride(date, schedule)) return [];
    return [
      {
        date,
        day: dayOf(date, today),
        window,
        snackAdded: isSnackAdded(date, schedule),
        undoAllowed: dayWindowChangeAllowed(schedule, [{ date, window: null }], deviceZone),
      },
    ];
  });

  const visible = refluxOptionsVisible({
    symptoms: inputs.symptoms,
    today,
    homeTimeZone: home,
    preferEarlier: inputs.targets.refluxPreferEarlier,
    preferSplit: inputs.targets.refluxPreferSplit,
  });
  let options: RefluxOptionsView | null = null;
  // During a stop-sign pause no option moves or times the window (F20).
  if (!context.stopSignPause && upcomingInstance !== null && (visible.earlier || visible.split)) {
    const date = upcomingInstance.date;
    const own = hasOverride(date, schedule) ? windowOn(date, schedule) : null;
    const earlier = visible.earlier ? earlierOption(date, schedule, deviceZone, nowMs) : null;
    const split = visible.split ? splitOption(date, schedule, deviceZone, nowMs) : null;
    // Nothing left to offer for the date (its window has opened, say): no "Options for today"
    // heading with nothing under it (F26).
    options =
      earlier === null && split === null && own === null
        ? null
        : {
            date,
            day: upcoming?.day ?? dayOf(date, today),
            symptomTriggered: visible.symptomTriggered,
            earlier,
            split,
            changed:
              own === null
                ? null
                : {
                    window: own,
                    undoAllowed: dayWindowChangeAllowed(
                      schedule,
                      [{ date, window: null }],
                      deviceZone,
                    ),
                  },
          };
  }

  const spans = fastSpans(inputs.fasts);
  const spanOf = new Map(spans.flatMap((s) => s.fasts.map((f) => [f.id, s] as const)));
  const completed = inputs.fasts
    .filter((f) => f.endedAt !== null)
    .sort((a, b) => ms(b.startedAt) - ms(a.startedAt));
  const rows: HistoryRow[] = completed.map((fast) => {
    const span = spanOf.get(fast.id);
    const index = span?.fasts.findIndex((f) => f.id === fast.id) ?? 0;
    const before = index > 0 ? span?.fasts[index - 1] : undefined;
    const spanMs = span === undefined ? 0 : spanElapsedMs(span, nowMs);
    const beforeEnd = before?.endedAt ?? null;
    return {
      fast,
      lengthMs: fastElapsedMs(fast, nowMs),
      over24: (span?.endMs ?? null) !== null && isOverCeiling(spanMs),
      joined: beforeEnd === null ? null : { gapMs: ms(fast.startedAt) - ms(beforeEnd), spanMs },
      // So the first row of a joined span explains its length and its over-24 tag too (review).
      joinedFirst: index === 0 && (span?.fasts.length ?? 0) > 1 ? { spanMs } : null,
    };
  });
  const latest = completed[0];
  const latestSpan = latest === undefined ? undefined : spanOf.get(latest.id);
  const lastEnded: LastEndedView | null =
    latest === undefined || latestSpan === undefined || running !== null
      ? null
      : {
          fast: latest,
          spanMs: spanElapsedMs(latestSpan, nowMs),
          over24: isOverCeiling(spanElapsedMs(latestSpan, nowMs)),
          clockBehind: latest.endedAt !== null && nowMs < ms(latest.endedAt),
        };

  const lastEnd = spans.at(-1)?.endMs ?? null;
  const joinIfStartedNow =
    running === null && lastEnd !== null && nowMs - lastEnd < SPAN_JOIN_GAP_MS
      ? { endedMs: lastEnd, separateFromMs: lastEnd + SPAN_JOIN_GAP_MS }
      : null;

  const standing = standingOn(today, schedule);
  // During a stop-sign pause the pattern names no next window to wait for (F20).
  const pattern: PatternView | null =
    schedule.standing === null || standing === null
      ? null
      : { standing, next: context.stopSignPause ? null : next };
  const noPattern = pattern === null;
  const showsReasons =
    (upcoming !== null && upcoming.reasons.length > 0) || closed?.kind === 'after';
  return {
    kind: 'open',
    schedule,
    pattern,
    noPlanChosen:
      inputs.targets.fastingPreset === null && inputs.settings.scheduleConfirmedAt !== null,
    running,
    idle: running === null ? { openUntil: open, next } : null,
    lastEnded,
    upcoming,
    closed,
    dayChanges,
    reflux: { ...reflux, options },
    history: { streakDays: fastingStreak(inputs.fasts, today, home), rows },
    pharmacist: context.gate.pharmacistReminder,
    kickstartActive: context.kickstart.running,
    joinIfStartedNow,
    stopSignPause: context.stopSignPause,
    startVariant:
      !noPattern && open === null && !showsReasons && !context.stopSignPause
        ? 'primary'
        : 'secondary',
  };
}

/** The span start a new fast would join: the last fast's span, when it ended under an hour ago. */
export function joiningSpanStart(fasts: readonly FastRecord[], nowMs: number): number | undefined {
  const last = fastSpans(fasts).at(-1);
  if (last === undefined || last.endMs === null) return undefined;
  return nowMs - last.endMs < SPAN_JOIN_GAP_MS ? last.startMs : undefined;
}
