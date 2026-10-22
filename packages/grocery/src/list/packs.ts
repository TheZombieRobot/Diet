/**
 * Pack suggestions (design 2.4; GL-03, NN-04, C69, C110, N11). Typical pack sizes only, never
 * prices. A need is rounded up, never down, so the list never under-buys; packs are chosen with
 * the least surplus that covers the need, then the fewest packs. `gramsPerEach` only counts what
 * to buy (N11): it never turns a garden count into grams.
 */
import {
  type CountWord,
  EDIBLE_G_PER_EGG,
  effectivePacks,
  fillTemplate,
  type RefId,
  type SeedPacks,
  sizeText,
} from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import type { Need } from './aggregate';
import type { ListFoods } from './types';

/** 0.1 g or 0.1 mL resolution. */
export const PACK_UNITS_PER_G = 10;
/** 10 kg, 10 L or 100,000 items; above this the largest pack is repeated. */
export const MAX_EXACT_PACK_UNITS = 100_000;
/**
 * The volume one gram of a food sold by volume can take, at most: every liquid food in the
 * catalogue weighs at least about 0.91 g per mL (oils), so this never under-buys.
 */
export const MAX_ML_PER_G = 1.1;
/** The validator's limit on packSuggestion. */
const MAX_PACK_TEXT = 60;

export interface PackInfo {
  /** Item 18's effectivePacks(seed, view). */
  readonly packs: SeedPacks | null;
  readonly loose: boolean;
  /** view.gramsPerEach (an owner correction may set it to null). */
  readonly gramsPerEach: number | null;
  readonly countWord: CountWord | null;
  readonly egg: boolean;
}

export function packInfoOf(
  ingredientId: RefId,
  foods: Pick<ListFoods, 'resolve' | 'data'>,
): PackInfo | null {
  const view = foods.resolve(ingredientId);
  if (view === null) return null;
  const seed = foods.data.seedById.get(ingredientId) ?? null;
  return {
    packs: effectivePacks(seed, view),
    loose: seed?.loose ?? false,
    gramsPerEach: view.gramsPerEach,
    countWord: seed?.countWord ?? null,
    egg: seed?.group === 'egg',
  };
}

const morePrefersLarger = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
};

const packCount = (counts: readonly number[]): number => counts.reduce((sum, n) => sum + n, 0);

/**
 * Counts per size (sizes ascending, whole units) with the least surplus that covers `need`; on a
 * tie the fewest packs, then more of the larger sizes. Null when nothing is needed or no size is
 * given.
 */
export function choosePacks(need: number, sizes: readonly number[]): readonly number[] | null {
  if (need <= 0 || sizes.length === 0) return null;
  const largest = Math.max(...sizes);
  if (need > MAX_EXACT_PACK_UNITS) {
    return sizes.map((s) => (s === largest ? Math.ceil(need / largest) : 0));
  }
  const limit = need + largest - 1;
  const best: (readonly number[] | null)[] = new Array<readonly number[] | null>(limit + 1).fill(
    null,
  );
  best[0] = sizes.map(() => 0);
  for (let total = 1; total <= limit; total += 1) {
    let chosen: readonly number[] | null = null;
    for (const [i, size] of sizes.entries()) {
      const before = total - size >= 0 ? best[total - size] : null;
      if (before === null || before === undefined) continue;
      const candidate = before.map((n, j) => (j === i ? n + 1 : n));
      if (
        chosen === null ||
        packCount(candidate) < packCount(chosen) ||
        (packCount(candidate) === packCount(chosen) && morePrefersLarger(candidate, chosen))
      ) {
        chosen = candidate;
      }
    }
    best[total] = chosen;
    if (chosen !== null && total >= need) return chosen;
  }
  return null;
}

/** The amount to buy: whole grams rounded up (at least 1 g), or eggs at 50 g each; cooked: none. */
export function needQuantity(need: Need): {
  readonly quantity: number | null;
  readonly unit: 'g' | 'each' | null;
} {
  switch (need.kind) {
    case 'eggs':
      return {
        quantity: Math.max(1, Math.ceil(need.grams / EDIBLE_G_PER_EGG - 1e-9)),
        unit: 'each',
      };
    case 'grams':
    case 'unknown-food':
      return { quantity: Math.max(1, Math.ceil(need.grams - 1e-9)), unit: 'g' };
    case 'cooked':
      return { quantity: null, unit: null };
  }
}

const packs = grocery.packs;

function itemsText(count: number, word: CountWord | null): string | null {
  if (word === null) return null;
  return fillTemplate(packs.items, { count, word: count === 1 ? word.one : word.many });
}

/** "1 pack of 12 eggs", "2 packs of 6 eggs", "1 × 12 + 1 × 6 eggs". */
function countPackText(
  counts: readonly number[],
  sizes: readonly number[],
  word: CountWord | null,
): string | null {
  if (word === null) return null;
  const used = sizes.map((size, i) => ({ size, count: counts[i] ?? 0 })).filter((u) => u.count > 0);
  const [only] = used;
  if (used.length === 1 && only !== undefined) {
    return fillTemplate(only.count === 1 ? packs.countPackOne : packs.countPacksMany, {
      count: only.count,
      size: only.size,
      words: word.many,
    });
  }
  const parts = used
    .reverse()
    .map((u) => fillTemplate(packs.part, { count: u.count, size: u.size }))
    .join(packs.partsJoin);
  return fillTemplate(packs.countMixed, { parts, words: word.many });
}

/** "500 g pack", "2 × 1 kg packs", "1 × 500 g + 1 × 300 g packs". */
function sizePackText(
  counts: readonly number[],
  info: SeedPacks & { readonly unit: 'g' | 'ml' },
): string {
  const container = info.container ?? packs.container;
  const used = info.sizes
    .map((size, i) => ({ size, count: counts[i] ?? 0 }))
    .filter((u) => u.count > 0);
  const [only] = used;
  if (used.length === 1 && only !== undefined) {
    const size = sizeText(info.unit, only.size);
    return only.count === 1
      ? fillTemplate(packs.single, { size, container: container.one })
      : fillTemplate(packs.several, { count: only.count, size, containers: container.many });
  }
  const parts = used
    .reverse()
    .map((u) => fillTemplate(packs.part, { count: u.count, size: sizeText(info.unit, u.size) }))
    .join(packs.partsJoin);
  return fillTemplate(packs.mixed, { parts, containers: container.many });
}

const fits = (text: string | null): string | null =>
  text !== null && text.length <= MAX_PACK_TEXT ? text : null;

/** The largest size repeated: the fallback for a text over 60 characters. */
function largestOnly(need: number, sizes: readonly number[]): readonly number[] {
  const largest = Math.max(...sizes);
  return sizes.map((s) => (s === largest ? Math.ceil(need / largest) : 0));
}

function countPacks(n: number, sizes: readonly number[], word: CountWord | null): string | null {
  if (sizes.length === 1 && sizes[0] === 1) return fits(itemsText(n, word));
  const counts = choosePacks(n, sizes);
  if (counts === null) return null;
  return (
    fits(countPackText(counts, sizes, word)) ??
    fits(countPackText(largestOnly(n, sizes), sizes, word))
  );
}

/** What to buy, in words, or null when no pack can be suggested. */
export function packSuggestion(
  quantity: { readonly amount: number; readonly unit: 'g' | 'each' },
  info: PackInfo,
): string | null {
  const { packs: sizes } = info;
  if (quantity.unit === 'each') {
    return sizes?.unit === 'each' ? countPacks(quantity.amount, sizes.sizes, info.countWord) : null;
  }
  if (sizes === null) return null;
  if (sizes.unit === 'each') {
    if (info.gramsPerEach === null) return null;
    const n = Math.max(1, Math.ceil(quantity.amount / info.gramsPerEach - 1e-9));
    return countPacks(n, sizes.sizes, info.countWord);
  }
  if (info.loose && info.gramsPerEach !== null && info.countWord !== null) {
    const n = Math.max(1, Math.ceil(quantity.amount / info.gramsPerEach - 1e-9));
    return fits(itemsText(n, info.countWord));
  }
  const unitsNeed = Math.ceil(
    quantity.amount * (sizes.unit === 'ml' ? MAX_ML_PER_G : 1) * PACK_UNITS_PER_G - 1e-9,
  );
  const unitSizes = sizes.sizes.map((s) => Math.max(1, Math.floor(s * PACK_UNITS_PER_G + 1e-9)));
  const counts = choosePacks(unitsNeed, unitSizes);
  if (counts === null) return null;
  const sized = { ...sizes, unit: sizes.unit };
  return (
    fits(sizePackText(counts, sized)) ??
    fits(sizePackText(largestOnly(unitsNeed, unitSizes), sized))
  );
}
