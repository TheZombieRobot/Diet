import type { GroceryListRecord, Instant } from '@diet/core';

/**
 * The time stock is re-checked against (design 2.2; item 19 G18; J30): the current list's last
 * change, for a new list and for an update alike. Every deduction any list made was written while
 * that list was current, so a stock row not changed since then is asked about again ("Still have
 * it?") instead of being taken off a second time.
 */
export function previousListAt(
  current: Pick<GroceryListRecord, 'updatedAt'> | null,
): Instant | null {
  return current?.updatedAt ?? null;
}
