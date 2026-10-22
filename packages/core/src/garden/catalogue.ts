/**
 * Linking garden and pantry rows to an ingredient id (checklist item 19; design 2.1; G12, G13). A
 * row links when the owner picks a suggestion, or when its name exactly matches one food's name or
 * alias; nothing else is guessed. Linking reads names only, never a nutrient figure, so it works
 * before the ingredient dataset (item 18) and under any licence.
 *
 * The types, matchKey and PRE_DATASET_CATALOGUE live in item 18's foods/names.ts; searchCatalogue
 * and exactMatch are thin wrappers over its searchFoods and exactFoodMatch that keep item 19's
 * defaults (item 18 design 1.6).
 */
import {
  type Catalogue,
  type CatalogueEntry,
  exactFoodMatch,
  matchKey,
  searchFoods,
} from '../foods/names';
import type { RefId } from '../storage/primitives';

const keysOf = (entry: CatalogueEntry): string[] => [entry.name, ...entry.aliases].map(matchKey);

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
  return searchFoods(catalogue.entries, query, {
    gardenFirst: options.gardenFirst ?? true,
    limit: options.limit ?? 6,
  });
}

/** The entry whose name or an alias has the same matchKey as `name`, when exactly one entry does. */
export function exactMatch(catalogue: Catalogue, name: string): CatalogueEntry | null {
  return exactFoodMatch(catalogue.entries, name);
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

/**
 * The row a save would duplicate (G17), or null: every new row is checked, and an edit only when
 * it changes the name or the link. So a pair that exists already (from an old backup, or from setup
 * before it checked) stays editable, and only a change into a duplicate is refused. The garden
 * screen, the setup step and the repositories all use this rule.
 */
export function duplicateOnSave<
  T extends { readonly id: string; readonly ingredientId: RefId | null; readonly name: string },
>(
  rows: readonly T[],
  candidate: { readonly ingredientId: RefId | null; readonly name: string },
  previous: {
    readonly id: string;
    readonly ingredientId: RefId | null;
    readonly name: string;
  } | null,
): T | null {
  if (
    previous !== null &&
    previous.ingredientId === candidate.ingredientId &&
    matchKey(previous.name) === matchKey(candidate.name)
  ) {
    return null;
  }
  return findDuplicate(rows, candidate, previous?.id ?? null);
}
