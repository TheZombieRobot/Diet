/**
 * The planner's eating windows (item 22 design 3.3; cross-item rulings 2 and 4; C07, C55, C73).
 * The only place the planner reads the fasting preset: item 14's effectiveFastingPreset with
 * isKickstartDay and the gates, composed exactly as item 15's fastingContext composes it for the
 * Fast card, so both read one rule. While fasting is gated every date has no window and stored
 * per-day windows are ignored. Nothing here writes.
 */
import type { EatingWindow } from '../fasting/eatingWindow';
import { type Schedule, scheduleFrom, windowOn } from '../fasting/windows';
import type { Id, TimeZone } from '../storage/primitives';
import type { ReadinessGates } from '../storage/readiness';
import type {
  CardStateRecord,
  KickstartCheckRecord,
  KickstartEndReason,
  KickstartPeriodRecord,
  PlanDayRecord,
  ProfileRecord,
  TargetsRecord,
} from '../storage/records';
import type { TargetsClock } from '../targets/dayTargets';
import type { LocalDate } from '../util/time';
import { phaseInputFrom } from '../weight/overview';
import { isKickstartDay, phaseOn, stopSignPauseUntil } from '../weight/phase';
import { preStartStopSignOn } from '../weight/preStart';
import { effectiveFastingPreset } from '../weight/presets';

/** Item 21's TargetsClock: the instant, its local date in the device zone, the latch and hold. */
export type PlannerClock = TargetsClock;

export interface PlannerScheduleRecords {
  readonly targets: Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'>;
  readonly profile: Pick<ProfileRecord, 'dietMode' | 'carbCeilingStartedAt'>;
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  readonly planDays: readonly Pick<PlanDayRecord, 'date' | 'eatingWindow'>[];
  readonly gates: ReadinessGates;
  readonly homeTimeZone: TimeZone;
  /** The card states holding a stop-sign "yes" outside a check (item 14's record). */
  readonly cardStates: readonly CardStateRecord[];
}

export interface PlannerSchedule {
  /** Item 15's schedule. */
  readonly schedule: Schedule;
  readonly kickstartToday: boolean;
  readonly fastingGated: boolean;
  /**
   * A Kickstart stop-sign pause holds, or a stop-sign "yes" was given today (item 14; DECISIONS
   * 2026-10-20 and 2026-10-22): no planner screen names an eating-window time or offers the 5 pm
   * snack, as on the Fast card (F20).
   */
  readonly stopSignPause: boolean;
}

export function plannerSchedule(
  records: PlannerScheduleRecords,
  clock: PlannerClock,
): PlannerSchedule {
  const { targets, gates } = records;
  const endsPending: ReadonlyMap<Id, KickstartEndReason> = clock.endsPending ?? new Map();
  const input = phaseInputFrom({
    now: clock.at,
    deviceTimeZone: clock.deviceZone,
    homeTimeZone: records.homeTimeZone,
    profile: records.profile,
    gates,
    periods: records.periods,
    checks: records.checks,
    endsPending,
  });
  const kickstartToday = isKickstartDay(input);
  const phase = phaseOn(input);
  const schedule = scheduleFrom({
    preset: effectiveFastingPreset(targets, kickstartToday, gates),
    planDays: records.planDays,
    fastingGated: gates.fastingGated,
    kickstart:
      kickstartToday && phase.kind === 'kickstart'
        ? {
            running: true,
            lastDay: phase.scheduledLastDay,
            presetAfter: effectiveFastingPreset(targets, false, gates),
          }
        : { running: false },
  });
  const stopSignPause =
    stopSignPauseUntil(records.periods, records.checks, input.today, records.homeTimeZone) !==
      null ||
    preStartStopSignOn(records.cardStates, input.today) ||
    clock.preStartHeld === input.today;
  return { schedule, kickstartToday, fastingGated: gates.fastingGated, stopSignPause };
}

/** A date's eating window: item 15's windowOn over the planner's schedule. */
export function dayWindow(date: LocalDate, ps: PlannerSchedule): EatingWindow | null {
  return windowOn(date, ps.schedule);
}
