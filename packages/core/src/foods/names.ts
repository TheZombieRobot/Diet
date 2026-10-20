/**
 * Matching food names (item 18 design 3.6; item 19 G12, G13). Item 19's rules, made generic: the
 * Foods screen searches the catalogue with them, and item 19's garden and pantry forms link a typed
 * name to an ingredient through thin wrappers (searchCatalogue, exactMatch) that keep its defaults.
 * Names and aliases are unique by matchKey across the catalogue (rule CR4), so a typed name links
 * to at most one seed.
 */
import { DEFAULT_GARDEN_NAME } from '../storage/defaults';
import type { RefId } from '../storage/primitives';
import type { IngredientView } from '../storage/overrides';
import type { IngredientRecord } from '../storage/records';

/** What linking needs from an ingredient: no nutrients, so it works under any licence. */
export interface CatalogueEntry {
  readonly id: RefId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly gardenFlag: boolean;
}

export interface Catalogue {
  readonly entries: readonly CatalogueEntry[];
  /** False only before the dataset loads: item 19 then shows no "not matched" note. */
  readonly hasDataset: boolean;
}

/** Before the dataset is read: the one seed id the database already uses (STORAGE_DESIGN section 6). */
export const PRE_DATASET_CATALOGUE: Catalogue = Object.freeze({
  entries: Object.freeze([
    Object.freeze({
      id: 'seed:silverbeet',
      name: DEFAULT_GARDEN_NAME,
      aliases: Object.freeze([]),
      gardenFlag: true,
    }),
  ]),
  hasDataset: false,
});

/** NFKD, combining marks removed, lower case, runs of whitespace as one space, trimmed. */
export function matchKey(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The shortest query that searches (item 19's 2-character rule). */
export const MIN_QUERY_LENGTH = 2;

interface Named {
  readonly name: string;
  readonly aliases: readonly string[];
}

/** 0: the name or an alias starts with the query; 1: one contains it; null: no match. */
function rankOf(item: Named, key: string): 0 | 1 | null {
  const keys = [item.name, ...item.aliases].map(matchKey);
  if (keys.some((k) => k.startsWith(key))) return 0;
  if (keys.some((k) => k.includes(key))) return 1;
  return null;
}

/**
 * Foods whose name or an alias matches `query`: prefix matches first, then contains; then, with
 * `gardenFirst`, garden foods first; then by name; then in input order. A query under 2
 * characters (after matchKey) matches nothing.
 */
export function searchFoods<T extends Named & { readonly gardenFlag: boolean }>(
  items: readonly T[],
  query: string,
  options: { readonly gardenFirst?: boolean; readonly limit?: number } = {},
): T[] {
  const key = matchKey(query);
  if (key.length < MIN_QUERY_LENGTH) return [];
  const gardenFirst = options.gardenFirst ?? false;
  const ranked = items
    .map((item, index) => ({ item, index, rank: rankOf(item, key) }))
    .filter((r): r is { item: T; index: number; rank: 0 | 1 } => r.rank !== null);
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      (gardenFirst ? Number(b.item.gardenFlag) - Number(a.item.gardenFlag) : 0) ||
      a.item.name.localeCompare(b.item.name, 'en-NZ') ||
      a.index - b.index,
  );
  const found = ranked.map((r) => r.item);
  return options.limit === undefined ? found : found.slice(0, options.limit);
}

/** The one item whose name or an alias has the same matchKey as `name`; null for none or several. */
export function exactFoodMatch<T extends Named>(items: readonly T[], name: string): T | null {
  const key = matchKey(name);
  if (key === '') return null;
  const found = items.filter((item) =>
    [item.name, ...item.aliases].some((n) => matchKey(n) === key),
  );
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** Every seed (its effective name and aliases), then every own ingredient, as catalogue entries. */
export function catalogueEntriesFrom(
  seeds: readonly Pick<IngredientView, 'id' | 'name' | 'aliases' | 'gardenFlag'>[],
  own: readonly Pick<IngredientRecord, 'id' | 'name' | 'aliases' | 'gardenFlag'>[],
): CatalogueEntry[] {
  return [...seeds, ...own].map((food) =>
    Object.freeze({
      id: food.id,
      name: food.name,
      aliases: Object.freeze([...food.aliases]),
      gardenFlag: food.gardenFlag,
    }),
  );
}
