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
 * - Recipe allergens are the union of the stored list and every line's current effective
 *   allergens; a line that does not resolve, or has unknown allergens, makes them unknown.
 */
import { type Allergen, type AllergenFacts, sortAllergens } from './allergens';
import type {
  IngredientChange,
  IngredientOverrideRecord,
  IngredientRecord,
  RecipeRecord,
} from './records';

/** The union of two allergen lists; null (unknown) on either side is unknown. */
export function effectiveAllergens(
  seed: readonly Allergen[] | null,
  added: readonly Allergen[] | null,
): Allergen[] | null {
  if (seed === null || added === null) return null;
  return sortAllergens([...seed, ...added]);
}

function applyChange(ingredient: IngredientRecord, change: IngredientChange): IngredientRecord {
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
      return { ...ingredient, allergens: effectiveAllergens(ingredient.allergens, change.value) };
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
  seed: IngredientRecord,
  override: IngredientOverrideRecord | null,
): IngredientRecord {
  if (override === null) return seed;
  if (override.seedId !== seed.id)
    throw new RangeError('The override belongs to a different seed ingredient');
  return override.changes.reduce(applyChange, seed);
}

/** Looks an ingredient up by id: the owner's own foods, then the seed dataset with any override. */
export type IngredientResolver = (id: string) => IngredientRecord | null;

/**
 * A resolver over the current seed dataset, the owner's overrides and the owner's own foods. An
 * override whose seed is not in the dataset is never used.
 */
export function ingredientResolver(
  seeds: readonly IngredientRecord[],
  overrides: readonly IngredientOverrideRecord[],
  own: readonly IngredientRecord[],
): IngredientResolver {
  const seedById = new Map(seeds.map((s) => [s.id, s]));
  const overrideById = new Map(overrides.map((o) => [o.seedId, o]));
  const ownById = new Map(own.map((i) => [i.id, i]));
  return (id) => {
    const mine = ownById.get(id);
    if (mine !== undefined) return mine;
    const seed = seedById.get(id);
    return seed === undefined ? null : effectiveIngredient(seed, overrideById.get(id) ?? null);
  };
}

/**
 * Every allergen check (planner, substitutions, the recipe screen) uses this: the stored list plus
 * the current effective allergens of every line's ingredient (HS-24). `allergensUnknown` is derived,
 * never stored (C43).
 */
export function recipeAllergens(
  recipe: Pick<RecipeRecord, 'allergens' | 'lines'>,
  resolve: IngredientResolver,
): AllergenFacts {
  const found: Allergen[] = [...recipe.allergens];
  let allergensUnknown = false;
  for (const line of recipe.lines) {
    const ingredient = resolve(line.ingredientId);
    if (ingredient === null || ingredient.allergens === null) allergensUnknown = true;
    else found.push(...ingredient.allergens);
  }
  return { allergens: sortAllergens(found), allergensUnknown };
}
