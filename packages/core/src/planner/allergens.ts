/**
 * The allergen decision for one meal a plan write writes (item 22 design 3.7; HS-24, HS-R20, C43,
 * C107, FL-07, P41; V13, V18). Read live at every write against the profile as it is then.
 *
 * - 'ok' is always allowed.
 * - 'conflict' (the recipe contains a blocked allergen) only as the owner's own add, after a
 *   confirmation that named every live conflict and, when its allergens are not fully known, every
 *   other blocked allergen (item 20's review: a conflict never hides the label check).
 * - 'unknown' (something is blocked and the recipe's allergens are not fully known) only as the
 *   owner's own add (or, for the later item that builds it, an accepted suggested swap), after a
 *   label check that named every live blocked allergen.
 * Auto-fill, copy, template and repeat never write either, whatever is confirmed (P41 rules 1 and
 * 4). A confirmation covers only what it named: an allergen listed, or Gluten-free household turned
 * on for a shared meal, after the owner confirmed, refuses the write.
 */
import { type MealSharing, type Serving } from '../recipes/allergens';
import type { Allergen } from '../storage/allergens';
import type { RefId } from '../storage/primitives';
import type { PlanWriteKind } from '../targets/energy';

export function mealSharing(householdServes: number): MealSharing {
  return householdServes > 1 ? 'shared' : 'own';
}

/** What the owner was shown and confirmed for one recipe; never stored. */
export interface AllergenConfirmation {
  readonly recipeId: RefId;
  readonly allergens: readonly Allergen[];
}

export type PlanAllergenRefusal = 'allergen-conflict' | 'label-check-needed';

const covers = (
  confirmations: readonly AllergenConfirmation[],
  recipeId: RefId,
  needed: readonly Allergen[],
): boolean =>
  confirmations.some(
    (c) => c.recipeId === recipeId && needed.every((a) => c.allergens.includes(a)),
  );

export function planAllergenDecision(input: {
  readonly kind: PlanWriteKind;
  /** blockedAllergens(profile, sharing), live. */
  readonly blocked: readonly Allergen[];
  /** servingFor(blocked, facts). */
  readonly serving: { readonly serving: Serving; readonly conflicts: readonly Allergen[] };
  /** The recipe's allergens are not fully known (its facts' allergensUnknown). */
  readonly allergensUnknown: boolean;
  readonly recipeId: RefId;
  readonly labelChecked: readonly AllergenConfirmation[];
  readonly conflictConfirmed: readonly AllergenConfirmation[];
}):
  { readonly allowed: true } | { readonly allowed: false; readonly refusal: PlanAllergenRefusal } {
  const { kind, serving, recipeId } = input;
  switch (serving.serving) {
    case 'ok':
      return { allowed: true };
    case 'conflict':
      return kind === 'owner-meal' &&
        covers(
          input.conflictConfirmed,
          recipeId,
          input.allergensUnknown ? input.blocked : serving.conflicts,
        )
        ? { allowed: true }
        : { allowed: false, refusal: 'allergen-conflict' };
    case 'unknown':
      return (kind === 'owner-meal' || kind === 'suggested-swap') &&
        covers(input.labelChecked, recipeId, input.blocked)
        ? { allowed: true }
        : { allowed: false, refusal: 'label-check-needed' };
  }
}
