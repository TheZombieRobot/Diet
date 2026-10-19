/**
 * Weight scenarios (checklist item 14; item 14 design section 6.1): complete synthetic
 * schema-version-1 snapshots of an owner who finished setup, with daily weigh-ins along a chosen
 * weekly pace and any number of Kickstart periods, extensions, stop-sign checks and early ends.
 * Every value is synthetic: dates in the year 2000, a 180 cm height, a 100.0 kg start weight and a
 * 78.0 kg long-term goal. Nothing describes anyone.
 *
 * Core tests take gates as plain objects (gatesWith), so they never depend on the gate function;
 * the readiness rows in a snapshot are what the app reads.
 */
import {
  addDays,
  BACKUP_TABLES,
  type CardStateRecord,
  daysBetween,
  defaultProfile,
  defaultSettings,
  defaultTargets,
  type DietMode,
  type Id,
  type Instant,
  type KickstartCheckRecord,
  type KickstartEndReason,
  type KickstartPeriodRecord,
  type LocalDate,
  type ProfileRecord,
  READINESS_QUESTION_IDS,
  READINESS_WORDING,
  type ReadinessGates,
  type ReadinessId,
  type ReadinessRecord,
  type SettingsRecord,
  type Snapshot,
  type TargetsRecord,
  type WeightOverviewInput,
  type WeightRecord,
  type YesNo,
  zonedWallTimeToInstant,
} from '@diet/core';
import { fixtureId } from '../storage/snapshotV1';

/** Every scenario lives in New Zealand time. */
export const SCENARIO_ZONE = 'Pacific/Auckland';

/** All gates open (every readiness answer "no"), with any overrides: a plain object for core tests. */
export function gatesWith(overrides: Partial<ReadinessGates> = {}): ReadinessGates {
  return {
    under18: false,
    fastingGated: false,
    kickstartAvailable: true,
    deficitAllowed: true,
    ketoCeilingAvailable: true,
    carbCeilingBelow50Allowed: true,
    projectionBandAvailable: true,
    goalSettingAvailable: true,
    energyEstimateAvailable: true,
    alcoholLoggingAvailable: true,
    exercisePlansAvailable: true,
    pharmacistReminder: false,
    bloodPressureSaltWording: false,
    alcoholHelpCardFromDayOne: false,
    reasons: [],
    ...overrides,
  };
}

/** The gates readiness answer 5 "yes" gives (no deficit, Kickstart, band, goal or keto ceiling). */
export const Q5_YES_GATES: ReadinessGates = gatesWith({
  fastingGated: true,
  kickstartAvailable: false,
  deficitAllowed: false,
  ketoCeilingAvailable: false,
  carbCeilingBelow50Allowed: false,
  projectionBandAvailable: false,
  goalSettingAvailable: false,
});

/** The gates readiness answer 3 "yes" without the prescriber's agreement gives. */
export const Q3_OPEN_GATES: ReadinessGates = gatesWith({
  fastingGated: true,
  kickstartAvailable: false,
  carbCeilingBelow50Allowed: false,
});

export interface ScenarioPeriod {
  /** Scenario day on which the period starts, at 07:30 local. */
  readonly startDay: number;
  /** 'extended' checks (all four 'no') on the first day of each extension window, at 08:00. */
  readonly extensions?: number;
  /** A 'stop-sign' check (palpitations 'yes') at 08:00; it must lie in an extension window. */
  readonly stopSignOnDay?: number;
  /** An early end at 12:00 local on that day. */
  readonly endOnDay?: number;
  /** Default 'user-ended'. */
  readonly endReason?: KickstartEndReason;
}

export interface WeightScenarioOptions {
  /** Scenario day 1 (the first weigh-in date). */
  readonly day1: LocalDate;
  readonly today: LocalDate;
  /** Default 100.0. */
  readonly startKg?: number;
  /** Default 180. */
  readonly heightCm?: number | null;
  /** Default 78.0. */
  readonly goalKg?: number | null;
  /** kg lost a week for each week from day 1 (positive is down); the last rate continues. */
  readonly ratesKgPerWeek: readonly number[];
  /** Which days have a weigh-in (default: every day up to today). */
  readonly days?: (day: number) => boolean;
  readonly periods?: readonly ScenarioPeriod[];
  /** Default: every question answered 'no'; null leaves a question unanswered (no row). */
  readonly readiness?: Partial<Record<ReadinessId, YesNo | null>>;
  /** Default 'keto'. */
  readonly dietMode?: DietMode;
  readonly profile?: Partial<ProfileRecord>;
  readonly targets?: Partial<TargetsRecord>;
  readonly settings?: Partial<SettingsRecord>;
  readonly cardStates?: readonly CardStateRecord[];
}

/** The instant of a local wall-clock time on scenario day `day`. */
export function scenarioInstant(day1: LocalDate, day: number, time: string): Instant {
  const [h, m] = time.split(':').map(Number);
  const minutes = (h ?? 0) * 60 + (m ?? 0);
  return new Date(
    zonedWallTimeToInstant(addDays(day1, day - 1), minutes, SCENARIO_ZONE),
  ).toISOString();
}

/** The scenario day number of a date (day 1 is day1). */
export const scenarioDay = (day1: LocalDate, date: LocalDate): number =>
  daysBetween(day1, date) + 1;

/** The weight on day d: the start weight less each day's share of its week's rate, unrounded. */
export function scenarioKg(startKg: number, rates: readonly number[], day: number): number {
  let kg = startKg;
  for (let k = 0; k < day - 1; k++) {
    const rate = rates[Math.min(Math.floor(k / 7), rates.length - 1)] ?? 0;
    kg -= rate / 7;
  }
  return kg;
}

/** A complete version-1 snapshot (every backed-up store) that passes validateSnapshot and checkInvariants. */
export function weightScenario(options: WeightScenarioOptions): Snapshot {
  const { day1 } = options;
  const at = (day: number, time: string) => scenarioInstant(day1, day, time);
  const setupAt = at(1, '06:30');
  const lastDay = scenarioDay(day1, options.today);
  const startKg = options.startKg ?? 100;
  const dietMode = options.dietMode ?? 'keto';
  let nextId = 20_000;
  const id = (): Id => fixtureId(nextId++);

  const weights: WeightRecord[] = [];
  for (let day = 1; day <= lastDay; day++) {
    if (options.days !== undefined && !options.days(day)) continue;
    weights.push({
      id: id(),
      at: at(day, '07:00'),
      timeZone: SCENARIO_ZONE,
      kg: scenarioKg(startKg, options.ratesKgPerWeek, day),
      source: weights.length === 0 ? 'onboarding' : 'manual',
      note: null,
    });
  }

  const periods: KickstartPeriodRecord[] = [];
  const checks: KickstartCheckRecord[] = [];
  const check = (periodId: Id, day: number, stopSign: boolean): KickstartCheckRecord => ({
    id: id(),
    periodId,
    askedAt: at(day, '08:00'),
    timeZone: SCENARIO_ZONE,
    dizzyOnStanding: 'no',
    palpitations: stopSign ? 'yes' : 'no',
    crampsNotSettling: 'no',
    faintAtWork: 'no',
    energyRating: null,
    sleepRating: null,
    outcome: stopSign ? 'stop-sign' : 'extended',
  });
  // Only what has happened by `today`: a later start, check or end is not in the records yet.
  for (const p of options.periods ?? []) {
    if (p.startDay > lastDay) continue;
    const periodId = id();
    const ended = p.endOnDay !== undefined && p.endOnDay <= lastDay;
    periods.push({
      id: periodId,
      startedAt: at(p.startDay, '07:30'),
      timeZone: SCENARIO_ZONE,
      endedAt: ended ? at(p.endOnDay, '12:00') : null,
      endedTimeZone: ended ? SCENARIO_ZONE : null,
      endReason: ended ? (p.endReason ?? 'user-ended') : null,
    });
    for (let e = 0; e < (p.extensions ?? 0); e++) {
      const day = p.startDay + 18 + 7 * e;
      if (day <= lastDay) checks.push(check(periodId, day, false));
    }
    if (p.stopSignOnDay !== undefined && p.stopSignOnDay <= lastDay) {
      checks.push(check(periodId, p.stopSignOnDay, true));
    }
  }
  const latestStart = periods.at(-1)?.startedAt ?? null;

  const answers: Partial<Record<ReadinessId, YesNo | null>> = {
    ...Object.fromEntries(READINESS_QUESTION_IDS.map((q) => [q, 'no'])),
    ...options.readiness,
  };
  const readiness: ReadinessRecord[] = Object.entries(answers)
    .filter((entry): entry is [ReadinessId, YesNo] => entry[1] !== null)
    .map(([questionId, answer]) => ({
      questionId,
      answer,
      wordingVersion: READINESS_WORDING[questionId],
      answeredAt: setupAt,
    }));

  const goalKg = options.goalKg === undefined ? 78 : options.goalKg;
  const profile: ProfileRecord = {
    ...defaultProfile(setupAt),
    heightCm: options.heightCm === undefined ? 180 : options.heightCm,
    sex: 'female',
    birthYear: 1970,
    dietMode,
    firstLowCarbAt: dietMode === 'balanced' ? null : setupAt,
    carbCeilingStartedAt: latestStart ?? (dietMode === 'keto' ? setupAt : null),
    kickstartOptIn: true,
    goalKg,
    goalSetAt: goalKg === null ? null : setupAt,
    goalReferenceKg: goalKg === null ? null : startKg,
    ...options.profile,
  };
  const targets: TargetsRecord = {
    ...defaultTargets(setupAt),
    ...(periods.length > 0
      ? {
          fastingPreset: '23:1',
          eatingWindow: { start: '18:00', end: '19:00' },
          presetChosenBy: 'kickstart-default',
        }
      : {
          fastingPreset: '22:2',
          eatingWindow: { start: '17:00', end: '19:00' },
          presetChosenBy: 'default',
        }),
    ...options.targets,
  };
  const settings: SettingsRecord = {
    ...defaultSettings(),
    onboardingCompletedAt: setupAt,
    alcoholNoticeAckAt: setupAt,
    profileConfirmedAt: setupAt,
    scheduleConfirmedAt: setupAt,
    gardenConfirmedAt: setupAt,
    homeTimeZone: SCENARIO_ZONE,
    ...options.settings,
  };

  const empty = Object.fromEntries(BACKUP_TABLES.map((name) => [name, []])) as unknown as Snapshot;
  return {
    ...empty,
    profile: [profile],
    readiness,
    targets: [targets],
    settings: [settings],
    kickstart_periods: periods,
    kickstart_checks: checks,
    weights,
    card_state: options.cardStates ?? [],
  };
}

/** The same scenario as a WeightOverviewInput for core tests. Gates default to all open. */
export function weightScenarioInput(
  options: WeightScenarioOptions & {
    readonly now: Instant;
    readonly gates?: ReadinessGates;
    readonly missingReadinessAnswers?: WeightOverviewInput['missingReadinessAnswers'];
    readonly preStartStopSignToday?: boolean;
    readonly endsPending?: WeightOverviewInput['endsPending'];
  },
): WeightOverviewInput {
  const snapshot = weightScenario(options);
  const [profile] = snapshot.profile;
  const [targets] = snapshot.targets;
  const [settings] = snapshot.settings;
  if (profile === undefined || targets === undefined || settings === undefined) {
    throw new Error('A scenario always has its singletons');
  }
  return {
    now: options.now,
    deviceTimeZone: SCENARIO_ZONE,
    homeTimeZone: settings.homeTimeZone,
    weights: snapshot.weights,
    profile,
    targets,
    settings,
    gates: options.gates ?? gatesWith(),
    missingReadinessAnswers: options.missingReadinessAnswers ?? [],
    periods: snapshot.kickstart_periods,
    checks: snapshot.kickstart_checks,
    cardStates: snapshot.card_state,
    preStartStopSignToday: options.preStartStopSignToday ?? false,
    endsPending: options.endsPending ?? new Map(),
  };
}

/** A scenario seen on its day `day` at `time` local: `today` and `now` set together. */
export function onDay<T extends WeightScenarioOptions>(
  options: T,
  day: number,
  time = '09:00',
): T & { readonly today: LocalDate; readonly now: Instant } {
  return {
    ...options,
    today: addDays(options.day1, day - 1),
    now: scenarioInstant(options.day1, day, time),
  };
}

/** Scenario day 1 of every named scenario. */
export const SCENARIO_DAY1 = '2000-02-01';

const K42_RATES = [2.5, 2.5, 2.5, 1.2, 1.2, 1.2] as const;

/** The named scenarios of the item 14 design (section 6.1), as options to pass on with a `today`. */
export const WEIGHT_SCENARIOS = {
  /** Kickstart day 10: latest 96.8 kg, 7-day average 97.9 kg, week 2 of 3. */
  K10: {
    day1: SCENARIO_DAY1,
    today: '2000-02-10',
    ratesKgPerWeek: [2.5, 2.5, 2.5],
    periods: [{ startDay: 1 }],
  },
  /** One Kickstart, then 1.2 kg a week in Steady weeks 4 to 6; today day 42. */
  K42: {
    day1: SCENARIO_DAY1,
    today: '2000-03-13',
    ratesKgPerWeek: K42_RATES,
    periods: [{ startDay: 1 }],
  },
  /** As K42 with weeks 4 to 6 at 0.8 kg a week. */
  'K42-08': {
    day1: SCENARIO_DAY1,
    today: '2000-03-13',
    ratesKgPerWeek: [2.5, 2.5, 2.5, 0.8],
    periods: [{ startDay: 1 }],
  },
  /** As K42 with weeks 4 to 6 at 1.05 kg a week. */
  'K42-105': {
    day1: SCENARIO_DAY1,
    today: '2000-03-13',
    ratesKgPerWeek: [2.5, 2.5, 2.5, 1.05],
    periods: [{ startDay: 1 }],
  },
  /** As K42 with weeks 4 to 6 at exactly 1.0 kg a week. */
  'K42-10': {
    day1: SCENARIO_DAY1,
    today: '2000-03-13',
    ratesKgPerWeek: [2.5, 2.5, 2.5, 1.0],
    periods: [{ startDay: 1 }],
  },
  /** One Kickstart with three extensions (checks on days 19, 26 and 33); today day 42. */
  X3: {
    day1: SCENARIO_DAY1,
    today: '2000-03-13',
    ratesKgPerWeek: K42_RATES,
    periods: [{ startDay: 1, extensions: 3 }],
  },
  /** A second Kickstart on day 43 after the first used 21 days; today day 63 (P2 day 21). */
  R2: {
    day1: SCENARIO_DAY1,
    today: '2000-04-03',
    ratesKgPerWeek: [2.5, 2.5, 2.5, 0.6, 0.6, 0.6, 2.0],
    periods: [{ startDay: 1 }, { startDay: 43 }],
  },
  /** R2's weigh-ins with only the day-43 Kickstart (the control). */
  'R2-alone': {
    day1: SCENARIO_DAY1,
    today: '2000-04-03',
    ratesKgPerWeek: [2.5, 2.5, 2.5, 0.6, 0.6, 0.6, 2.0],
    periods: [{ startDay: 43 }],
  },
  /** A Kickstart ended on its day 10 (left keto), a second from day 15; today day 35. */
  E10: {
    day1: SCENARIO_DAY1,
    today: '2000-03-06',
    ratesKgPerWeek: [2.5, 2.5, 2.5, 2.0],
    periods: [{ startDay: 1, endOnDay: 10, endReason: 'left-keto' }, { startDay: 15 }],
  },
  /** NN-03: 180 cm, 100.0 kg, a 78.0 kg long-term goal; today day 10 (day 1 also used). */
  NN03: {
    day1: SCENARIO_DAY1,
    today: '2000-02-10',
    ratesKgPerWeek: [2.5, 2.5, 2.5],
    periods: [{ startDay: 1 }],
  },
  /** Chose Kickstart at setup, none started: the untouched 23:1 default and one weigh-in. */
  PENDING: {
    day1: SCENARIO_DAY1,
    today: SCENARIO_DAY1,
    ratesKgPerWeek: [0],
    days: (day: number) => day === 1,
    targets: {
      fastingPreset: '23:1',
      eatingWindow: { start: '18:00', end: '19:00' },
      presetChosenBy: 'kickstart-default',
    },
  },
} as const satisfies Record<string, WeightScenarioOptions>;
