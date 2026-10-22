/**
 * The one price file (design 2.11; NN-05, HS-16, C19, C111), the only entry of
 * PRICE_FORMATTER_FILES in tools/scans/rules.ts and the only file allowed a "$" before an amount.
 * A price comes only from the owner, typed as digits and stored in whole cents with the time it
 * was entered. Every function that prints a price calls assertPrice first, so no path shows a
 * figure for a price without a valid entered-at time. Nothing here looks a price up.
 */
import {
  fillTemplate,
  type GroceryItem,
  type Instant,
  isInstant,
  type PriceRecord,
} from '@diet/core';
import { grocery } from '@diet/core/copy/health';

/** The validator's limit: $10,000.00. */
export const MAX_PRICE_CENTS = 1_000_000;

export type PriceProblem = 'empty' | 'format' | 'range';

const PRICE_INPUT = /^(\d{1,5})(?:\.(\d{1,2}))?$/;
const BASES: readonly PriceRecord['basis'][] = ['line', 'per_kg', 'each'];

/** "6.5" → 650 cents, "$6.50" → 650; commas, spaces, signs and exponents are refused, never guessed. */
export function parsePriceInput(
  text: string,
):
  | { readonly ok: true; readonly cents: number }
  | { readonly ok: false; readonly problem: PriceProblem } {
  const trimmed = text.trim().replace(/^\$/, '');
  if (trimmed === '') return { ok: false, problem: 'empty' };
  const match = PRICE_INPUT.exec(trimmed);
  if (match === null) return { ok: false, problem: 'format' };
  const dollars = Number.parseInt(match[1] ?? '0', 10);
  const cents = Number.parseInt((match[2] ?? '0').padEnd(2, '0'), 10);
  const total = dollars * 100 + cents;
  if (total < 1 || total > MAX_PRICE_CENTS) return { ok: false, problem: 'range' };
  return { ok: true, cents: total };
}

/** Throws unless the price is whole cents 1–1,000,000 with a known basis and a valid entered-at time. */
export function assertPrice(price: PriceRecord): void {
  if (
    !Number.isInteger(price.amountNzCents) ||
    price.amountNzCents < 1 ||
    price.amountNzCents > MAX_PRICE_CENTS ||
    !BASES.includes(price.basis) ||
    !isInstant(price.enteredAt)
  ) {
    throw new RangeError('price');
  }
}

export function priceFromInput(
  cents: number,
  basis: PriceRecord['basis'],
  enteredAt: Instant,
): PriceRecord {
  const price: PriceRecord = { amountNzCents: cents, basis, enteredAt };
  assertPrice(price);
  return price;
}

/** "1,234.05" for 123,405 cents, with no Intl (the same on every device). */
function dollarsText(cents: number): string {
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${whole}.${String(cents % 100).padStart(2, '0')}`;
}

/** "$6.50", "$1,234.05". */
export function formatPriceAmount(price: PriceRecord): string {
  assertPrice(price);
  return '$' + dollarsText(price.amountNzCents);
}

/** "Your price: $6.50 for this line, entered 12 October." `enteredOn` comes from the screen. */
export function priceText(price: PriceRecord, enteredOn: string): string {
  assertPrice(price);
  const template =
    price.basis === 'line'
      ? grocery.price.line
      : price.basis === 'per_kg'
        ? grocery.price.perKg
        : grocery.price.each;
  return fillTemplate(template, { price: formatPriceAmount(price), date: enteredOn });
}

/**
 * What the grams taken off are worth, only for a per-kilogram price (J14); null for any other
 * basis or under 1 cent.
 */
export function estimateText(
  line: Pick<GroceryItem, 'price' | 'fromGardenG' | 'fromPantryG'>,
  enteredOn: string,
): string | null {
  const { price } = line;
  if (price === null) return null;
  assertPrice(price);
  const grams = (line.fromGardenG ?? 0) + (line.fromPantryG ?? 0);
  if (price.basis !== 'per_kg' || grams <= 0) return null;
  const cents = Math.round((grams / 1000) * price.amountNzCents);
  if (cents < 1) return null;
  return fillTemplate(grocery.price.estimate, { price: '$' + dollarsText(cents), date: enteredOn });
}

/** "6.50": the CSV's price cell, with no sign. */
export function csvPrice(price: PriceRecord): string {
  assertPrice(price);
  return dollarsText(price.amountNzCents).replace(/,/g, '');
}
