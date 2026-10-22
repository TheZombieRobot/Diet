/**
 * The garden and pantry stock as the planner (item 22) and the grocery list (item 24) read it
 * (item 19 design 2.5; G18): core readStock over one consistent read of both stores, for today in
 * the device's zone. Read only; it never touches the photos.
 */
import { localDateOf, readStock, type StockView } from '@diet/core';
import type { AppStorage } from '../db/runtime';

export async function readStockNow(storage: AppStorage): Promise<StockView> {
  const rows = await storage.repos.stock.rows();
  return readStock({
    ...rows,
    today: localDateOf(storage.env.now(), storage.env.timeZone()),
  });
}
