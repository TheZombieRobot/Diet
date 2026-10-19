import { assertInRange } from '../util/round';
import { scaleNutrients, type Nutrients } from './nutrients';

/** Most serves of one dish the owner can log in one meal. */
export const MAX_MY_SERVES = 10;

/** Household serves cooked for one meal, the owner's included (grocery quantities only). */
export const HOUSEHOLD_SERVES_LIMITS = { min: 1, max: 50 } as const;

export interface PortionInput {
  /** Nutrition of one serve of the recipe. */
  perServe: Nutrients;
  /**
   * How many serves the owner eats, as a multiplier of one serve: 1 is one serve, 1.5 is a serve
   * and a half (0 to MAX_MY_SERVES). It is a count of serves, not a share of the dish: for
   * "dinner for 3, my portion one serve" pass 1, never 1/3.
   */
  myServes: number;
}

/** The owner's nutrition for a meal: per-serve × the owner's serves. */
export function myPortionNutrients({ perServe, myServes }: PortionInput): Nutrients {
  assertInRange('myServes', myServes, 0, MAX_MY_SERVES);
  return scaleNutrients(perServe, myServes);
}

/** A planned meal as the planner stores it (DATA_MODEL.md plan_days). */
export interface PlannedMeal extends PortionInput {
  /**
   * How many serves are cooked in total, the owner's included. Used only for grocery quantities;
   * it never changes the owner's own numbers (HEALTH_SAFETY.md section 4; HS-23, FL-05).
   */
  householdServes: number;
}

/**
 * The owner's nutrition for a planned meal. householdServes is validated on its own (1 to 50)
 * and otherwise ignored entirely: it neither changes the result nor limits myServes, so cooking
 * for one, three or eight gives the same numbers (HS-23, FL-05). Any "more eaten than cooked"
 * check belongs to the grocery quantities, where cooked amounts are worked out.
 */
export function ownerMealNutrients(meal: PlannedMeal): Nutrients {
  assertInRange(
    'householdServes',
    meal.householdServes,
    HOUSEHOLD_SERVES_LIMITS.min,
    HOUSEHOLD_SERVES_LIMITS.max,
  );
  return myPortionNutrients({ perServe: meal.perServe, myServes: meal.myServes });
}
