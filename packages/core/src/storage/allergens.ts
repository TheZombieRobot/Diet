/**
 * Allergens (DOC_REVIEW C43; D34). One vocabulary for the profile, ingredients and recipes, from
 * the mandatory declarations of the FSANZ Food Standards Code, Standard 1.2.3, which apply in New
 * Zealand. 'gluten' is a profile-only alias that expands to the four gluten cereals, so a user's
 * 'gluten' blocks wheat, barley, oats and rye, while a user's 'wheat' blocks wheat only.
 */

export const ALLERGENS = Object.freeze([
  'peanut',
  'tree-nut',
  'milk',
  'egg',
  'fish',
  'crustacea',
  'mollusc',
  'sesame',
  'soy',
  'lupin',
  'wheat',
  'barley',
  'oats',
  'rye',
  'sulphites',
] as const);
export type Allergen = (typeof ALLERGENS)[number];

export const GLUTEN_CEREALS = Object.freeze([
  'wheat',
  'barley',
  'oats',
  'rye',
] as const satisfies readonly Allergen[]);

export const USER_ALLERGENS = Object.freeze([...ALLERGENS, 'gluten'] as const);
export type UserAllergen = (typeof USER_ALLERGENS)[number];

/** Sorts and de-duplicates allergens into ALLERGENS order. */
export function sortAllergens(list: Iterable<Allergen>): Allergen[] {
  const present = new Set(list);
  return ALLERGENS.filter((a) => present.has(a));
}

/** The allergens a profile's list blocks: 'gluten' becomes wheat, barley, oats and rye (C43). */
export function expandUserAllergens(list: readonly UserAllergen[]): Allergen[] {
  return sortAllergens(
    list.flatMap((a): readonly Allergen[] => (a === 'gluten' ? GLUTEN_CEREALS : [a])),
  );
}

/** What a food or recipe carries, as resolved at read time (overrides.ts, recipeAllergens). */
export interface AllergenFacts {
  readonly allergens: readonly Allergen[];
  /** True when any part has unknown allergens or does not resolve; never offered as safe (C43). */
  readonly allergensUnknown: boolean;
}

export interface AllergenWarning {
  /** The profile's allergens that the food carries, in ALLERGENS order. */
  readonly conflicts: Allergen[];
  /** The food's allergens are not fully known, so it is never shown as free of the listed ones. */
  readonly unknown: boolean;
  /** True when the planner or substitution screen must warn: a conflict, or unknown allergens while the profile lists any. */
  readonly warn: boolean;
}

/**
 * The warning the planner and substitutions show for a food (HS-24, C43): a listed allergen is
 * never introduced silently, and a food whose allergens are unknown is never offered as safe for
 * a listed allergen without saying so.
 */
export function allergenWarning(
  profile: readonly UserAllergen[],
  food: AllergenFacts,
): AllergenWarning {
  const blocked = new Set(expandUserAllergens(profile));
  const conflicts = sortAllergens(food.allergens.filter((a) => blocked.has(a)));
  const unknown = food.allergensUnknown;
  return { conflicts, unknown, warn: conflicts.length > 0 || (unknown && blocked.size > 0) };
}
