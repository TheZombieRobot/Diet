/**
 * The owner's row actions on the current list (item 24 design 1.7 to 1.10 and 4.3), each one
 * repository write that applies a pure change to the list as read inside its transaction (J24).
 * An offer re-reads the stock first and is applied only while it is still offered (design 1.7).
 * Every action resolves to null on success or the message to show under the row.
 */
import { type GroceryListRecord, type Id, localDateOf, type PriceRecord } from '@diet/core';
import {
  addManualLine,
  applyOffer,
  buyAnyway,
  editManualLine,
  foodWordsOf,
  type ListFoods,
  type ManualLineValue,
  type Offer,
  packInfoOf,
  previousListAt,
  removeLine,
  setLinePrice,
  toggleTick,
} from '@diet/grocery';
import type { GroceryListChange } from '../../db/repos/groceryBuild';
import type { AppStorage } from '../../db/runtime';
import { readStockNow } from '../../garden/stock';
import { listWriteMessage, type ListMessage } from './writeErrors';

type Change = (list: GroceryListRecord) => GroceryListChange | null;

const itemsOnly =
  (change: (list: GroceryListRecord) => GroceryListRecord['items'] | null): Change =>
  (list) => {
    const items = change(list);
    return items === null ? null : { items, audits: [] };
  };

async function write(storage: AppStorage, listId: Id, change: Change): Promise<ListMessage | null> {
  try {
    await storage.repos.groceryBuild.updateList(listId, change);
    return null;
  } catch (error) {
    return listWriteMessage(error, 'row');
  }
}

export const tickLine = (storage: AppStorage, listId: Id, lineId: Id, ticked: boolean) =>
  write(
    storage,
    listId,
    itemsOnly((list) => toggleTick(list, lineId, ticked)),
  );

export const priceLine = (storage: AppStorage, listId: Id, lineId: Id, price: PriceRecord | null) =>
  write(
    storage,
    listId,
    itemsOnly((list) => setLinePrice(list, lineId, price)),
  );

export const removeListLine = (storage: AppStorage, listId: Id, lineId: Id) =>
  write(
    storage,
    listId,
    itemsOnly((list) => removeLine(list, lineId)),
  );

export const addListLine = (storage: AppStorage, listId: Id, value: ManualLineValue, id: Id) =>
  write(
    storage,
    listId,
    itemsOnly((list) => addManualLine(list, value, id)),
  );

export const editListLine = (storage: AppStorage, listId: Id, lineId: Id, value: ManualLineValue) =>
  write(
    storage,
    listId,
    itemsOnly((list) => editManualLine(list, lineId, value)),
  );

/** A tapped offer, against the stock as it is now. */
export async function takeOffer(
  storage: AppStorage,
  listId: Id,
  lineId: Id,
  offer: Offer,
  foods: ListFoods,
): Promise<ListMessage | null> {
  let stock;
  try {
    stock = await readStockNow(storage);
  } catch (error) {
    return listWriteMessage(error, 'row');
  }
  const now = storage.env.now();
  const timeZone = storage.env.timeZone();
  return write(storage, listId, (list) => {
    const line = list.items.find((item) => item.id === lineId);
    if (line?.ingredientId === null || line === undefined) return null;
    const result = applyOffer(
      list,
      lineId,
      offer,
      stock.lines.filter((s) => s.ingredientId === line.ingredientId),
      packInfoOf(line.ingredientId, foods),
      foodWordsOf(line, foods),
      { now, today: localDateOf(now, timeZone), timeZone, previousListAt: previousListAt(list) },
    );
    return result === null ? null : { items: result.items, audits: [result.audit] };
  });
}

/** Buy anyway (C57) on an Already have line. */
export const buyLineAnyway = (
  storage: AppStorage,
  listId: Id,
  lineId: Id,
  foods: ListFoods | null,
) =>
  write(storage, listId, (list) => {
    const line = list.items.find((item) => item.id === lineId);
    if (line === undefined) return null;
    const info =
      foods === null || line.ingredientId === null ? null : packInfoOf(line.ingredientId, foods);
    const result = buyAnyway(list, lineId, info, foodWordsOf(line, foods));
    return result === null ? null : { items: result.items, audits: [result.audit] };
  });
