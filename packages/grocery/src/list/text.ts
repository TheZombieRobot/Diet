/**
 * The words a line shows (design 2.9): its amount, the need under a pack, and food names inside a
 * sentence. Numbers are written without Intl, so every device shows the same text. Never in
 * kilograms (item 19 G19).
 */
import { type CountWord, fillTemplate, formatNumber, type GroceryItem } from '@diet/core';
import { grocery } from '@diet/core/copy/health';

/** "Frozen broccoli" becomes "frozen broccoli"; "UHT milk" stays. Display and notes only. */
export function displayName(name: string): string {
  const [first = '', second = ''] = name;
  return second !== '' && second === second.toLowerCase() && second !== second.toUpperCase()
    ? first.toLowerCase() + name.slice(1)
    : name;
}

/** "1,200 g", "300 mL", "8 eggs" (or "8" with no count word), "1 pack", "3 packs". */
export function needText(
  quantity: number,
  unit: 'g' | 'ml' | 'each' | 'pack',
  word: CountWord | null = null,
): string {
  const amount = formatNumber(Math.round(quantity * 100) / 100);
  const units = grocery.units;
  switch (unit) {
    case 'g':
      return fillTemplate(units.grams, { amount });
    case 'ml':
      return fillTemplate(units.millilitres, { amount });
    case 'each':
      return word === null
        ? fillTemplate(units.count, { amount })
        : fillTemplate(units.countWord, { amount, word: quantity === 1 ? word.one : word.many });
    case 'pack':
      return fillTemplate(quantity === 1 ? units.packOne : units.packMany, { amount });
  }
}

/** The right-hand amount: the pack to buy, else the need; an already-have line its whole need. */
export function lineAmountText(
  line: Pick<GroceryItem, 'quantity' | 'unit' | 'packSuggestion' | 'section'>,
  word: CountWord | null = null,
): string | null {
  if (line.section === 'to-buy' && line.packSuggestion !== null) return line.packSuggestion;
  if (line.quantity === null || line.unit === null) return null;
  return needText(line.quantity, line.unit, word);
}

/** "Need 200 g · 300 g from garden, as listed on 9 January", or null. */
export function lineDetail(line: GroceryItem, word: CountWord | null = null): string | null {
  const parts: string[] = [];
  if (
    line.section === 'to-buy' &&
    line.packSuggestion !== null &&
    line.quantity !== null &&
    line.unit !== null
  ) {
    parts.push(
      fillTemplate(grocery.line.need, { amount: needText(line.quantity, line.unit, word) }),
    );
  }
  if (line.auditNote !== null) parts.push(line.auditNote);
  return parts.length === 0 ? null : parts.join(grocery.line.detailJoin);
}
