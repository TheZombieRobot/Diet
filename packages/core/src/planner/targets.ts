/**
 * Each planned date's targets (item 22 design 3.4; HS-22, HS-25, C10, C61, C65; V25, V42). Today's
 * are item 21's dayTargetsFromRecords. Another date keeps today's gates, weight basis, profile and
 * stored targets (a future date cannot have a newer weigh-in, and a gate that would open on a later
 * birthday stays closed until it does), with that date's Kickstart state at noon in the device
 * zone, so a Kickstart's last day has Kickstart figures and the day after has Steady ones. The Day
 * screen, auto-fill, copy, the repository and the Fast card all read this one function. No window
 * or preset reaches it (HS-22); this file holds no weight-phase function (scan targetsHome).
 */
import {
  type DayTargetRecords,
  type DayTargets,
  dayTargets,
  dayTargetsFromRecords,
  type DayTargetsView,
  kickstartStateFrom,
} from '../targets/dayTargets';
import { type WeightBasis, weightForEstimate } from '../targets/energy';
import type { LocalDate } from '../util/time';
import { weighInsFromRecords } from '../weight/weighIns';
import type { PlannerClock } from './schedule';
import { noonOf } from './week';

export interface PlanTargetsBase {
  /** dayTargetsFromRecords(records, clock): today's gates, display and targets. */
  readonly view: DayTargetsView;
  readonly records: DayTargetRecords;
  readonly clock: PlannerClock;
  /** Today's weight basis, used for every date. */
  readonly weight: WeightBasis | null;
}

export function planTargetsBase(records: DayTargetRecords, clock: PlannerClock): PlanTargetsBase {
  const home = records.settings.homeTimeZone;
  const { weighIns } = weighInsFromRecords(records.weights, home);
  return {
    view: dayTargetsFromRecords(records, clock),
    records,
    clock,
    weight: weightForEstimate(weighIns, clock.today),
  };
}

export function planDayTargets(base: PlanTargetsBase, date: LocalDate): DayTargets {
  const { view, records, clock } = base;
  if (date === clock.today) return view.targets;
  return dayTargets({
    today: date,
    gates: view.gates,
    kickstart: kickstartStateFrom(
      records.periods,
      records.checks,
      noonOf(date, clock.deviceZone),
      date,
      clock.deviceZone,
      records.settings.homeTimeZone,
      clock.endsPending,
    ),
    dietMode: records.profile.dietMode,
    profile: records.profile,
    targets: records.targets,
    weight: base.weight,
  });
}
