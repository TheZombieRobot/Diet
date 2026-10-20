/**
 * Linking garden and pantry rows to an ingredient id (checklist item 19; design 2.1; G12, G13). A
 * row links when the owner picks a suggestion, or when its name exactly matches one food's name or
 * alias; nothing else is guessed. Linking reads names only, never a nutrient figure, so it works
 * before the ingredient dataset (item 18) and under any licence.
 *
 * Item 18 moves CatalogueEntry, Catalogue, PRE_DATASET_CATALOGUE and matchKey into its
 * foods/names.ts and turns searchCatalogue and exactMatch into thin wrappers over its searchFoods
 * and exactFoodMatch, with these defaults (item 18 design 1.6).
 */
import { DEFAULT_GARDEN_NAME } from '../storage/defaults';
import type { RefId } from '../storage/primitives';

/** What linking needs from an ingredient: no nutrients, so it works before item 18 and under any licence. */
export interface CatalogueEntry {
  readonly id: RefId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly gardenFlag: boolean;
}

export interface Catalogue {
  readonly entries: readonly CatalogueEntry[];
  /** False until the ingredient dataset exists: unlinked rows then show no "not matched" note. */
  readonly hasDataset: boolean;
}

/** Until item 18 ships the dataset: the one seed id the database already uses (STORAGE_DESIGN section 6). */
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

const keysOf = (entry: CatalogueEntry): string[] => [entry.name, ...entry.aliases].map(matchKey);

/** 0: the name or an alias starts with the query; 1: one contains it; null: no match. */
function rankOf(entry: CatalogueEntry, key: string): 0 | 1 | null {
  const keys = keysOf(entry);
  if (keys.some((k) => k.startsWith(key))) return 0;
  if (keys.some((k) => k.includes(key))) return 1;
  return null;
}

/**
 * Suggestions for a typed name: prefix matches before contains, then (by default) garden foods
 * first, then by name, then in catalogue order; at most 6. A query under 2 characters (after
 * matchKey) matches nothing.
 */
export function searchCatalogue(
  catalogue: Catalogue,
  query: string,
  options: { readonly gardenFirst?: boolean; readonly limit?: number } = {},
): CatalogueEntry[] {
  const key = matchKey(query);
  if (key.length < 2) return [];
  const gardenFirst = options.gardenFirst ?? true;
  return catalogue.entries
    .map((entry, index) => ({ entry, index, rank: rankOf(entry, key) }))
    .filter((r): r is { entry: CatalogueEntry; index: number; rank: 0 | 1 } => r.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (gardenFirst ? Number(b.entry.gardenFlag) - Number(a.entry.gardenFlag) : 0) ||
        a.entry.name.localeCompare(b.entry.name, 'en-NZ') ||
        a.index - b.index,
    )
    .slice(0, options.limit ?? 6)
    .map((r) => r.entry);
}

/** The entry whose name or an alias has the same matchKey as `name`, when exactly one entry does. */
export function exactMatch(catalogue: Catalogue, name: string): CatalogueEntry | null {
  const key = matchKey(name);
  if (key === '') return null;
  const found = catalogue.entries.filter((entry) => keysOf(entry).includes(key));
  return found.length === 1 ? (found[0] ?? null) : null;
}

/**
 * The ingredient id to store for a typed name (G12), first rule that applies: a suggestion the
 * owner picked, while the name still matches it; the stored link while the name is unchanged (even
 * when that id is not in the catalogue: an owner's own food, a removed seed, a restored backup);
 * the one entry the name matches exactly; otherwise none. The pick comes first so that an
 * unlinked row can be linked by picking its food without retyping its name.
 */
export function linkFor(
  catalogue: Catalogue,
  input: {
    readonly name: string;
    readonly picked: RefId | null;
    readonly stored: { readonly name: string; readonly ingredientId: RefId | null } | null;
  },
): RefId | null {
  const key = matchKey(input.name);
  const picked = catalogue.entries.find((entry) => entry.id === input.picked);
  if (picked !== undefined && keysOf(picked).includes(key)) return picked.id;
  if (input.stored !== null && key === matchKey(input.stored.name)) {
    return input.stored.ingredientId;
  }
  return exactMatch(catalogue, input.name)?.id ?? null;
}

/**
 * The row a candidate would duplicate (G17): the first other row with the same ingredient id, or
 * the same name by matchKey. "Silverbeet " and "silverbeet" are duplicates; "Silverbeet stems" is not.
 */
export function findDuplicate<
  T extends { readonly id: string; readonly ingredientId: RefId | null; readonly name: string },
>(
  rows: readonly T[],
  candidate: { readonly ingredientId: RefId | null; readonly name: string },
  exceptId: string | null,
): T | null {
  const key = matchKey(candidate.name);
  return (
    rows.find(
      (row) =>
        row.id !== exceptId &&
        ((candidate.ingredientId !== null && row.ingredientId === candidate.ingredientId) ||
          matchKey(row.name) === key),
    ) ?? null
  );
}
