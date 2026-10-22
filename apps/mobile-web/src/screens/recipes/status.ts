import type { RefId } from '@diet/core';
import { privacy, recipes } from '@diet/core/copy/health';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';
import { createStore } from '../../store';

/**
 * What the recipe page says after a swap, an Undo or "Go back to the original recipe" (item 20
 * design 3.5): one status, shown only on the page of the recipe it names. Any button press on the
 * page clears it, and so does Shell when the route moves to another recipe or screen.
 */
export type RecipeStatus =
  | {
      readonly recipeId: RefId;
      readonly kind: 'created' | 'updated';
      readonly from: string;
      readonly to: string;
    }
  | { readonly recipeId: RefId; readonly kind: 'undone' | 'removed' };

export const swapStatusStore = createStore<RecipeStatus | null>(null);

/**
 * Where a recipe page keeps "Cooking for" on its history entry (navigation's keepOnEntry), with
 * the recipe it belongs to: Back returns to it, and a swap or Undo carries it to the recipe that
 * replaces the page. The nutrition card never reads it (HS-23).
 */
export const COOKING_FOR = 'dietCookingFor';

export const cookingForOn = (id: RefId, serves: number): Record<string, unknown> => ({
  [COOKING_FOR]: { id, serves },
});

/** What a refused removal says (design 3.6): "Go back to the original recipe", or Undo after a swap. */
export function removeFailure(error: unknown): string {
  if (error instanceof StorageRuleError && error.rule === 'recipe-in-plan')
    return recipes.remove.inPlan;
  if (error instanceof StorageFullError) return privacy.storageFull;
  if (error instanceof StorageClosedError) return privacy.backupCard.closed;
  return recipes.remove.failed;
}
