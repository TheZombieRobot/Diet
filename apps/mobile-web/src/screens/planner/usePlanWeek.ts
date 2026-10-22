/**
 * The planner's live read (item 22 design 5.2): one live query per shown week and local date, so
 * a new week or a new day starts a new query. It reads item 14's weight inputs (what item 21's
 * targets read), item 20's recipe rows, the plan days from the day before the week to the end of
 * the following week, whether any earlier day holds a meal, item 19's stock, the recent reflux
 * symptoms and the reminder and snack card states. A failed read is a value, never an endless
 * "still opening"; a closed database still throws, so the last values stay on screen. The planner
 * never reads the food log or the drink log (C11).
 */
import {
  addDays,
  type CardStateRecord,
  type CholesterolTrigger,
  type LocalDate,
  type PlanDayRecord,
  planWeekDates,
  type StockView,
  type SymptomRecord,
  utcRangeCovering,
} from '@diet/core';
import { useMemo } from 'react';
import { StorageClosedError } from '../../db/errors';
import type { WriteGate } from '../../db/gate';
import { type LiveQueryState, useLiveQueryState } from '../../db/liveQuery';
import type { RecipeContextRows } from '../../db/repos/recipes';
import type { AppStorage } from '../../db/runtime';
import { readStockNow } from '../../garden/stock';
import { readWeightInputs, type WeightInputs } from '../weight/useWeightView';

const CHOLESTEROL_TRIGGERS: readonly CholesterolTrigger[] = ['day-1', 'day-56', 'day-84'];

export interface PlanWeekInputs {
  /** Item 21's day-target records (item 14's weight inputs). */
  readonly targetRecords: WeightInputs;
  /** Item 20's rows: own foods, corrections, owner recipes, garden ids, allergens, hidden ids. */
  readonly recipeRows: RecipeContextRows;
  /** From the day before the shown week to the Sunday after the following week's start. */
  readonly planDays: readonly PlanDayRecord[];
  readonly hasMealsBefore: boolean;
  readonly stock: StockView;
  /** From yesterday to today: a reflux day is a symptom on the date or the day before. */
  readonly symptoms: readonly SymptomRecord[];
  readonly cards: {
    readonly cholesterol: Partial<Record<CholesterolTrigger, CardStateRecord>>;
    readonly electrolyte: CardStateRecord | undefined;
    readonly snack: ReadonlyMap<LocalDate, CardStateRecord>;
  };
}

interface Source {
  readonly gate: WriteGate;
  readonly storage: AppStorage;
  readonly weekStart: LocalDate;
  readonly today: LocalDate;
}

export type PlanRead =
  { readonly ok: true; readonly value: PlanWeekInputs } | { readonly ok: false };

const isClosed = (error: unknown): boolean =>
  error instanceof StorageClosedError ||
  (typeof error === 'object' && error !== null && 'name' in error
    ? error.name === 'DatabaseClosedError'
    : false);

export async function readPlanWeek(source: Source): Promise<PlanWeekInputs> {
  const { repos } = source.storage;
  const { weekStart, today } = source;
  const { lower, upper } = utcRangeCovering(addDays(today, -1), today);
  const dates = planWeekDates(weekStart);
  const [targetRecords, recipeRows, planDays, hasMealsBefore, stock, symptoms, electrolyte] =
    await Promise.all([
      readWeightInputs(source.storage),
      repos.recipes.context(),
      repos.planDays.listByIndex('date', addDays(weekStart, -1), addDays(weekStart, 13)),
      repos.planDays.hasMealsBefore(weekStart),
      readStockNow(source.storage),
      repos.symptoms.listByIndex('at', lower, upper),
      repos.cardState.get('electrolyte-reminder', 'daily'),
    ]);
  const [cholesterolRows, snackRows] = await Promise.all([
    Promise.all(CHOLESTEROL_TRIGGERS.map((t) => repos.cardState.get('cholesterol-checkin', t))),
    Promise.all(dates.map((d) => repos.cardState.get('single-meal-snack', `date:${d}`))),
  ]);
  const cholesterol: Partial<Record<CholesterolTrigger, CardStateRecord>> = {};
  CHOLESTEROL_TRIGGERS.forEach((trigger, i) => {
    const row = cholesterolRows[i];
    if (row !== undefined) cholesterol[trigger] = row;
  });
  const snack = new Map<LocalDate, CardStateRecord>();
  dates.forEach((date, i) => {
    const row = snackRows[i];
    if (row !== undefined) snack.set(date, row);
  });
  return {
    targetRecords,
    recipeRows,
    planDays,
    hasMealsBefore,
    stock,
    symptoms,
    cards: { cholesterol, electrolyte, snack },
  };
}

async function readAsValue(source: Source): Promise<PlanRead> {
  try {
    return { ok: true, value: await readPlanWeek(source) };
  } catch (error) {
    if (isClosed(error)) throw error;
    return { ok: false };
  }
}

/** The week's inputs, live; pending until the first result, an error value when the read fails. */
export function usePlanWeek(
  storage: AppStorage,
  weekStart: LocalDate,
  today: LocalDate,
): LiveQueryState<PlanRead> {
  const source = useMemo(
    () => ({ gate: storage.gate, storage, weekStart, today }),
    [storage, weekStart, today],
  );
  return useLiveQueryState(source, readAsValue);
}
