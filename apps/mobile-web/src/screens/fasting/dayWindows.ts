/**
 * Per-day eating windows that no longer fit the standing pattern (item 15 design 1.1 items 5 and
 * 7, 3.5; C30; F4). Saving a pattern (item 13's saveSchedule) and item 14's preset moves remove,
 * in the same action, every change from today on that does not widen the new standing window or
 * would leave a neighbouring fast outside the per-day limit (core staleOverrides); the form names
 * those dates before Save. Nothing is removed while fasting is switched off (RD-06).
 */
import {
  addDays,
  type GateInput,
  type Id,
  type Instant,
  type KickstartCheckRecord,
  type KickstartEndReason,
  type KickstartPeriodRecord,
  type LocalDate,
  localDateOf,
  type PlanDayRecord,
  type ProfileRecord,
  type ReadinessGates,
  readinessGates,
  type ReadinessRecord,
  scheduleFrom,
  type SettingsRecord,
  staleOverrides,
  type TargetsRecord,
  type TimeZone,
  weightGateInput,
  type WeightRecord,
} from '@diet/core';
import { useCallback, useMemo } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { useReadinessGates } from '../../onboarding/state';
import { useStore } from '../../store';
import { useNow } from '../../useNow';
import { endLatchStore } from '../weight/stores';
import { fastingContext } from './integration';

/**
 * The records a pattern's schedule is built from, with every per-day window from yesterday on, and
 * the answers and weigh-ins the gates (and the fasting context's day targets) read.
 */
export interface ScheduleSource {
  readonly targets: TargetsRecord;
  readonly settings: SettingsRecord;
  readonly profile: ProfileRecord;
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  readonly readiness: readonly ReadinessRecord[];
  readonly weights: readonly WeightRecord[];
  readonly planDays: readonly PlanDayRecord[];
}

/** The latest date a plan_days key can hold, as the upper bound of "from today on". */
const LAST_DATE: LocalDate = '9999-12-31';

async function readScheduleSource(storage: AppStorage, today: LocalDate): Promise<ScheduleSource> {
  const { repos } = storage;
  const [targets, settings, profile, periods, checks, readiness, weights, planDays] =
    await Promise.all([
      repos.targets.get(),
      repos.settings.get(),
      repos.profile.get(),
      repos.kickstart.listPeriods(),
      repos.kickstart.listChecks(),
      repos.readiness.list(),
      repos.weights.list(),
      repos.planDays.listByIndex('date', addDays(today, -1), LAST_DATE),
    ]);
  return { targets, settings, profile, periods, checks, readiness, weights, planDays };
}

/** The dates from today on whose per-day window the source's targets no longer fit. */
export function staleDays(args: {
  readonly source: ScheduleSource;
  readonly gateInput: GateInput;
  readonly gates: ReadinessGates;
  readonly now: Instant;
  readonly deviceTimeZone: TimeZone;
  readonly endsPending: ReadonlyMap<Id, KickstartEndReason>;
}): LocalDate[] {
  const { source, now, deviceTimeZone } = args;
  if (args.gates.fastingGated) return [];
  const context = fastingContext({
    inputs: source,
    gateInput: args.gateInput,
    gates: args.gates,
    now,
    deviceTimeZone,
    endsPending: args.endsPending,
  });
  const schedule = scheduleFrom({
    preset: context.preset,
    planDays: source.planDays,
    fastingGated: false,
    kickstart: context.kickstart,
  });
  return staleOverrides(schedule, localDateOf(now, deviceTimeZone), deviceTimeZone);
}

/**
 * Removes the per-day windows the stored pattern no longer fits, from fresh records: after a
 * pattern save or a preset move, in the same action. Returns the dates cleared.
 */
export async function clearStaleDayWindows(storage: AppStorage): Promise<LocalDate[]> {
  const now = storage.env.now();
  const deviceTimeZone = storage.env.timeZone();
  const today = localDateOf(now, deviceTimeZone);
  const source = await readScheduleSource(storage, today);
  const gateInput = weightGateInput(
    {
      readiness: source.readiness,
      profile: source.profile,
      weights: source.weights,
      homeTimeZone: source.settings.homeTimeZone,
    },
    today,
    now,
  );
  const dates = staleDays({
    source,
    gateInput,
    gates: readinessGates(gateInput),
    now,
    deviceTimeZone,
    endsPending: endLatchStore.get(),
  });
  if (dates.length > 0) {
    await storage.repos.planDays.setWindows(dates.map((date) => ({ date, window: null })));
  }
  return dates;
}

/**
 * The dates a save of `targets` would clear, live, for the line the form shows before Save
 * (fasting.pattern.clearsChanges). Empty while the records load or nothing is chosen.
 */
export function useStaleDays(
  storage: AppStorage,
  targets: Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'> | null,
): LocalDate[] {
  const now = useNow(storage.env);
  const deviceTimeZone = storage.env.timeZone();
  const today = localDateOf(now, deviceTimeZone);
  const query = useCallback((s: AppStorage) => readScheduleSource(s, today), [today]);
  const source = useLiveQuery(storage, query);
  const gateView = useReadinessGates(storage);
  const endsPending = useStore(endLatchStore);
  return useMemo(() => {
    if (source === undefined || gateView === undefined || targets === null) return [];
    return staleDays({
      source: { ...source, targets: { ...source.targets, ...targets } },
      gateInput: gateView.input,
      gates: gateView.gates,
      now,
      deviceTimeZone,
      endsPending,
    });
  }, [source, gateView, targets, now, deviceTimeZone, endsPending]);
}
