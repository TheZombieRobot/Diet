/**
 * What the Fast card and the Fasting screen read (item 15 design 3.10), in one live query: every
 * write to these stores re-renders them. The query is built per local date, so its date ranges
 * move at midnight. A failed read returns { ok: false } instead of throwing, because a live query
 * swallows errors and would otherwise leave the screen blank.
 */
import {
  addDays,
  type CardStateRecord,
  DEFAULT_HOME_TIME_ZONE,
  type DrinkLogRecord,
  type FastRecord,
  type KickstartCheckRecord,
  type KickstartPeriodRecord,
  type LocalDate,
  localDateOf,
  PRE_START_STOP_SIGN_CARD,
  preStartTrigger,
  type PlanDayRecord,
  type ProfileRecord,
  type ReadinessRecord,
  resolveZone,
  runningSpan,
  type SettingsRecord,
  type SymptomRecord,
  type TargetsRecord,
  utcRangeCovering,
  type WeightRecord,
} from '@diet/core';
import type { AppStorage } from '../../db/runtime';

export interface FastingInputs {
  /** The local date the query was built for. */
  readonly today: LocalDate;
  readonly targets: TargetsRecord;
  readonly settings: SettingsRecord;
  readonly profile: ProfileRecord;
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  /** With the weigh-ins, what item 21's day targets read for the meal check (mealTargets.ts). */
  readonly readiness: readonly ReadinessRecord[];
  /** Every weigh-in (item 21 reads the last 7 local days and the latest on or before today). */
  readonly weights: readonly WeightRecord[];
  readonly fasts: readonly FastRecord[];
  /** From the day before the running span began (or yesterday) to the day after tomorrow. */
  readonly planDays: readonly PlanDayRecord[];
  /** Symptoms whose instant lies near the last 15 local days (filter by symptomDate). */
  readonly symptoms: readonly SymptomRecord[];
  /** The 5 pm snack offer's card state for today and tomorrow, by date. */
  readonly snackCards: Readonly<Record<LocalDate, CardStateRecord | undefined>>;
  readonly nudgeCard: CardStateRecord | undefined;
  /**
   * Today's pre-start stop-sign "yes", if any (item 14's record: core weight/preStart.ts), so the
   * Fast card and Today's top line pause in every tab and after a relaunch (F20).
   */
  readonly preStartCards: readonly CardStateRecord[];
  /** Drinks of the drinking days the running span covers (none while nothing runs). */
  readonly drinks: readonly DrinkLogRecord[];
}

export type FastingRead =
  { readonly ok: true; readonly inputs: FastingInputs } | { readonly ok: false };

async function read(storage: AppStorage, today: LocalDate): Promise<FastingInputs> {
  const { repos } = storage;
  const [targets, settings, profile, periods, checks, readiness, weights, fasts] =
    await Promise.all([
      repos.targets.get(),
      repos.settings.get(),
      repos.profile.get(),
      repos.kickstart.listPeriods(),
      repos.kickstart.listChecks(),
      repos.readiness.list(),
      repos.weights.list(),
      repos.fasts.list(),
    ]);
  const span = runningSpan(fasts);
  const home = resolveZone(settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  const first = span?.fasts[0];
  const spanStartDate =
    first === undefined
      ? null
      : localDateOf(first.startedAt, resolveZone(first.timeZone, home).timeZone);
  const from = addDays(spanStartDate !== null && spanStartDate < today ? spanStartDate : today, -1);
  const { lower, upper } = utcRangeCovering(addDays(today, -15), addDays(today, 1));
  const tomorrow = addDays(today, 1);
  const [planDays, symptoms, snackToday, snackTomorrow, nudgeCard, preStart, drinks] =
    await Promise.all([
      repos.planDays.listByIndex('date', from, addDays(today, 2)),
      repos.symptoms.listByIndex('at', lower, upper),
      repos.cardState.get('single-meal-snack', `date:${today}`),
      repos.cardState.get('single-meal-snack', `date:${tomorrow}`),
      repos.cardState.get('reflux-gp-nudge', 'rolling'),
      repos.cardState.get(PRE_START_STOP_SIGN_CARD, preStartTrigger(today)),
      spanStartDate === null
        ? Promise.resolve([])
        : repos.drinks.forDrinkingDays(addDays(spanStartDate, -1), tomorrow),
    ]);
  return {
    today,
    targets,
    settings,
    profile,
    periods,
    checks,
    readiness,
    weights,
    fasts,
    planDays,
    symptoms,
    snackCards: { [today]: snackToday, [tomorrow]: snackTomorrow },
    nudgeCard,
    preStartCards: preStart === undefined ? [] : [preStart],
    drinks,
  };
}

/** Reads the inputs for `today`; a failure is reported, never thrown. */
export async function readFastingInputs(
  storage: AppStorage,
  today: LocalDate,
): Promise<FastingRead> {
  try {
    return { ok: true, inputs: await read(storage, today) };
  } catch {
    return { ok: false };
  }
}
