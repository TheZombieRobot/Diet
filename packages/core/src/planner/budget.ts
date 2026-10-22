/**
 * The budget card's facts (item 22 design 3.12; REQUIREMENTS 3B "shopping budget note"; HS-16,
 * NN-05; V20). The note is the owner's own words: normalised as stored text, never parsed for an
 * amount, compared, sent or used by the grocery list. The card counts planned meals that use the
 * garden or reuse leftovers; the planner never uses a price.
 */
import { normalizeText } from '../storage/primitives';
import type { RefId } from '../storage/primitives';
import type { PlannedMealRecord } from '../storage/records';
import type { RecipeView } from '../recipes/view';

/** profile.budgetNote's Text(1–200) bound (a test ties the two). */
export const BUDGET_NOTE_MAX_CHARS = 200;

export function parseBudgetNote(
  text: string,
):
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly error: 'too-long' } {
  const value = normalizeText(text) as string;
  if (value === '') return { ok: true, value: null };
  return value.length > BUDGET_NOTE_MAX_CHARS
    ? { ok: false, error: 'too-long' }
    : { ok: true, value };
}

export function budgetFacts(input: {
  readonly meals: readonly Pick<PlannedMealRecord, 'recipeId'>[];
  readonly view: (id: RefId) => Pick<RecipeView, 'lines' | 'usesLeftoversFrom'> | null;
  readonly ready: ReadonlySet<RefId>;
}): { readonly gardenMeals: number; readonly leftoverMeals: number } {
  let gardenMeals = 0;
  let leftoverMeals = 0;
  for (const meal of input.meals) {
    const view = input.view(meal.recipeId);
    if (view === null) continue;
    if (view.lines.some((line) => input.ready.has(line.ingredientId))) gardenMeals += 1;
    if (view.usesLeftoversFrom !== null) leftoverMeals += 1;
  }
  return { gardenMeals, leftoverMeals };
}
