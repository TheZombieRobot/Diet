/**
 * Seasons and pack sizes as words (item 18 design 3.5; C69, C110, GL-03, NU-07). Pack sizes are
 * typical sizes, never prices and never the store's (HS-16); seasons are a general guide.
 */
import { foods } from '../copy/health';
import { fillTemplate, joinList } from '../copy/template';
import { formatNumber } from './figures';
import type { CountWord, PackUnit, SeedPacks } from './types';

export interface SeasonRun {
  readonly from: number;
  readonly to: number;
}

/**
 * Consecutive months as runs, a run that ends in December joined with one that starts in January
 * (September to March is one run), ordered by the month each run starts in.
 */
export function seasonRuns(months: readonly number[]): SeasonRun[] {
  for (const m of months) {
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new RangeError('A month is 1 to 12');
  }
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const runs: { from: number; to: number }[] = [];
  for (const m of sorted) {
    const last = runs.at(-1);
    if (last !== undefined && last.to === m - 1) last.to = m;
    else runs.push({ from: m, to: m });
  }
  const first = runs[0];
  const last = runs.at(-1);
  if (runs.length > 1 && first?.from === 1 && last?.to === 12) {
    runs.shift();
    last.to = first.to;
  }
  return runs.sort((a, b) => a.from - b.from);
}

/** "September to March", "All year", "April to June and October to November"; null for no season. */
export function seasonText(months: readonly number[]): string | null {
  const runs = seasonRuns(months);
  if (runs.length === 0) return null;
  const first = runs[0];
  if (runs.length === 1 && first?.from === 1 && first.to === 12) return foods.detail.seasonAllYear;
  const name = (m: number) => foods.months[m - 1] ?? '';
  return joinList(
    runs.map((r) =>
      r.from === r.to
        ? name(r.from)
        : fillTemplate(foods.detail.seasonRange, { from: name(r.from), to: name(r.to) }),
    ),
    foods.listComma,
    foods.listAnd,
  );
}

const oneDecimal = (n: number): string => formatNumber(Math.round(n * 10) / 10);

/** "500 g", "1.5 kg", "300 mL", "1 L"; a count for 'each'. */
export function sizeText(unit: PackUnit, size: number): string {
  switch (unit) {
    case 'g':
      return size < 1000 ? `${oneDecimal(size)} g` : `${oneDecimal(size / 1000)} kg`;
    case 'ml':
      return size < 1000 ? `${oneDecimal(size)} mL` : `${oneDecimal(size / 1000)} L`;
    case 'each':
      return formatNumber(size);
  }
}

/**
 * "Sold by the bunch", "Packs of 6 or 12 eggs", "500 g or 1 kg bags, also sold loose". A counted
 * pack needs its count word (rule CR9 makes that so for every seed).
 */
export function packsText(packs: SeedPacks, loose: boolean, countWord: CountWord | null): string {
  if (packs.unit === 'each') {
    if (countWord === null) throw new RangeError('A counted pack needs its count word');
    if (packs.sizes.length === 1 && packs.sizes[0] === 1)
      return fillTemplate(foods.detail.packsByThe, { one: countWord.one });
    return fillTemplate(foods.detail.packsOf, {
      list: joinList(packs.sizes.map(formatNumber), foods.listComma, foods.listOr),
      many: countWord.many,
    });
  }
  const sizes = joinList(
    packs.sizes.map((s) => sizeText(packs.unit, s)),
    foods.listComma,
    foods.listOr,
  );
  const packed =
    packs.container === null
      ? sizes
      : fillTemplate(foods.detail.packsIn, { sizes, many: packs.container.many });
  return loose ? fillTemplate(foods.detail.packsLoose, { sizes: packed }) : packed;
}
