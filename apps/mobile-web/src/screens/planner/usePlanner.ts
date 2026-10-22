/**
 * One planner state for a screen (item 22 design 2.5 and 2.17): the live read of the week that
 * holds the date asked for, the bundled datasets and item 21's clock, built into the model the
 * cards render. Pending, a read error and a dataset error are states of their own.
 */
import { type LocalDate, weekStartOf } from '@diet/core';
import { useMemo } from 'react';
import type { AppStorage } from '../../db/runtime';
import { planData } from '../../planner/planData';
import { useGateOpen } from '../backup/focus';
import { useTargetsClock } from '../targets/useDayTargets';
import { type PlanModel, planModel } from './planModel';
import { usePlanWeek } from './usePlanWeek';

export type PlannerState =
  | { readonly status: 'not-ready' }
  | { readonly status: 'read-error' }
  | { readonly status: 'data-error' }
  | { readonly status: 'ready'; readonly model: PlanModel; readonly writable: boolean };

/** The planner for the week that holds `date` (today's week when null). */
export function usePlanner(storage: AppStorage, date: LocalDate | null): PlannerState {
  const clock = useTargetsClock(storage);
  const weekStart = weekStartOf(date ?? clock.today);
  const read = usePlanWeek(storage, weekStart, clock.today);
  const writable = useGateOpen(storage.gate);
  return useMemo((): PlannerState => {
    const data = planData();
    if (data === null) return { status: 'data-error' };
    if (read.status === 'pending') return { status: 'not-ready' };
    if (read.status === 'error' || !read.value.ok) return { status: 'read-error' };
    try {
      return { status: 'ready', model: planModel(read.value.value, clock, data), writable };
    } catch {
      return { status: 'read-error' };
    }
  }, [read, clock, writable]);
}
