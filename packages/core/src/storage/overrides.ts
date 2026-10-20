/**
 * Owner corrections to seed ingredients, merged over the CURRENT seed at read time (storage spec
 * section 4.7; D2; C43, C69, HS-24).
 *
 * - effectiveIngredient applies each change over the current seed, so a later dataset fix to any
 *   field the owner did not change still reaches them.
 * - Allergens are never taken from an override alone: the effective list is the union of the
 *   seed's and the override's addAllergens, and null on either side means unknown. An owner cannot
 *   remove an allergen a seed lists, and a later update that adds one still warns.
 * - An override whose seed no longer exists is kept but ignored (it is never looked up).
 * - Recipe allergens are the union of the stored list and every line's current allergens, known
 *   ones included even when a line's list is not complete; a line that does not resolve, or has
 *   allergens not fully known, makes them unknown.
 *
 * Every reader sees an ingredient as an IngredientView (item 18): the stored shape with a source
 * that may be 'not-loaded' (a seed whose figures are not in the app yet) and the allergens split
 * in two, so a brand-dependent list can never be read as complete. A view is never stored: it is
 * not assignable to IngredientRecord, and the ingredients validator refuses its source.
 */
import { type Allergen, type AllergenFacts, sortAllergens } from './allergens';
import type { NutritionSource } from '../nutrition/confidence';
import type {
  IngredientChange,
  IngredientOverrideRecord,
  IngredientRecord,
  RecipeRecord,
} from './records';

/** Where a food's figures come from when read. 'not-loaded': a seed whose figures are not in the app yet (item 18). Never stored. */
export type FoodSource = NutritionSource | 'not-loaded';

/**
 * An ingredient as every reader sees it: the stored shape, with the seed-only source, and the
 * allergens split in two so that a brand-dependent list can never be read as complete. Never stored.
 */
export interface IngredientView extends Readonly<Omit<IngredientRecord, 'source' | 'allergens'>> {
  readonly source: FoodSource;
  /** The full list when it is complete; null when other allergens may be present. Read it only through foodAllergenFacts. */
  readonly allergensIfComplete: readonly Allergen[] | null;
  /** Allergens it is known to contain, complete or not. Never used to clear a warning. */
  readonly allergensAtLeast: readonly Allergen[];
}

/** The union of two allergen lists; null (unknown) on either side is unknown. */
export function effectiveAllergens(
  seed: readonly Allergen[] | null,
  added: readonly Allergen[] | null,
): Allergen[] | null {
  if (seed === null || added === null) return null;
  return sortAllergens([...seed, ...added]);
}

/** An owner's own food (the ingredients store) as a view: a null list is not complete. */
export function viewOfOwnIngredient(record: IngredientRecord): IngredientView {
  const { allergens, ...rest } = record;
  return {
    ...rest,
    allergensIfComplete: allergens === null ? null : [...allergens],
    allergensAtLeast: allergens === null ? [] : [...allergens],
  };
}

function applyChange(ingredient: IngredientView, change: IngredientChange): IngredientView {
  switch (change.field) {
    case 'name':
      return { ...ingredient, name: change.value };
    case 'aliases':
      return { ...ingredient, aliases: [...change.value] };
    case 'aisle':
      return { ...ingredient, aisle: change.value };
    case 'packSizes':
      return {
        ...ingredient,
        packSizesG: [...change.value.packSizesG],
        packSizeSource: 'owner',
        packSizeEnteredAt: change.value.enteredAt,
      };
    case 'nutrition': {
      const v = change.value;
      return {
        ...ingredient,
        nutrientsPer100g: { ...v.nutrientsPer100g },
        unknownNutrients: [...v.unknownNutrients],
        carbBasisAsEntered: v.carbBasisAsEntered,
        nutrientBasis: v.nutrientBasis,
        source: v.source,
        sourceCitation: v.sourceCitation,
      };
    }
    case 'addAllergens':
      return {
        ...ingredient,
        allergensIfComplete: effectiveAllergens(ingredient.allergensIfComplete, change.value),
        allergensAtLeast: sortAllergens([...ingredient.allergensAtLeast, ...(change.value ?? [])]),
      };
    case 'substitutes':
      return { ...ingredient, substitutes: [...change.value] };
    case 'gramsPerEach':
      return { ...ingredient, gramsPerEach: change.value };
    case 'servingSizeG':
      return { ...ingredient, servingSizeG: change.value };
    case 'seasonMonths':
      return { ...ingredient, seasonMonths: [...change.value] };
    case 'gardenFlag':
      return { ...ingredient, gardenFlag: change.value };
  }
}

/** The seed ingredient with the owner's changes applied (or the seed itself when there is no override). */
export function effectiveIngredient(
  seed: IngredientView,
  override: IngredientOverrideRecord | null,
): IngredientView {
  if (override === null) return seed;
  if (override.seedId !== seed.id)
    throw new RangeError('The override belongs to a different seed ingredient');
  return override.changes.reduce(applyChange, seed);
}

/** Looks an ingredient up by id: the owner's own foods, then the seed dataset with any override. */
export type IngredientResolver = (id: string) => IngredientView | null;

/**
 * A resolver over the current seed views, the owner's overrides and the owner's own foods. An
 * override whose seed is not in the dataset is never used.
 */
export function ingredientResolver(
  seeds: readonly IngredientView[],
  overrides: readonly IngredientOverrideRecord[],
  own: readonly IngredientRecord[],
): IngredientResolver {
  const seedById = new Map(seeds.map((s) => [s.id, s]));
  const overrideById = new Map(overrides.map((o) => [o.seedId, o]));
  const ownById = new Map(own.map((i) => [i.id, i]));
  return (id) => {
    const mine = ownById.get(id);
    if (mine !== undefined) return viewOfOwnIngredient(mine);
    const seed = seedById.get(id);
    return seed === undefined ? null : effectiveIngredient(seed, overrideById.get(id) ?? null);
  };
}

/**
 * The only way to read a food's allergens for a check (X6): the full list when it is complete,
 * otherwise what it is known to contain with allergensUnknown set. Peanut butter therefore
 * reports peanut and "unknown", never just "unknown", so a listed allergen still conflicts.
 */
export function foodAllergenFacts(
  view: Pick<IngredientView, 'allergensIfComplete' | 'allergensAtLeast'>,
): AllergenFacts {
  return {
    allergens: [...(view.allergensIfComplete ?? view.allergensAtLeast)],
    allergensUnknown: view.allergensIfComplete === null,
  };
}

/**
 * Every allergen check (planner, substitutions, the recipe screen) uses this: the stored list plus
 * the current allergens of every line's ingredient, incomplete lines' known allergens included
 * (HS-24, N8). `allergensUnknown` is derived, never stored (C43).
 */
export function recipeAllergens(
  recipe: Pick<RecipeRecord, 'allergens' | 'lines'>,
  resolve: IngredientResolver,
): AllergenFacts {
  const found: Allergen[] = [...recipe.allergens];
  let allergensUnknown = false;
  for (const line of recipe.lines) {
    const ingredient = resolve(line.ingredientId);
    if (ingredient === null) {
      allergensUnknown = true;
      continue;
    }
    const facts = foodAllergenFacts(ingredient);
    found.push(...facts.allergens);
    if (facts.allergensUnknown) allergensUnknown = true;
  }
  return { allergens: sortAllergens(found), allergensUnknown };
}
