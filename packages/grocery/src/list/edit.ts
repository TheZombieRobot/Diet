/**
 * The owner's own changes to a list (design 2.8; GL-05, GL-08). Each change returns the new items
 * (sorted), or null when the line is missing or the change does not apply, so the repository can
 * refuse a stale action rather than overwrite (J24). Generated lines cannot be renamed or
 * re-amounted (J9). Item names and the store name may not carry a price, a stock state or a cart
 * state: they reach every export and the laptop with no entered-at time (HS-16; J37).
 */
import {
  type GroceryItem,
  type GroceryListRecord,
  type Id,
  parseOptionalNumber,
  type PriceRecord,
  type RefId,
} from '@diet/core';
import { sortLines } from './order';
import { assertPrice } from './price';
import { MAX_LINE_AMOUNT, MAX_LIST_ITEMS } from './types';

export type ManualUnit = 'g' | 'ml' | 'each' | 'pack';

export interface ManualLineDraft {
  readonly name: string;
  readonly ingredientId: RefId | null;
  readonly amount: string;
  readonly unit: ManualUnit | null;
  readonly aisle: string;
}

export type ManualProblem = 'required' | 'length' | 'price-text' | 'not-a-number' | 'range';

export type ManualLineValue = Pick<
  GroceryItem,
  'text' | 'ingredientId' | 'quantity' | 'unit' | 'aisle' | 'substituteHint'
>;

/**
 * tools/scans/rules.ts's commerceRules (currency and stock or cart wording), copied because the
 * app cannot import the scan file (groceryCommerce.test.ts keeps them in step), plus "specials"
 * and any currency sign. "Chicken stock" and "Laundry basket" pass.
 */
const COMMERCE_PATTERNS: readonly RegExp[] = [
  /[$€£]/,
  /\bNZD\b/i,
  /\b\d+(?:\.\d{1,2})?\s?(?:dollars?|cents?)\b/i,
  /\b(?:in|out[\s_-]*of|low|no)[\s_-]*stock\b/i,
  /\bsold[\s-]+out\b/i,
  /\bstock\s+(?:levels?|status)\b|\blimited\s+stock\b|\bstock\s*:\s*\d|\bonly\s+\d+\s+left\b/i,
  /\b(?:added|adding)\s+to\s+(?:[\w’'-]+\s+){0,3}?(?:cart|trolley|basket)\b|\b(?:cart|trolley|basket)\s+(?:updated|has|contains|total)\b/i,
  /\bin\s+(?:your\s+|the\s+)?(?:[\w’'-]+\s+)?(?:cart|trolley|basket)\b/i,
  /\b(?:on\s+special|on\s+sale|price\s+drop|cheapest|cheaper|lowest\s+price|best\s+price|club\s+deals?)\b|\b\d+\s?%\s+off\b/i,
  /\bspecials?\b/i,
];

/** True for a price, a stock level or state, a cart state or a promotion in owner-typed text. */
export function commerceText(text: string): boolean {
  return COMMERCE_PATTERNS.some((pattern) => pattern.test(text));
}

const tidy = (text: string): string => text.trim().replace(/\s+/g, ' ');

export function checkManualLine(draft: ManualLineDraft):
  | { readonly ok: true; readonly value: Omit<ManualLineValue, 'substituteHint'> }
  | {
      readonly ok: false;
      readonly problems: Partial<Record<'name' | 'amount' | 'unit', ManualProblem>>;
    } {
  const problems: Partial<Record<'name' | 'amount' | 'unit', ManualProblem>> = {};
  const text = tidy(draft.name);
  if (text === '') problems.name = 'required';
  else if (text.length > 100) problems.name = 'length';
  else if (commerceText(text)) problems.name = 'price-text';
  let quantity: number | null = null;
  if (draft.amount.trim() !== '') {
    let value: number | undefined;
    try {
      value = parseOptionalNumber(draft.amount);
    } catch {
      problems.amount = 'not-a-number';
    }
    if (value !== undefined) {
      if (value <= 0 || value > MAX_LINE_AMOUNT) problems.amount = 'range';
      else quantity = value;
    }
    if (draft.unit === null) problems.unit = 'required';
  }
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      text,
      ingredientId: draft.ingredientId,
      quantity,
      unit: quantity === null ? null : draft.unit,
      aisle: draft.aisle,
    },
  };
}

/** A new manual line; null at MAX_LIST_ITEMS. */
export function addManualLine(
  list: GroceryListRecord,
  value: ManualLineValue,
  id: Id,
): GroceryItem[] | null {
  if (list.items.length >= MAX_LIST_ITEMS) return null;
  const line: GroceryItem = {
    id,
    origin: 'manual',
    ...value,
    packSuggestion: null,
    section: 'to-buy',
    fromGardenG: null,
    gardenAmountUnknown: false,
    fromPantryG: null,
    auditNote: null,
    price: null,
    ticked: false,
  };
  return sortLines([...list.items, line]);
}

function changed(
  list: GroceryListRecord,
  lineId: Id,
  change: (line: GroceryItem) => GroceryItem | null,
): GroceryItem[] | null {
  const line = list.items.find((item) => item.id === lineId);
  const next = line === undefined ? null : change(line);
  if (next === null) return null;
  return sortLines(list.items.map((item) => (item.id === lineId ? next : item)));
}

export function editManualLine(
  list: GroceryListRecord,
  lineId: Id,
  value: ManualLineValue,
): GroceryItem[] | null {
  return changed(list, lineId, (line) => (line.origin === 'manual' ? { ...line, ...value } : null));
}

/** Ticks a to-buy line; an already-have line has no tick box. */
export function toggleTick(
  list: GroceryListRecord,
  lineId: Id,
  ticked: boolean,
): GroceryItem[] | null {
  return changed(list, lineId, (line) => (line.section === 'to-buy' ? { ...line, ticked } : null));
}

/** Sets or removes the owner's price; a price must pass assertPrice (throws otherwise). */
export function setLinePrice(
  list: GroceryListRecord,
  lineId: Id,
  price: PriceRecord | null,
): GroceryItem[] | null {
  if (price !== null) assertPrice(price);
  return changed(list, lineId, (line) => ({ ...line, price }));
}

export function removeLine(list: GroceryListRecord, lineId: Id): GroceryItem[] | null {
  if (!list.items.some((item) => item.id === lineId)) return null;
  return list.items.filter((item) => item.id !== lineId);
}

/** profile.storeName's rule (1–80), and no price, stock or cart wording. */
export function checkStoreName(
  text: string,
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly problem: 'required' | 'length' | 'price-text' } {
  const value = tidy(text);
  if (value === '') return { ok: false, problem: 'required' };
  if (value.length > 80) return { ok: false, problem: 'length' };
  if (commerceText(value)) return { ok: false, problem: 'price-text' };
  return { ok: true, value };
}
