/**
 * The whole weight picture in one pure function (item 14 design section 3.6): averages, weekly
 * change, phase, notes, the four-week chart and its band, the goal and milestone, which weight
 * cards show, whether a Kickstart may start, and which corrective writes are due. Screens only
 * render it and call repositories; the reconciler and the actions decide from the same function.
 *
 * Weigh-ins, the averages, the line and the rapid-loss, stop-sign and fluctuation cards show in
 * every readiness state (W11); readiness and a low weight only take away the phase notes, the
 * band, the goal and the Kickstart offers (RD-04, RD-06, W32).
 */
import { cardHidden, type CardId, cardTrigger } from '../storage/cards';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import { type KickstartUsage, kickstartUsage } from '../storage/kickstart';
import type { Id, Instant, TimeZone } from '../storage/primitives';
import type { ReadinessGates, ReadinessQuestionId } from '../storage/readiness';
import type {
  CardStateRecord,
  KickstartCheckRecord,
  KickstartEndReason,
  KickstartPeriodRecord,
  ProfileRecord,
  SettingsRecord,
  TargetsRecord,
  WeightRecord,
} from '../storage/records';
import { safeKetoCeilingG } from '../targets/sanitize';
import { addDays, daysBetween, type LocalDate, localDateOf } from '../util/time';
import {
  bandAnchor,
  bandEdgesAt,
  carbCeilingActive,
  CHART_BLOCK_DAYS,
  chartBlock,
  phaseSegments,
} from './band';
import { type GoalView, goalView } from './goal';
import {
  type ExtensionOffer,
  extensionOfferDue,
  kickstartEndNeeded,
  kickstartNotStarted,
  kickstartPending,
  kickstartStartAvailability,
  latestKickstartPeriod,
  type Phase,
  type PhaseInput,
  phaseOn,
  rapidLossExemptDates,
  type StartAvailability,
  type StopSignsDue,
  stopSignsDue,
} from './phase';
import {
  type EffectivePreset,
  effectiveFastingPreset,
  kickstartStartUses231,
  type PresetChange,
  presetMoveDue,
} from './presets';
import { rapidLineInOffer, rapidLossSettingsInUse, rapidLossStatus } from './rapidLoss';
import { dailyWeightsKg, rollingAverageFromDaily } from './trend';
import {
  belowBmiFloorNow,
  type LatestWeighIn,
  latestWeighIn,
  milestoneReferenceKg,
  type WeeklyChange,
  weeklyChange,
  weighInsFromRecords,
} from './weighIns';

export interface WeightOverviewInput {
  readonly now: Instant;
  readonly deviceTimeZone: TimeZone;
  readonly homeTimeZone: TimeZone;
  readonly weights: readonly WeightRecord[];
  readonly profile: Pick<
    ProfileRecord,
    | 'heightCm'
    | 'goalKg'
    | 'dietMode'
    | 'kickstartOptIn'
    | 'firstLowCarbAt'
    | 'carbCeilingStartedAt'
  >;
  readonly targets: Pick<
    TargetsRecord,
    'fastingPreset' | 'eatingWindow' | 'presetChosenBy' | 'netCarbCeilingG'
  >;
  readonly settings: Pick<
    SettingsRecord,
    | 'rapidLossThresholdGPerWeek'
    | 'rapidLossConsecutiveWeeks'
    | 'drinkingDayCutoverMinutes'
    | 'onboardingCompletedAt'
  >;
  readonly gates: ReadinessGates;
  readonly missingReadinessAnswers: readonly ReadinessQuestionId[];
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  readonly cardStates: readonly CardStateRecord[];
  /** A pre-start "yes" today (the app holds it for the local day). */
  readonly preStartStopSignToday: boolean;
  /** The app's end latch: ends that were due but are not yet written. */
  readonly endsPending: ReadonlyMap<Id, KickstartEndReason>;
}

export type WeightNote =
  | 'kickstart'
  | 'kickstart-extended'
  | 'kickstart-later'
  | 'kickstart-not-started'
  | 'steady-pace'
  | 'steady-rebound'
  | 'gated'
  | 'gated-unanswered'
  | 'low-weight';

export interface ChartPoint {
  readonly index: number;
  readonly kg: number;
}

export interface BandPoint {
  readonly index: number;
  readonly slowKg: number;
  readonly fastKg: number;
}

export interface FourWeekChart {
  readonly blockStart: LocalDate | null;
  /** The weeks of the current phase segment shown, e.g. [5, 6, 7, 8]. */
  readonly weekLabels: readonly number[];
  readonly todayIndex: number | null;
  /** Daily mean weigh-ins in the block, up to today. */
  readonly points: readonly ChartPoint[];
  /** 7-day averages, where there are enough weigh-ins. */
  readonly line: readonly ChartPoint[];
  readonly band: readonly BandPoint[] | null;
  readonly bandHiddenBecause: 'gated' | 'no-carb-ceiling' | 'low-weight' | 'no-anchor' | null;
}

export interface WeightOverview {
  readonly today: LocalDate;
  /** A record's zone is unknown to this browser, so it is shown in the home zone. */
  readonly zoneFallback: boolean;
  readonly latest: LatestWeighIn | null;
  readonly average7Kg: number | null;
  readonly average14Kg: number | null;
  readonly weeklyChange: WeeklyChange | null;
  readonly lowWeight: boolean;
  readonly phase: Phase;
  readonly notes: readonly WeightNote[];
  readonly chart: FourWeekChart;
  readonly goal: GoalView;
  readonly cards: {
    readonly rapidLoss: { readonly thresholdKgPerWeek: number; readonly weeks: 2 | 3 } | null;
    readonly stopSigns: (StopSignsDue & { readonly bloodPressureWording: boolean }) | null;
    readonly extensionOffer: (ExtensionOffer & { readonly rapidLine: boolean }) | null;
    readonly pendingStart: { readonly windowLines: boolean } | null;
    readonly steadyExplainer: {
      readonly periodId: Id;
      readonly trigger: string;
      readonly carbCeilingG: number | null;
      readonly windowLine: boolean;
    } | null;
    readonly fluctuation: boolean;
  };
  readonly kickstart: {
    readonly usage: KickstartUsage;
    readonly start: StartAvailability;
    /** A start leaves the eating window at 23:1, so the offer says so. */
    readonly startWindowLine: boolean;
    readonly endNeeded: KickstartEndReason | null;
    /**
     * The latest period's first day has not arrived (a start dated ahead): it is not running yet,
     * and the Phase card says so with End Kickstart. Null otherwise.
     */
    readonly notStarted: { readonly periodId: Id; readonly day1: LocalDate } | null;
    /** Non-null when the stored untouched 23:1 Kickstart default should move to 22:2. */
    readonly presetMoveDue: PresetChange | null;
    readonly effectivePreset: EffectivePreset;
  };
}

/** Days after a Kickstart's last day on which the rebound sentence still shows (W18). */
const REBOUND_NOTE_DAYS = 28;

/** The device's local date (device zone, then home, then Auckland, then UTC). */
function todayOf(
  input: Pick<WeightOverviewInput, 'now' | 'deviceTimeZone' | 'homeTimeZone'>,
): LocalDate {
  const zone = resolveZone(input.deviceTimeZone, input.homeTimeZone, DEFAULT_HOME_TIME_ZONE);
  return localDateOf(input.now, zone.timeZone);
}

/** The part of the overview's input the phase engine reads (items 15, 16 and 22 pass just this). */
export type PhaseSource = Pick<
  WeightOverviewInput,
  'now' | 'deviceTimeZone' | 'homeTimeZone' | 'gates' | 'periods' | 'checks' | 'endsPending'
> & {
  readonly profile: Pick<WeightOverviewInput['profile'], 'dietMode' | 'carbCeilingStartedAt'>;
};

/** The phase engine's input from the overview's (items 15, 16 and 22 build theirs the same way). */
export function phaseInputFrom(input: PhaseSource, today = todayOf(input)): PhaseInput {
  return {
    now: input.now,
    today,
    deviceTimeZone: input.deviceTimeZone,
    homeTimeZone: input.homeTimeZone,
    dietMode: input.profile.dietMode,
    carbCeilingStartedAt: input.profile.carbCeilingStartedAt,
    gates: input.gates,
    periods: input.periods,
    checks: input.checks,
    endsPending: input.endsPending,
  };
}

function notesFor(
  phase: Phase,
  lowWeight: boolean,
  missing: readonly ReadinessQuestionId[],
  today: LocalDate,
  notStarted: boolean,
): WeightNote[] {
  // A low weight closes the deficit too (item 13 HS-35); its own line names the reason.
  if (lowWeight) return ['low-weight'];
  if (phase.kind === 'none') return [missing.length > 0 ? 'gated-unanswered' : 'gated'];
  if (phase.kind === 'kickstart') {
    if (phase.dayKind === 'exempt') return ['kickstart'];
    return [phase.dayKind === 'extension' ? 'kickstart-extended' : 'kickstart-later'];
  }
  const end = phase.lastKickstartEnd;
  const rebound = end !== null && daysBetween(end, today) < REBOUND_NOTE_DAYS;
  const steady: WeightNote[] = rebound ? ['steady-pace', 'steady-rebound'] : ['steady-pace'];
  return notStarted ? ['kickstart-not-started', ...steady] : steady;
}

/** Daily points and 7-day averages for `days` dates starting at `from`, up to today. */
function pointsAndLine(
  daily: ReadonlyMap<LocalDate, number>,
  from: LocalDate,
  days: number,
  today: LocalDate,
): { readonly points: ChartPoint[]; readonly line: ChartPoint[] } {
  const points: ChartPoint[] = [];
  const line: ChartPoint[] = [];
  for (let index = 0; index < days; index++) {
    const date = addDays(from, index);
    if (date > today) break;
    const kg = daily.get(date);
    if (kg !== undefined) points.push({ index, kg });
    const average = rollingAverageFromDaily(daily, date, 7);
    if (average !== null) line.push({ index, kg: average });
  }
  return { points, line };
}

function fourWeekChart(
  input: WeightOverviewInput,
  daily: ReadonlyMap<LocalDate, number>,
  today: LocalDate,
  phase: Phase,
  lowWeight: boolean,
): FourWeekChart {
  const pastDates = [...daily.keys()].filter((d) => d <= today).sort();
  const segments = phaseSegments(
    input.periods,
    input.checks,
    pastDates[0] ?? null,
    input.profile.firstLowCarbAt,
    input.homeTimeZone,
  );
  const block = chartBlock(segments, today);
  if (block === null) {
    return {
      blockStart: null,
      weekLabels: [1, 2, 3, 4],
      todayIndex: null,
      points: [],
      line: [],
      band: null,
      bandHiddenBecause: 'no-anchor',
    };
  }
  const b = block.blockNumber;
  const { points, line } = pointsAndLine(daily, block.blockStart, CHART_BLOCK_DAYS, today);
  const hidden = (because: FourWeekChart['bandHiddenBecause']): FourWeekChart => ({
    blockStart: block.blockStart,
    weekLabels: [4 * b + 1, 4 * b + 2, 4 * b + 3, 4 * b + 4],
    todayIndex: daysBetween(block.blockStart, today),
    points,
    line,
    band: null,
    bandHiddenBecause: because,
  });
  if (phase.kind === 'none' || !input.gates.projectionBandAvailable) return hidden('gated');
  if (!carbCeilingActive(input.profile.dietMode, input.gates)) return hidden('no-carb-ceiling');
  if (lowWeight) return hidden('low-weight');
  const anchor = bandAnchor(daily, block.blockStart);
  if (anchor === null) return hidden('no-anchor');
  const fastKgPerWeek = rapidLossSettingsInUse(input.settings).thresholdGPerWeek / 1000;
  const band: BandPoint[] = [];
  for (let index = anchor.index; index < CHART_BLOCK_DAYS; index++) {
    const edges = bandEdgesAt(anchor.kg, block.shape, index - anchor.index, fastKgPerWeek);
    band.push({ index, slowKg: edges.slowKg, fastKg: edges.fastKg });
  }
  return { ...hidden(null), band };
}

export function weightOverview(input: WeightOverviewInput): WeightOverview {
  const today = todayOf(input);
  const { weighIns, zoneFallback } = weighInsFromRecords(input.weights, input.homeTimeZone);
  const daily = dailyWeightsKg(weighIns);
  const { gates, profile, settings, targets } = input;
  const lowWeight = belowBmiFloorNow(daily, today, profile.heightCm);
  const phaseInput = phaseInputFrom(input, today);
  const phase = phaseOn(phaseInput);
  const notStarted = phase.kind === 'steady' ? kickstartNotStarted(phaseInput) : null;
  const onboardingCompleted = settings.onboardingCompletedAt !== null;

  const hidden = (cardId: CardId, trigger: string): boolean => {
    const rule = cardTrigger(cardId, trigger);
    if (rule === null) return false;
    const row = input.cardStates.find((c) => c.cardId === cardId && c.trigger === trigger);
    return cardHidden({
      now: input.now,
      row,
      dismissal: rule.dismissal,
      drinkingDayCutoverMinutes: settings.drinkingDayCutoverMinutes,
    });
  };

  const rapidSettings = rapidLossSettingsInUse(settings);
  const rapid = rapidLossStatus({
    daily,
    today,
    exempt: rapidLossExemptDates(input.periods, input.checks, today, input.homeTimeZone),
    settings: rapidSettings,
  });

  const stopSignsBase = stopSignsDue(phase, phaseInput);
  const stopSigns =
    stopSignsBase !== null &&
    (stopSignsBase.forced || !hidden('kickstart-stop-signs', stopSignsBase.trigger))
      ? { ...stopSignsBase, bloodPressureWording: gates.bloodPressureSaltWording }
      : null;

  const offer = extensionOfferDue(phase, phaseInput, lowWeight);
  const extensionOffer =
    offer !== null && !hidden('kickstart-extension', offer.trigger)
      ? { ...offer, rapidLine: rapidLineInOffer(daily, today, rapidSettings) }
      : null;

  const start = kickstartStartAvailability(phaseInput, {
    lowWeight,
    preStartStopSignToday: input.preStartStopSignToday,
  });
  const startWindowLine = kickstartStartUses231(targets, gates);
  const pendingStart = kickstartPending({
    kickstartOptIn: profile.kickstartOptIn,
    onboardingCompleted,
    periods: input.periods,
    start,
  })
    ? { windowLines: startWindowLine }
    : null;

  const effectivePreset = effectiveFastingPreset(targets, phase.kind === 'kickstart', gates);
  const latestPeriod = latestKickstartPeriod(input.periods);
  // "Kickstart has finished" only once the latest period has run: never before its first day.
  const steadyExplainer =
    phase.kind === 'steady' &&
    latestPeriod !== null &&
    notStarted === null &&
    !hidden('steady-explainer', `period:${latestPeriod.id}`)
      ? {
          periodId: latestPeriod.id,
          trigger: `period:${latestPeriod.id}`,
          carbCeilingG:
            profile.dietMode === 'keto' &&
            gates.ketoCeilingAvailable &&
            gates.carbCeilingBelow50Allowed
              ? safeKetoCeilingG(targets.netCarbCeilingG)
              : null,
          windowLine:
            effectivePreset.fastingPreset === '22:2' &&
            effectivePreset.presetChosenBy === 'default' &&
            !gates.fastingGated,
        }
      : null;

  const datesWithWeighIns = [...daily.keys()].filter((d) => d <= today).length;

  return {
    today,
    zoneFallback,
    latest: latestWeighIn(input.weights, input.now, input.homeTimeZone),
    average7Kg: rollingAverageFromDaily(daily, today, 7),
    average14Kg: rollingAverageFromDaily(daily, today, 14),
    weeklyChange: weeklyChange(daily, today),
    lowWeight,
    phase,
    notes: notesFor(phase, lowWeight, input.missingReadinessAnswers, today, notStarted !== null),
    chart: fourWeekChart(input, daily, today, phase, lowWeight),
    goal: goalView({
      goalKg: profile.goalKg,
      heightCm: profile.heightCm,
      referenceKg: milestoneReferenceKg(daily, today),
      gates,
    }),
    cards: {
      rapidLoss:
        rapid.show && !hidden('rapid-loss', 'steady')
          ? {
              thresholdKgPerWeek: rapidSettings.thresholdGPerWeek / 1000,
              weeks: rapidSettings.weeks,
            }
          : null,
      stopSigns,
      extensionOffer,
      pendingStart,
      steadyExplainer,
      fluctuation: datesWithWeighIns >= 2 && !hidden('weight-fluctuation-explainer', 'once'),
    },
    kickstart: {
      usage: kickstartUsage(input.periods, input.checks, input.homeTimeZone),
      start,
      startWindowLine,
      endNeeded: onboardingCompleted ? kickstartEndNeeded(phaseInput) : null,
      notStarted,
      presetMoveDue: onboardingCompleted
        ? presetMoveDue({ targets, phase, fastingGated: gates.fastingGated, onboardingCompleted })
        : null,
      effectivePreset,
    },
  };
}

/** The 30- and 90-day views: points and line only, no band, today last. */
export function longChart(
  input: WeightOverviewInput,
  days: 30 | 90,
): {
  readonly points: readonly ChartPoint[];
  readonly line: readonly ChartPoint[];
  readonly todayIndex: number;
} {
  const today = todayOf(input);
  const daily = dailyWeightsKg(weighInsFromRecords(input.weights, input.homeTimeZone).weighIns);
  return {
    ...pointsAndLine(daily, addDays(today, -(days - 1)), days, today),
    todayIndex: days - 1,
  };
}
