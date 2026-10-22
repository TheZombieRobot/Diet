/**
 * The food log's one live read for a shown date (item 23 design 4.2): the date's entries, water,
 * steps and plan, the last 14 days of entries and plans (for "Logged recently" and plan rows), the
 * owner's label foods, recipes and corrections, the date's drinks (display only), and settings.
 * A failed read is a value, never an endless "still opening"; a closed database still throws, so
 * the last values stay on screen until the reload.
 */
import {
  addDays,
  type DrinkLogRecord,
  type FoodLogRecord,
  type LocalDate,
  type PlanDayRecord,
  RECENT_DAYS,
  type SettingsRecord,
  type StepsRecord,
  utcRangeCovering,
  type WaterRecord,
} from '@diet/core';
import { useMemo } from 'react';
import { StorageClosedError } from '../../db/errors';
import type { WriteGate } from '../../db/gate';
import { useLiveQuery } from '../../db/liveQuery';
import type { RecipeContextRows } from '../../db/repos/recipes';
import type { AppStorage } from '../../db/runtime';

export interface FoodLogDayRows {
  readonly entries: FoodLogRecord[];
  readonly recent: FoodLogRecord[];
  /** The water rows in the UTC cover of the date (filter with waterRowsOn). */
  readonly water: WaterRecord[];
  readonly steps: StepsRecord | undefined;
  readonly planDay: PlanDayRecord | undefined;
  readonly recentPlans: PlanDayRecord[];
  readonly recipeRows: RecipeContextRows;
  readonly drinks: DrinkLogRecord[];
  readonly settings: SettingsRecord;
}

export type FoodLogDayRead =
  { readonly ok: true; readonly rows: FoodLogDayRows } | { readonly ok: false };

interface Source {
  readonly gate: WriteGate;
  readonly storage: AppStorage;
  readonly date: LocalDate;
  readonly today: LocalDate;
}

const isClosed = (error: unknown): boolean =>
  error instanceof StorageClosedError ||
  (typeof error === 'object' && error !== null && 'name' in error
    ? error.name === 'DatabaseClosedError'
    : false);

async function readFoodLogDay(source: Source): Promise<FoodLogDayRead> {
  const { repos } = source.storage;
  const { date, today } = source;
  const from = addDays(today, -(RECENT_DAYS - 1));
  const cover = utcRangeCovering(date, date);
  try {
    const [entries, recent, water, steps, planDay, recentPlans, recipeRows, drinks, settings] =
      await Promise.all([
        repos.foodLog.forLocalDate(date),
        repos.foodLog.forLocalDates(from, today),
        repos.water.listByIndex('at', cover.lower, cover.upper),
        repos.steps.get(date),
        repos.planDays.get(date),
        repos.planDays.listByIndex('date', from, today),
        repos.recipes.context(),
        repos.drinks.forLocalDates(date, date),
        repos.settings.get(),
      ]);
    return {
      ok: true,
      rows: { entries, recent, water, steps, planDay, recentPlans, recipeRows, drinks, settings },
    };
  } catch (error) {
    if (isClosed(error)) throw error;
    return { ok: false };
  }
}

export function useFoodLogDay(
  storage: AppStorage,
  date: LocalDate,
  today: LocalDate,
): FoodLogDayRead | undefined {
  const source = useMemo(
    () => ({ gate: storage.gate, storage, date, today }),
    [storage, date, today],
  );
  return useLiveQuery(source, readFoodLogDay);
}
