/**
 * Where the fasting screens meet other items (item 15 design 1 and 3.10). If a name another item
 * built differs from its design, only this file and the call sites listed in the design change.
 *
 * - The gate and its reasons are item 13's (readinessGates through useReadinessGates, featureGate,
 *   reasonStates); a stated reason of the deficit group makes the gated card quiet (F41).
 * - Kickstart is item 14's: the phase from phaseInputFrom, and the preset every reader uses,
 *   effectiveFastingPreset(targets, isKickstartDay(...), gates) (cross-item ruling 2), which reads
 *   a stored 23:1 Kickstart default as 22:2 while answer 4 applies, even during Kickstart (C07).
 *   While a Kickstart runs, the days after its last day already plan the preset as it reads
 *   outside Kickstart.
 * - After a Kickstart stop-sign answer (item 14's stopSignPauseUntil: through that Kickstart's
 *   scheduled last day, even when it was ended early) or a pre-start "yes" that day, no fast is
 *   timed to the eating window: the Fast card and Today's top line say it is fine to eat now, with
 *   the fasting stop-signs, as the stop-sign card says to eat, add salt and fluids (F20). The
 *   preset itself still follows the phase (DECISIONS row 80, cross-item ruling 2).
 * - The protein and energy the meal check uses are item 21's, through mealTargets.ts: the day's
 *   protein.checkTargetG and energyForMealChecks over dayTargetsFromRecords, the same figures the
 *   Nutrition today card shows. Not the phase alone: a stop-sign pause or a missing rough guide
 *   reads Steady in the figures while the phase still says Kickstart, and with no rough guide the
 *   energy figure is null, which the check reads as not met (cross-item ruling 3).
 * - The meal figures come from later items: the planned meals from item 22 (plannedMealsOf, then
 *   plannedMealFigures) and the logged food from item 23 (loggedIntakeOn). Until those exist, each
 *   source honestly has nothing, so the meal check shows no figures (F28) and a one-meal window
 *   still offers the 5 pm snack.
 */
import {
  effectiveFastingPreset,
  featureGateOf,
  type GateInput,
  type Id,
  type Instant,
  isDeficitGroupReason,
  isKickstartDay,
  type KickstartEndReason,
  type LocalDate,
  type LoggedIntake,
  phaseInputFrom,
  phaseOn,
  type PlannedMealFigures,
  type ReadinessGates,
  reasonStates,
  stopSignPauseUntil,
  type TimeZone,
} from '@diet/core';
import { preStartStopSignToday } from '../weight/preStartCheck';
import type { FastingInputs } from './inputs';
import { mealTargetsFrom } from './mealTargets';
import type { FastingContext } from './view';

export interface MealSources {
  /** Item 22: the date's planned meals, or null when the date has no plan. */
  plannedMeals(date: LocalDate): readonly PlannedMealFigures[] | null;
  /** Item 23: what the food log holds for the date, or null with no food log. */
  loggedIntake(date: LocalDate): LoggedIntake | null;
}

export const mealSources: MealSources = {
  plannedMeals: () => null,
  loggedIntake: () => null,
};

/** The decisions of items 13, 14 and 21 to 23 for the fasting view, from one consistent read. */
export function fastingContext(args: {
  readonly inputs: Pick<
    FastingInputs,
    'targets' | 'settings' | 'profile' | 'periods' | 'checks' | 'readiness' | 'weights'
  > &
    Partial<Pick<FastingInputs, 'preStartCards'>>;
  /** Item 13's live gate input and gates (useReadinessGates), or the same built from records. */
  readonly gateInput: GateInput;
  readonly gates: ReadinessGates;
  readonly now: Instant;
  readonly deviceTimeZone: TimeZone;
  /** Item 14's end latch: a Kickstart whose end is due reads as ended. */
  readonly endsPending: ReadonlyMap<Id, KickstartEndReason>;
  /**
   * This page's hold of a pre-start stop-sign "yes" until its record is written (item 14's
   * preStartStopSignStore); the record itself comes in `inputs.preStartCards`. One source: item
   * 14's preStartStopSignToday reads both, as the weight screens do.
   */
  readonly preStartHeld?: LocalDate | null;
}): FastingContext {
  const { inputs, gates } = args;
  const { stated } = reasonStates(args.gateInput, featureGateOf(gates, 'fasting').reasons);
  const phaseInput = phaseInputFrom({
    now: args.now,
    deviceTimeZone: args.deviceTimeZone,
    homeTimeZone: inputs.settings.homeTimeZone,
    profile: inputs.profile,
    gates,
    periods: inputs.periods,
    checks: inputs.checks,
    endsPending: args.endsPending,
  });
  const kickstartRunning = isKickstartDay(phaseInput);
  const phase = phaseOn(phaseInput);
  const stopSignPause =
    stopSignPauseUntil(inputs.periods, inputs.checks, phaseInput.today, phaseInput.homeTimeZone) !==
      null ||
    preStartStopSignToday(inputs.preStartCards ?? [], args.preStartHeld ?? null, phaseInput.today);
  return {
    gate: {
      fastingGated: gates.fastingGated,
      pharmacistReminder: gates.pharmacistReminder,
      quiet: stated.some(isDeficitGroupReason),
    },
    preset: effectiveFastingPreset(inputs.targets, kickstartRunning, gates),
    kickstart:
      kickstartRunning && phase.kind === 'kickstart'
        ? {
            running: true,
            lastDay: phase.scheduledLastDay,
            presetAfter: effectiveFastingPreset(inputs.targets, false, gates),
          }
        : { running: false },
    mealTargets: mealTargetsFrom(inputs, {
      now: args.now,
      deviceTimeZone: args.deviceTimeZone,
      endsPending: args.endsPending,
    }),
    mealSources,
    stopSignPause,
  };
}
