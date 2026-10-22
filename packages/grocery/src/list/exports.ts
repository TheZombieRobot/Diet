/**
 * Copy text, CSV and JSON (design 2.10; GL-06, GL-07). Made on the phone from the list record
 * alone, so no garden photo, health record or phone-only reminder can reach them; nothing is sent
 * anywhere until the owner shares the file or pastes the text.
 */
import { type GroceryItem, type GroceryListRecord, validateRow } from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import { csvPrice } from './price';
import { needText } from './text';

export const CSV_COLUMNS = Object.freeze([
  'store',
  'aisle',
  'item',
  'section',
  'quantity',
  'unit',
  'pack_suggestion',
  'from_garden',
  'from_pantry',
  'note',
  'substitute',
  'price',
  'price_basis',
  'price_entered_at',
  'ticked',
  'list_updated_at',
] as const);

/**
 * One line per item to buy, ticked ones included (J16): "{item}, {pack}", else "{item}, {need}",
 * else "{item}". No header, prices, notes or hints; "" when nothing is to buy.
 */
export function listText(list: GroceryListRecord): string {
  return list.items
    .filter((line) => line.section === 'to-buy')
    .map((line) => {
      if (line.packSuggestion !== null) return `${line.text}, ${line.packSuggestion}`;
      if (line.quantity !== null && line.unit !== null) {
        return `${line.text}, ${needText(line.quantity, line.unit)}`;
      }
      return line.text;
    })
    .join('\n');
}

/** A text cell that a spreadsheet would read as a formula gets a leading apostrophe (J17). */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null, text = false): string {
  let out = value === null ? '' : String(value);
  if (text && FORMULA_START.test(out)) out = `'${out}`;
  return /[",\r\n]|^ | $/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
}

const plain = (n: number | null): string | null =>
  n === null ? null : String(Math.round(n * 100) / 100);

function csvRow(list: GroceryListRecord, line: GroceryItem): string {
  const words = grocery.csv;
  const fromGarden =
    line.fromGardenG !== null
      ? plain(line.fromGardenG)
      : line.gardenAmountUnknown
        ? words.gardenNotEntered
        : null;
  return [
    cell(list.storeName, true),
    cell(line.aisle, true),
    cell(line.text, true),
    cell(line.section === 'to-buy' ? words.toBuy : words.alreadyHave),
    cell(plain(line.quantity)),
    cell(line.unit),
    cell(line.packSuggestion, true),
    cell(fromGarden),
    cell(plain(line.fromPantryG)),
    cell(line.auditNote, true),
    cell(line.substituteHint, true),
    cell(line.price === null ? words.unknown : csvPrice(line.price)),
    cell(line.price?.basis ?? null),
    cell(line.price?.enteredAt ?? null),
    cell(line.ticked ? words.yes : words.no),
    cell(list.updatedAt),
  ].join(',');
}

/** UTF-8 with a byte-order mark, CRLF rows; the to-buy lines, then the already-have lines. */
export function listCsv(list: GroceryListRecord): string {
  const ordered = [
    ...list.items.filter((line) => line.section === 'to-buy'),
    ...list.items.filter((line) => line.section === 'already-have'),
  ];
  const rows = [CSV_COLUMNS.join(','), ...ordered.map((line) => csvRow(list, line))];
  return `\uFEFF${rows.map((row) => `${row}\r\n`).join('')}`;
}

/**
 * The list record exactly as stored, built through its validator's allow-list (storage 2.1), so
 * no stray property is written. Throws StorageValidationError for a list that fails it.
 */
export function listJson(list: GroceryListRecord): string {
  return `${JSON.stringify(validateRow('grocery_lists', list), null, 2)}\n`;
}
