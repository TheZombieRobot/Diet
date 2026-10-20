/**
 * The day's targets: one entry point for every figure (item 21 design section 3.9). The Today
 * card, the Diet and targets screen, the single-meal check (item 15), the planner (item 22) and the
 * food log (item 23) all read dayTargets; none does its own target arithmetic (scan targetsHome).
 *
 * HS-22 by construction: the targets input is a Pick that leaves out the fasting preset, the eating
 * window, who chose it and the reflux choices, and nothing here reads a plan day's window.
 *
 * `figures` is which set of figures applies today, NOT the weight phase: a Kickstart can be running
 * (no rapid-loss card, Kickstart notes on the Weight card) while the figures are Steady (paused or
 * suspended). Phase notes, the rapid-loss rule and the projection band use item 14's phase engine,
 * never this (HS-11).
 */
import { type GateInput, readinessGates } from '../readiness/gates';
import type { Id, Instant, TimeZone } from '../storage/primitives';
import type { ReadinessGates } from '../storage/readiness';
import type {
  DietMode,
  KickstartCheckRecord,
  KickstartEndReason,
  KickstartPeriodRecord,
  ProfileRecord,
  ReadinessRecord,
  SettingsRecord,
  TargetsRecord,
  WeightRecord,
} from '../storage/records';
import type { LocalDate } from '../util/time';
import { weightGateInput } from '../weight/gateInput';
import { runningKickstartPeriod, stopSignPauseUntil } from '../weight/phase';
import { weighInsFromRecords } from '../weight/weighIns';
import { effectiveNetCarbCeiling, type NetCarbCeiling } from './carbs';
import { type TargetDisplay, targetDisplay } from './display';
import {
  type DayEnergy,
  dayEnergyFor,
  type DeficitChoice,
  effectiveDeficit,
  energyEstimateFor,
  type EnergyEstimateResult,
  noEstimateEnergy,
  type WeightBasis,
  weightForEstimate,
} from './energy';
import { fibreGuide, type SatFatBudget, saturatedFatBudget, waterGuide } from './guides';
import { ketoUnbrokenSince } from './ketoRun';
import { proteinTargets, type ProteinTargets, type TargetFigures } from './protein';

export { ketoUnbrokenSince } from './ketoRun';

/** The gates the engine reads: a subset of item 13's ReadinessGates. */
export type TargetGates = Pick<
  ReadinessGates,
  | 'deficitAllowed'
  | 'kickstartAvailable'
  | 'ketoCeilingAvailable'
  | 'carbCeilingBelow50Allowed'
  | 'energyEstimateAvailable'
  | 'alcoholLoggingAvailable'
>;

/** A Kickstart running by time now (item 14's runningKickstartPeriod), whatever the mode and gates. */
export type KickstartState =
  | {
      readonly running: false;
      /**
       * A stop-sign answer's pause still holds for a Kickstart that was ended early (item 14's
       * stopSignPauseUntil): no deficit through this day, its scheduled last day. Absent otherwise.
       */
      readonly stopSignPauseUntil?: LocalDate;
    }
  | {
      readonly running: true;
      readonly periodId: Id;
      readonly startedAt: Instant;
      /** A stop-sign check was recorded in this period (T27). */
      readonly stopSignReported: boolean;
    };

/** Why a running Kickstart's figures are not in use, first match (T7, T27). */
export type KickstartSuspension =
  'readiness' | 'diet-mode' | 'mode-changed' | 'stop-sign' | 'no-estimate';

export interface DayTargetsInput {
  readonly today: LocalDate;
  readonly gates: TargetGates;
  readonly kickstart: KickstartState;
  readonly dietMode: DietMode;
  readonly profile: Pick<
    ProfileRecord,
    'sex' | 'heightCm' | 'birthYear' | 'activityLevel' | 'carbCeilingStartedAt'
  >;
  readonly targets: Pick<
    TargetsRecord,
    | 'proteinRangeG'
    | 'netCarbCeilingG'
    | 'moderateNetCarbCeilingG'
    | 'saturatedFatBudgetPct'
    | 'kickstartDeficitPct'
    | 'steadyDeficitPct'
    | 'energyFloorKj'
    | 'fibreGuideG'
    | 'waterTargetMl'
  >;
  readonly weight: WeightBasis | null;
}

export interface DayTargets {
  /** Which set of figures applies today. NOT the weight phase (see the module comment). */
  readonly figures: TargetFigures;
  /** Why a running Kickstart's figures are not in use; null when none runs or they apply. */
  readonly kickstartSuspended: KickstartSuspension | null;
  readonly estimate: EnergyEstimateResult;
  readonly deficit: DeficitChoice;
  readonly energy: DayEnergy;
  readonly protein: ProteinTargets;
  readonly netCarbs: NetCarbCeiling;
  readonly saturatedFat: SatFatBudget;
  readonly fibre: { readonly grams: number; readonly source: 'owner' | 'nrv' };
  readonly water: { readonly ml: number; readonly source: 'owner' | 'nrv' };
}

/** Every gate a Kickstart needs is open (the same four as item 14's phase engine). */
const kickstartGatesOpen = (gates: TargetGates): boolean =>
  gates.kickstartAvailable &&
  gates.deficitAllowed &&
  gates.ketoCeilingAvailable &&
  gates.carbCeilingBelow50Allowed;

/**
 * Every figure for the day. Kickstart figures (the Kickstart deficit, 20 g of net carbs and protein
 * at the range top) apply only while a period runs, the mode is keto and has stayed keto since the
 * period began, no stop-sign was reported in it, a rough guide exists and every Kickstart gate is
 * open (T7); otherwise Steady figures apply at once, with the reason.
 */
export function dayTargets(input: DayTargetsInput): DayTargets {
  const { gates, kickstart, dietMode, profile, targets } = input;
  const estimate = energyEstimateFor({
    energyEstimateAvailable: gates.energyEstimateAvailable,
    heightCm: profile.heightCm,
    birthYear: profile.birthYear,
    sex: profile.sex,
    activity: profile.activityLevel,
    weight: input.weight,
    today: input.today,
  });
  const kickstartSuspended: KickstartSuspension | null = !kickstart.running
    ? null
    : !kickstartGatesOpen(gates)
      ? 'readiness'
      : dietMode !== 'keto'
        ? 'diet-mode'
        : !ketoUnbrokenSince(profile.carbCeilingStartedAt, kickstart.startedAt)
          ? 'mode-changed'
          : kickstart.stopSignReported
            ? 'stop-sign'
            : !estimate.available
              ? 'no-estimate'
              : null;
  const figures: TargetFigures =
    kickstart.running && kickstartSuspended === null ? 'kickstart' : 'steady';
  // Ending a paused Kickstart early never brings a deficit back before its scheduled last day.
  const pausedAfterEnd = !kickstart.running && kickstart.stopSignPauseUntil !== undefined;
  const deficit = effectiveDeficit({
    figures,
    dietMode,
    gates,
    stopSignPause: kickstartSuspended === 'stop-sign' || pausedAfterEnd,
    kickstartDeficitPct: targets.kickstartDeficitPct,
    steadyDeficitPct: targets.steadyDeficitPct,
  });
  const energy = estimate.available
    ? dayEnergyFor(estimate.kj, deficit, targets.energyFloorKj)
    : noEstimateEnergy(estimate.reason, targets.energyFloorKj);
  return {
    figures,
    kickstartSuspended,
    estimate,
    deficit,
    energy,
    protein: proteinTargets(figures, targets.proteinRangeG),
    netCarbs: effectiveNetCarbCeiling({
      dietMode,
      figures,
      ketoCeilingAvailable: gates.ketoCeilingAvailable,
      carbCeilingBelow50Allowed: gates.carbCeilingBelow50Allowed,
      netCarbCeilingG: targets.netCarbCeilingG,
      moderateNetCarbCeilingG: targets.moderateNetCarbCeilingG,
    }),
    saturatedFat: saturatedFatBudget(energy, targets.saturatedFatBudgetPct),
    fibre: fibreGuide(profile.sex, targets.fibreGuideG),
    water: waterGuide(profile.sex, targets.waterTargetMl),
  };
}

/**
 * The Kickstart now: item 14's one "running now" rule (the latest period, not ended early, day 1
 * arrived and its scheduled phase not over in the device zone nor its own start zone). A period
 * whose end is latched by the app (due but not yet written) reads as not running, as the phase
 * engine reads it (W13), so a failed end never lets Kickstart figures return. One that is not
 * running carries a stop-sign pause that still holds after an early end (stopSignPauseUntil).
 */
export function kickstartStateFrom(
  periods: readonly KickstartPeriodRecord[],
  checks: readonly KickstartCheckRecord[],
  at: Instant,
  today: LocalDate,
  deviceZone: TimeZone,
  homeTimeZone: TimeZone,
  endsPending?: ReadonlyMap<Id, KickstartEndReason>,
): KickstartState {
  const period = runningKickstartPeriod(periods, checks, at, deviceZone, homeTimeZone);
  if (period === null || endsPending?.has(period.id) === true) {
    const until = stopSignPauseUntil(periods, checks, today, homeTimeZone);
    return until === null ? { running: false } : { running: false, stopSignPauseUntil: until };
  }
  return {
    running: true,
    periodId: period.id,
    startedAt: period.startedAt,
    stopSignReported: checks.some((c) => c.periodId === period.id && c.outcome === 'stop-sign'),
  };
}

/** The stored records the engine reads (the same shape as item 14's weight inputs). */
export interface DayTargetRecords {
  readonly profile: ProfileRecord;
  readonly targets: TargetsRecord;
  readonly settings: SettingsRecord;
  readonly readiness: readonly ReadinessRecord[];
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  /** Every weigh-in (at least the last 7 local days and the latest on or before today). */
  readonly weights: readonly WeightRecord[];
}

/** One clock for every figure on screen: `today` is the day the live queries read (T30). */
export interface TargetsClock {
  readonly at: Instant;
  readonly today: LocalDate;
  readonly deviceZone: TimeZone;
  /** The app's end latch (item 14): ends due but not yet written. */
  readonly endsPending?: ReadonlyMap<Id, KickstartEndReason>;
}

export interface DayTargetsView {
  readonly today: LocalDate;
  readonly gateInput: GateInput;
  readonly gates: ReadinessGates;
  readonly display: TargetDisplay;
  readonly kickstart: KickstartState;
  readonly targets: DayTargets;
}

/**
 * The day's targets from stored records. The gates come from item 13's gate function fed item
 * 14's current weight (weightGateInput), so they agree with every gated screen; each weigh-in is
 * read in its resolved zone, so an unknown stored zone never throws (D6).
 */
export function dayTargetsFromRecords(
  records: DayTargetRecords,
  clock: TargetsClock,
): DayTargetsView {
  const home = records.settings.homeTimeZone;
  const { today } = clock;
  const gateInput = weightGateInput(
    {
      readiness: records.readiness,
      profile: records.profile,
      weights: records.weights,
      homeTimeZone: home,
    },
    today,
  );
  const gates = readinessGates(gateInput);
  const kickstart = kickstartStateFrom(
    records.periods,
    records.checks,
    clock.at,
    today,
    clock.deviceZone,
    home,
    clock.endsPending,
  );
  const { weighIns } = weighInsFromRecords(records.weights, home);
  return {
    today,
    gateInput,
    gates,
    display: targetDisplay(gateInput, gates),
    kickstart,
    targets: dayTargets({
      today,
      gates,
      kickstart,
      dietMode: records.profile.dietMode,
      profile: records.profile,
      targets: records.targets,
      weight: weightForEstimate(weighIns, today),
    }),
  };
}
