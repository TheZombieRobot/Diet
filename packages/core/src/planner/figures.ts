/**
 * A planned day's figures (item 22 design 3.5; HS-23, D35, HS-R18; V24, V29, V38). Every figure is
 * the owner's own portion: item 4's ownerMealNutrients multiplies one serve by `myServes`, and
 * household serves never reach a figure. A recipe's figures are item 20's live recipeChecksOf,
 * never a stored snapshot. A listed unknown is a lower bound, and a missing recipe counts as all
 * eight figures unknown, so it never helps a day pass a check. Only the counted meals (those whose
 * slot the day's window has) are turned into figures; the others are kept apart.
 */
import { plannedMealFigures, type PlannedMealFigures } from '../fasting/mealCheck';
import { NUTRIENT_KEYS, type Nutrients, sumNutrients } from '../nutrition/nutrients';
import { ownerMealNutrients } from '../nutrition/portion';
import type { RecipeChecks } from '../recipes/checks';
import type { RefId } from '../storage/primitives';
import type { MealSlot, NutrientKey, PlannedMealRecord } from '../storage/records';
import type { PlanRecipeLookup } from './context';
import { mealsInWindow } from './slots';

export interface PlanMealFigures {
  readonly slot: MealSlot;
  readonly recipeId: RefId;
  readonly myServes: number;
  readonly householdServes: number;
  /** The owner's portion; a listed unknown is a lower bound. */
  readonly nutrients: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
  readonly recipeFound: boolean;
}

const ZERO: Nutrients = Object.freeze(
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as unknown as Nutrients,
);

export function planMealFigures(
  meal: PlannedMealRecord,
  recipe: RecipeChecks | null,
): PlanMealFigures {
  const base = {
    slot: meal.slot,
    recipeId: meal.recipeId,
    myServes: meal.myServes,
    householdServes: meal.householdServes,
  };
  if (recipe === null) {
    return { ...base, nutrients: ZERO, unknownNutrients: [...NUTRIENT_KEYS], recipeFound: false };
  }
  return {
    ...base,
    nutrients: ownerMealNutrients({
      perServe: recipe.nutritionPerServe,
      myServes: meal.myServes,
      householdServes: meal.householdServes,
    }),
    unknownNutrients: [...recipe.unknownNutrients],
    recipeFound: true,
  };
}

export interface PlanDayFigures {
  readonly meals: readonly PlanMealFigures[];
  /** The sum of the known parts. */
  readonly totals: Nutrients;
  /** How many meals lack each figure. */
  readonly unknownCounts: Readonly<Record<NutrientKey, number>>;
}

export function planDayFigures(meals: readonly PlanMealFigures[]): PlanDayFigures {
  const unknownCounts = Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [k, meals.filter((m) => m.unknownNutrients.includes(k)).length]),
  ) as Record<NutrientKey, number>;
  return {
    meals,
    totals: meals.length === 0 ? ZERO : sumNutrients(meals.map((m) => m.nutrients)),
    unknownCounts,
  };
}

/** A figure is complete only when the day has meals and none lacks it. */
export function figureComplete(day: PlanDayFigures, key: NutrientKey): boolean {
  return day.meals.length > 0 && day.unknownCounts[key] === 0;
}

/** The counted meals of a day and their figures (V38): the one place a day becomes figures. */
export interface CountedDay {
  /** MEAL_SLOTS order. */
  readonly counted: readonly PlannedMealRecord[];
  /** Stored meals that are not counted: shown apart, never in a figure. */
  readonly outside: readonly PlannedMealRecord[];
  /** Over the counted meals only. */
  readonly figures: PlanDayFigures;
  /** Item 15's plannedMealFigures over the counted meals only (portion grams, C29). */
  readonly sitting: readonly PlannedMealFigures[];
}

export function countedDay(
  meals: readonly PlannedMealRecord[],
  counted: readonly MealSlot[],
  lookup: Pick<PlanRecipeLookup, 'checksOf' | 'resolve'>,
): CountedDay {
  const { inWindow, outside } = mealsInWindow(meals, counted);
  return {
    counted: inWindow,
    outside,
    figures: planDayFigures(inWindow.map((m) => planMealFigures(m, lookup.checksOf(m.recipeId)))),
    sitting: inWindow.map((m) =>
      plannedMealFigures(m, lookup.checksOf(m.recipeId), lookup.resolve),
    ),
  };
}
