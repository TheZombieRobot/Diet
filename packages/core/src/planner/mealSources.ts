/**
 * Planned meals for item 15's single-meal check (item 22 design 3.13; C23; FL-10, FL-12, FL-13,
 * HS-18; V38, V42, V51). Only the counted meals of the date, with live recipe figures, so a recipe
 * whose figures arrive later changes the check with no migration. A missing recipe, or every
 * recipe when the datasets could not be loaded, gives item 15's "protein unknown" figures: the
 * snack or the widen line is offered rather than the "no meals planned" wording.
 */
import { plannedMealsOf, type PlannedMealFigures } from '../fasting/mealCheck';
import type { MealSlot, PlanDayRecord } from '../storage/records';
import type { PlanRecipeLookup } from './context';
import { countedDay } from './figures';

export function plannedMealsForCheck(
  row: Pick<PlanDayRecord, 'meals'> | undefined,
  counted: readonly MealSlot[],
  lookup: Pick<PlanRecipeLookup, 'checksOf' | 'resolve'>,
): readonly PlannedMealFigures[] | null {
  const meals = plannedMealsOf(row);
  if (meals === null) return null;
  const { sitting } = countedDay(meals, counted, lookup);
  return sitting.length === 0 ? null : sitting;
}
