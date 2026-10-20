import type { RefId } from '@diet/core';
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
