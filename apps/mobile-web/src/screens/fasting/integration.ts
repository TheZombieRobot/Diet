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
 * - The protein target is item 13's effectiveProteinTargetG for the phase.
 * - The meal figures come from later items: the day's energy target from item 21
 *   (energyForMealChecks over dayTargets; null when there is no rough energy guide), the planned
 *   meals from item 22 (plannedMealsOf, then plannedMealFigures) and the logged food from item 23
 *   (loggedIntakeOn). Until those exist, each source honestly has nothing, so the meal check shows
 *   no figures (F28) and a one-meal window still offers the 5 pm snack.
 */
import {
  effectiveFastingPreset,
  effectiveProteinTargetG,
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
  type TimeZone,
} from '@diet/core';
import type { FastingInputs } from './inputs';
import type { FastingContext } from './view';

export interface MealSources {
  /** Item 21: the day's energy target for the meal checks, or null (energy not shown to be met). */
  energyTargetFor(date: LocalDate): number | null;
  /** Item 22: the date's planned meals, or null when the date has no plan. */
  plannedMeals(date: LocalDate): readonly PlannedMealFigures[] | null;
  /** Item 23: what the food log holds for the date, or null with no food log. */
  loggedIntake(date: LocalDate): LoggedIntake | null;
}

export const mealSources: MealSources = {
  energyTargetFor: () => null,
  plannedMeals: () => null,
  loggedIntake: () => null,
};

/** The decisions of items 13, 14 and 21 to 23 for the fasting view, from one consistent read. */
export function fastingContext(args: {
  readonly inputs: Pick<FastingInputs, 'targets' | 'settings' | 'profile' | 'periods' | 'checks'>;
  /** Item 13's live gate input and gates (useReadinessGates), or the same built from records. */
  readonly gateInput: GateInput;
  readonly gates: ReadinessGates;
  readonly now: Instant;
  readonly deviceTimeZone: TimeZone;
  /** Item 14's end latch: a Kickstart whose end is due reads as ended. */
  readonly endsPending: ReadonlyMap<Id, KickstartEndReason>;
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
    proteinTargetG: effectiveProteinTargetG(
      kickstartRunning ? 'kickstart' : 'steady',
      inputs.targets.proteinRangeG,
    ),
    mealSources,
  };
}
