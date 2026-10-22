/**
 * The figures the single-meal check uses (C10, C65, HS-18; cross-item ruling 3): item 21's day
 * targets, the same ones the Nutrition today card shows, never the weight phase alone. A stop-sign
 * pause or a missing rough guide reads Steady in the figures while the phase still says Kickstart,
 * so the check then uses the bottom of the protein range, as the card does. With no rough guide
 * the energy figure is null: energy is not shown to be met, so the 5 pm snack and the widen line
 * are offered and the check never passes (energyForMealChecks).
 *
 * Each date's figures are the planner's planDayTargets (item 22 V42), so the Fast card and the
 * planner's Day screen read one protein target and one energy target per date: today's figures
 * for today (and the day before, when its window wraps past midnight), and for a later date
 * today's gates and weight with that date's Kickstart state. This file holds no phase function:
 * the figures are not the phase (scan targetsHome).
 */
import {
  type DayTargetRecords,
  energyForMealChecks,
  type Id,
  type Instant,
  type KickstartEndReason,
  type LocalDate,
  localDateOf,
  planDayTargets,
  planTargetsBase,
  type TimeZone,
} from '@diet/core';

export interface MealTargets {
  /** dayTargets(...).protein.checkTargetG: the top of the range with Kickstart figures, else the bottom. */
  readonly proteinTargetG: number;
  /** energyForMealChecks(dayTargets(...).energy): null when there is no rough guide. */
  readonly energyTargetKj: number | null;
}

/** The meal-check figures for each date, worked out once per date from one read of the records. */
export function mealTargetsFrom(
  records: DayTargetRecords,
  clock: {
    readonly now: Instant;
    readonly deviceTimeZone: TimeZone;
    /** Item 14's end latch: a Kickstart whose end is due reads as ended. */
    readonly endsPending: ReadonlyMap<Id, KickstartEndReason>;
    /** This page's hold of a pre-start stop-sign "yes" until its record is written. */
    readonly preStartHeld: LocalDate | null;
  },
): (date: LocalDate) => MealTargets {
  const today = localDateOf(clock.now, clock.deviceTimeZone);
  const base = planTargetsBase(records, {
    at: clock.now,
    today,
    deviceZone: clock.deviceTimeZone,
    endsPending: clock.endsPending,
    preStartHeld: clock.preStartHeld,
  });
  const byDate = new Map<LocalDate, MealTargets>();
  return (date) => {
    const on = date > today ? date : today;
    const known = byDate.get(on);
    if (known !== undefined) return known;
    const targets = planDayTargets(base, on);
    const figures: MealTargets = {
      proteinTargetG: targets.protein.checkTargetG,
      energyTargetKj: energyForMealChecks(targets.energy),
    };
    byDate.set(on, figures);
    return figures;
  };
}
