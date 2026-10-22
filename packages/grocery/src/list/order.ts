/**
 * Aisle order (design 2.9; GL-04): item 18's SEED_AISLES in their order, then any other aisle by
 * name (an own food's or a correction's), then "Other" last. The list is stored in this order, so
 * the screen, the exports and item 30's payload all keep it.
 */
import { type GroceryItem, OTHER_AISLE, SEED_AISLES } from '@diet/core';

const compareText = (a: string, b: string): number =>
  a.localeCompare(b, 'en-NZ', { sensitivity: 'base' });

export function aisleRank(aisle: string): readonly [group: 0 | 1 | 2, order: number | string] {
  const index = (SEED_AISLES as readonly string[]).indexOf(aisle);
  if (index >= 0) return [0, index];
  return aisle === OTHER_AISLE ? [2, 0] : [1, aisle];
}

function compareAisles(a: string, b: string): number {
  const [groupA, orderA] = aisleRank(a);
  const [groupB, orderB] = aisleRank(b);
  if (groupA !== groupB) return groupA - groupB;
  return typeof orderA === 'number' && typeof orderB === 'number'
    ? orderA - orderB
    : compareText(String(orderA), String(orderB));
}

/** By aisle, then item text, then id: one fixed order. */
export function sortLines(items: readonly GroceryItem[]): GroceryItem[] {
  return [...items].sort(
    (a, b) =>
      compareAisles(a.aisle, b.aisle) ||
      compareText(a.text, b.text) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The to-buy lines grouped by aisle, in aisle order. */
export function aisleGroups(
  items: readonly GroceryItem[],
): readonly { readonly aisle: string; readonly lines: readonly GroceryItem[] }[] {
  const groups = new Map<string, GroceryItem[]>();
  for (const line of sortLines(items.filter((i) => i.section === 'to-buy'))) {
    const group = groups.get(line.aisle);
    if (group === undefined) groups.set(line.aisle, [line]);
    else group.push(line);
  }
  return [...groups].map(([aisle, lines]) => ({ aisle, lines }));
}
