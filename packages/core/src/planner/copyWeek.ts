/**
 * Copy a week to the following week (item 22 design 3.10; REQUIREMENTS 3B "rotating"; P41 rule 4,
 * item 20 section 7 step 3, HS-24, HS-10; V9). A proposal only; the repository checks each day
 * again when the owner accepts it.
 *
 * Each day's meals go to the same weekday of the following week, only into editable days with no
 * meals (never overwritten). Meals outside the target day's window, and recipes now hidden or
 * disliked, are skipped. A missing recipe, a portion above 4 serves, a recipe that now contains a
 * listed allergen, or one whose allergens are not fully known (a label check never carries over)
 * refuses the day. Then the full app-made day check applies. Portions and household serves are
 * copied as stored; per-day eating windows are never copied.
 */
import { blockedAllergens, servingFor } from '../recipes/allergens';
import type { Allergen } from '../storage/allergens';
import type { RefId } from '../storage/primitives';
import type { MealSlot, PlannedMealRecord, ProfileRecord } from '../storage/records';
import type { LocalDate } from '../util/time';
import { mealSharing } from './allergens';
import { withoutOk } from './autoFill';
import { type AppDayRefusal, appDayCheck, type PlanDayContext } from './checks';
import type { PlanRecipeLookup } from './context';
import { countedDay } from './figures';
import { mealsInWindow } from './slots';

/** The most serves an owner's own meal, or a copy of one, may hold (V11). */
export const OWNER_MY_SERVES_MAX = 4;

export interface CopyDayInput {
  readonly source: LocalDate;
  /** addDays(source, 7). */
  readonly target: LocalDate;
  readonly sourceMeals: readonly PlannedMealRecord[];
  readonly targetMeals: readonly PlannedMealRecord[];
  /** The target date's. */
  readonly ctx: PlanDayContext;
}

export type CopySkip = {
  readonly slot: MealSlot;
  readonly recipeId: RefId;
  readonly why: 'slot' | 'not-wanted';
};

export type CopyDay =
  | {
      readonly date: LocalDate;
      readonly status: 'proposed';
      readonly meals: readonly PlannedMealRecord[];
      readonly skipped: readonly CopySkip[];
    }
  | {
      readonly date: LocalDate;
      readonly status: 'refused';
      readonly refusal:
        | AppDayRefusal
        | { readonly reason: 'past-day' | 'future-day' | 'has-meals' | 'portion' }
        | {
            readonly reason: 'allergen-conflict';
            readonly recipeId: RefId;
            readonly conflicts: readonly Allergen[];
          }
        | { readonly reason: 'label-check-needed' | 'recipe-missing'; readonly recipeId: RefId };
    }
  | {
      readonly date: LocalDate;
      readonly status: 'nothing-to-copy';
      readonly skipped: readonly CopySkip[];
    };

export type CopyRefusal = Extract<CopyDay, { readonly status: 'refused' }>['refusal'];

function copyDay(
  day: CopyDayInput,
  lookup: PlanRecipeLookup,
  profile: Pick<ProfileRecord, 'allergens' | 'glutenFreeHousehold'>,
): CopyDay {
  const date = day.target;
  const refused = (refusal: CopyRefusal): CopyDay => ({ date, status: 'refused', refusal });
  if (day.sourceMeals.length === 0) return { date, status: 'nothing-to-copy', skipped: [] };
  if (day.ctx.state === 'past') return refused({ reason: 'past-day' });
  if (day.ctx.state === 'too-far') return refused({ reason: 'future-day' });
  if (day.targetMeals.length > 0) return refused({ reason: 'has-meals' });
  const meals: PlannedMealRecord[] = [];
  const skipped: CopySkip[] = [];
  for (const meal of mealsInWindow(
    day.sourceMeals,
    day.sourceMeals.map((m) => m.slot),
  ).inWindow) {
    const view = lookup.viewOf(meal.recipeId);
    if (view === null) return refused({ reason: 'recipe-missing', recipeId: meal.recipeId });
    if (!day.ctx.counted.includes(meal.slot)) {
      skipped.push({ slot: meal.slot, recipeId: meal.recipeId, why: 'slot' });
      continue;
    }
    if (view.hidden || view.disliked) {
      skipped.push({ slot: meal.slot, recipeId: meal.recipeId, why: 'not-wanted' });
      continue;
    }
    if (meal.myServes > OWNER_MY_SERVES_MAX) return refused({ reason: 'portion' });
    const blocked = blockedAllergens(profile, mealSharing(meal.householdServes));
    const { serving, conflicts } = servingFor(blocked, view.allergens.facts);
    if (serving === 'conflict') {
      return refused({ reason: 'allergen-conflict', recipeId: meal.recipeId, conflicts });
    }
    if (serving === 'unknown')
      return refused({ reason: 'label-check-needed', recipeId: meal.recipeId });
    meals.push({ ...meal });
  }
  if (meals.length === 0) return { date, status: 'nothing-to-copy', skipped };
  const check = appDayCheck({
    day: countedDay(meals, day.ctx.counted, lookup),
    ctx: day.ctx,
    kind: 'copy',
    oneMealOk: (id) => lookup.viewOf(id)?.oneMealOk ?? false,
  });
  return check.ok ? { date, status: 'proposed', meals, skipped } : refused(withoutOk(check));
}

export function copyWeekProposal(input: {
  readonly days: readonly CopyDayInput[];
  readonly lookup: PlanRecipeLookup;
  readonly profile: Pick<ProfileRecord, 'allergens' | 'glutenFreeHousehold'>;
}): readonly CopyDay[] {
  return input.days.map((day) => copyDay(day, input.lookup, input.profile));
}
