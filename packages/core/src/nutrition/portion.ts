import { assertInRange } from '../util/round';
import { scaleNutrients, type Nutrients } from './nutrients';

export interface PortionInput {
  /** Nutrition of one serve of the recipe. */
  perServe: Nutrients;
  /** How many serves the owner eats: 1 is one serve, 1.5 is a serve and a half. */
  myServes: number;
  /**
   * How many serves are cooked in total, the owner's included. Used only for grocery
   * quantities; it never changes the owner's own numbers (HEALTH_SAFETY.md section 4; HS-23,
   * FL-05).
   */
  householdServes: number;
}

/** The owner's nutrition for a meal: per-serve × the owner's serves. */
export function myPortionNutrients({
  perServe,
  myServes,
  householdServes,
}: PortionInput): Nutrients {
  assertInRange('myServes', myServes, 0, 10);
  assertInRange('householdServes', householdServes, Math.max(myServes, Number.MIN_VALUE), 50);
  return scaleNutrients(perServe, myServes);
}
