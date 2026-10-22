/**
 * The Fast card's planned meals (item 22 design 2.16; DOC_REVIEW C23; FL-10, FL-12, FL-13; V38,
 * V42): item 15 left them to the planner. Each date's meals are the planner's counted meals for the
 * Fast card's own window on that date, with the recipes' live figures, through the same core
 * function the Day screen uses. When a bundled dataset could not be loaded no recipe is known, so a
 * planned meal reads "protein unknown" and the snack or the widen line is offered, never the "no
 * meals planned" wording. The logged food is item 23's loggedIntakeForMealCheck: one row per
 * planned slot, label energy capped by its macronutrients (C11), and a date with no entries read as
 * nothing logged (cross-item ruling 23). No weight-phase function is read here, and the planner
 * never reads the drink log (C11).
 */
import {
  allowedSlots,
  DEFAULT_HOME_TIME_ZONE,
  loggedIntakeForMealCheck,
  resolveZone,
  type LocalDate,
  type PlanData,
  plannedMealsForCheck,
  planRecipeLookup,
  planSlotsFor,
  type Schedule,
  windowOn,
} from '@diet/core';
import type { FastingInputs } from './inputs';
import type { MealSources } from './integration';

export function mealSourcesFrom(args: {
  readonly inputs: Pick<FastingInputs, 'planDays' | 'recipeRows' | 'foodLog' | 'settings'>;
  /** planData(): null when a dataset failed to load. */
  readonly data: PlanData | null;
  /** The Fast card's own schedule (view.ts scheduleOf). */
  readonly schedule: Schedule;
}): MealSources {
  const { inputs, schedule } = args;
  const rows = inputs.recipeRows;
  const lookup = planRecipeLookup(args.data, {
    ownRecipes: rows.recipes,
    ownIngredients: rows.own,
    overrides: rows.overrides,
    profile: rows.profile,
    hiddenSeedIds: rows.hiddenSeedIds,
  });
  return {
    plannedMeals: (date: LocalDate) =>
      plannedMealsForCheck(
        inputs.planDays.find((d) => d.date === date),
        allowedSlots(planSlotsFor(windowOn(date, schedule))),
        lookup,
      ),
    loggedIntake: (date: LocalDate) =>
      loggedIntakeForMealCheck(
        inputs.foodLog,
        date,
        resolveZone(inputs.settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone,
      ),
  };
}
