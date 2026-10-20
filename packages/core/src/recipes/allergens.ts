/**
 * A recipe's allergens (item 20 design 4.4; HS-24, C43, C107, FL-07; item 18–20 contract 7).
 * Every read is item 18's (foodAllergenFacts, recipeAllergens), so a brand-dependent food still
 * reports what it is known to contain (tofu: soy; canned tuna: fish), and every decision is the
 * merged allergenWarning, so allergens that are not fully known are never treated as absent. An
 * owner's copy keeps every allergen of the recipe it was made from, whatever its stored list says.
 */
import {
  type Allergen,
  type AllergenFacts,
  allergenWarning,
  expandUserAllergens,
  GLUTEN_CEREALS,
  sortAllergens,
} from '../storage/allergens';
import { foodAllergenFacts, recipeAllergens } from '../storage/overrides';
import type { RefId } from '../storage/primitives';
import type { ProfileRecord, RecipeLine } from '../storage/records';
import type { RecipeFoods } from './foodKind';
import type { RecipeData } from './types';

export interface RecipeAllergenView {
  /** recipeAllergens (item 18) ∪ the origin chain's allergens (owner copies). */
  readonly facts: AllergenFacts;
  /** In facts but in no current line: listed because of the recipe it was made from. */
  readonly inheritedOnly: readonly Allergen[];
  /** Indices of the lines whose allergens are not fully known (or that do not resolve). */
  readonly checkLabelLines: readonly number[];
}

/** A seed recipe or a stored one, as far as its allergens go. */
export interface AllergenSource {
  readonly allergens: readonly Allergen[];
  readonly lines: readonly RecipeLine[];
  readonly derivedFromRecipeId: RefId | null;
}

/** What the lines are known to contain, complete or not. */
function linesAllergens(
  lines: readonly Pick<RecipeLine, 'ingredientId'>[],
  foods: RecipeFoods,
): Allergen[] {
  return lines.flatMap((line) => {
    const view = foods.resolve(line.ingredientId);
    return view === null ? [] : [...foodAllergenFacts(view).allergens];
  });
}

/**
 * An owner copy's origin: the recipe it was made from, then that recipe's origin, each id
 * visited once (a tampered loop ends). A seed adds its declared list and its lines' allergens; a
 * stored recipe its stored list and its lines'. An origin found nowhere adds nothing.
 */
export function originAllergens(
  derivedFromRecipeId: RefId | null,
  data: RecipeData,
  stored: ReadonlyMap<RefId, AllergenSource>,
  foods: RecipeFoods,
): Allergen[] {
  const found: Allergen[] = [];
  const seen = new Set<RefId>();
  let next = derivedFromRecipeId;
  while (next !== null && !seen.has(next)) {
    seen.add(next);
    const id: RefId = next;
    const seed = data.recipes.find((r) => r.id === id);
    const source: AllergenSource | undefined =
      seed === undefined ? stored.get(id) : { ...seed, derivedFromRecipeId: null };
    if (source === undefined) break;
    found.push(...source.allergens, ...linesAllergens(source.lines, foods));
    next = source.derivedFromRecipeId;
  }
  return sortAllergens(found);
}

/** The allergens every screen and the planner read for a recipe (P14). */
export function recipeAllergenView(
  recipe: AllergenSource,
  foods: RecipeFoods,
  origin: readonly Allergen[],
): RecipeAllergenView {
  const base = recipeAllergens(
    { allergens: [...recipe.allergens], lines: [...recipe.lines] },
    foods.resolve,
  );
  const allergens = sortAllergens([...base.allergens, ...origin]);
  const inLines = new Set(linesAllergens(recipe.lines, foods));
  const checkLabelLines = recipe.lines.flatMap((line, index) => {
    const view = foods.resolve(line.ingredientId);
    return view === null || foodAllergenFacts(view).allergensUnknown ? [index] : [];
  });
  return {
    facts: { allergens, allergensUnknown: base.allergensUnknown },
    inheritedOnly: allergens.filter((a) => !inLines.has(a)),
    checkLabelLines,
  };
}

/** The allergens a write stores: it can only grow a list (HS-24). */
export function allergenUnion(input: {
  readonly declared: readonly Allergen[];
  readonly previous: readonly Allergen[] | null;
  readonly origin: readonly Allergen[];
  readonly lines: readonly Pick<RecipeLine, 'ingredientId'>[];
  readonly foods: RecipeFoods;
}): Allergen[] {
  return sortAllergens([
    ...input.declared,
    ...(input.previous ?? []),
    ...input.origin,
    ...linesAllergens(input.lines, input.foods),
  ]);
}

/** 'own': the owner's serve (the recipe screens); 'shared': a household meal (item 22). */
export type MealSharing = 'own' | 'shared';

/**
 * The allergens a meal must not contain: the profile's (gluten expanded), plus the four gluten
 * cereals for a shared meal while Gluten-free household is on (FL-07).
 */
export function blockedAllergens(
  profile: Pick<ProfileRecord, 'allergens' | 'glutenFreeHousehold'>,
  meal: MealSharing,
): Allergen[] {
  const listed = expandUserAllergens(profile.allergens);
  return meal === 'shared' && profile.glutenFreeHousehold
    ? sortAllergens([...listed, ...GLUTEN_CEREALS])
    : listed;
}

export type Serving = 'ok' | 'conflict' | 'unknown';

/**
 * A thin mapping over the merged allergenWarning (contract 7.2): 'conflict' when the recipe
 * contains a blocked allergen, 'unknown' when its allergens are not fully known and something is
 * blocked, else 'ok'. 'unknown' is never treated as 'ok' (P41).
 */
export function servingFor(
  blocked: readonly Allergen[],
  facts: AllergenFacts,
): { readonly serving: Serving; readonly conflicts: Allergen[] } {
  const warning = allergenWarning(blocked, facts);
  const serving: Serving =
    warning.conflicts.length > 0 ? 'conflict' : warning.warn ? 'unknown' : 'ok';
  return { serving, conflicts: warning.conflicts };
}

/** The gluten cereals a recipe is known to contain (P15). */
export function glutenCerealsIn(facts: AllergenFacts): Allergen[] {
  const cereals: readonly Allergen[] = GLUTEN_CEREALS;
  return sortAllergens(facts.allergens.filter((a) => cereals.includes(a)));
}
