/**
 * The List screen's live read (item 24 design 1.2): the current list, the profile (store name,
 * allergens and the substitute filter), item 19's stock rows and when the list's substitutes were
 * last cleared. Plus the build panel's plan summary for its seven days. A failed read is reported
 * (item 16's useLiveQueryState); a closed database keeps the last values.
 */
import {
  type GroceryListRecord,
  type Instant,
  isSeedId,
  type LocalDate,
  type ProfileRecord,
  seedRecipe,
  type StockView,
} from '@diet/core';
import { type PlanSummary, planSummary } from '@diet/grocery';
import { useMemo } from 'react';
import type { WriteGate } from '../../db/gate';
import { type LiveQueryState, useLiveQuery, useLiveQueryState } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { readStockNow } from '../../garden/stock';
import { readOwnerRecipes, readPlanRange } from './buildList';

export interface ListScreenRead {
  readonly list: GroceryListRecord | null;
  readonly profile: ProfileRecord;
  readonly stock: StockView;
  readonly hintsClearedAt: Instant | null;
}

export async function readListScreen(storage: AppStorage): Promise<ListScreenRead> {
  const { repos } = storage;
  const list = await repos.groceryBuild.current();
  const [profile, stock, hintsClearedAt] = await Promise.all([
    repos.profile.get(),
    readStockNow(storage),
    list === null ? Promise.resolve(null) : repos.groceryBuild.hintsClearedAt(list.id),
  ]);
  return { list, profile, stock, hintsClearedAt };
}

export function useListScreen(storage: AppStorage): LiveQueryState<ListScreenRead> {
  return useLiveQueryState(storage, readListScreen);
}

interface SummarySource {
  readonly gate: WriteGate;
  readonly storage: AppStorage;
  readonly firstDay: LocalDate;
}

async function readSummary(source: SummarySource): Promise<PlanSummary> {
  const rows = await readPlanRange(source.storage, source.firstDay);
  const owner = await readOwnerRecipes(source.storage, rows);
  return planSummary(rows, (id) => (isSeedId(id) ? seedRecipe(id) !== null : owner.has(id)));
}

/** The build panel's plan summary for the seven days from `firstDay` (null: not a date, or pending). */
export function usePlanSummary(
  storage: AppStorage,
  firstDay: LocalDate | null,
): PlanSummary | undefined {
  const source = useMemo(
    () => (firstDay === null ? null : { gate: storage.gate, storage, firstDay }),
    [storage, firstDay],
  );
  return useLiveQuery(source, readSummary);
}
