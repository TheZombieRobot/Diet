/**
 * The day's intake: food energy kept apart from alcohol energy, and the state of the limit bars
 * (C11, C31, C92; D35; HS-09; item 21 design section 3.7; T11, T16).
 *
 * - Food and drinks have different types, so a drink cannot reach foodEnergyKj or
 *   plannedFoodEnergyKj, which are all the floor and the meal checks ever read (C11).
 * - A drink with unknown energy, or a label energy too low for its alcohol, is counted as unknown,
 *   never as 0 and never inferred (NN-01, C92, A40): the one rule of countedKcalPerServe, which the
 *   Drinks screen and Today's Drinks card use too.
 * - A bar compares what it shows (T11): a whole gram, half up for a complete total; a total with a
 *   missing figure is a lower bound, shown rounded down and never "within" (D35). Energy is always
 *   shown rounded down to a whole kJ, so a shown energy is never above what a check compared
 *   (item 18-20 contract, section 3).
 */
import { type DrinkMeasure, totalDrinkEnergy } from '../alcohol/standardDrinks';
import { kcalToKj, type Nutrients, sumNutrients } from '../nutrition/nutrients';
import { ownerMealNutrients, type PlannedMeal } from '../nutrition/portion';
import { nutrientCompleteness } from '../storage/derived';
import type { NutrientKey } from '../storage/records';
import { roundTo } from '../util/round';

/** A food_log row's nutrition (food only). */
export interface FoodEntryLike {
  readonly nutrients: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
}

/**
 * A drinks_log row's energy fields: kcalPerServe is the stored snapshot (null means unknown), and
 * the beverage's measure is what that figure is checked against.
 */
export interface DrinkEntryLike {
  readonly kcalPerServe: number | null;
  readonly count: number;
  readonly beverage: DrinkMeasure;
}

export interface DayIntake {
  /** The food entries' sum; food only. */
  readonly food: Nutrients;
  /** How many entries lack each figure (nutrientCompleteness). */
  readonly unknownCounts: Readonly<Record<NutrientKey, number>>;
  readonly entryCount: number;
  readonly alcohol: {
    readonly knownKcal: number;
    /** Rounded to a whole kJ: 94 kcal is 393 kJ, six cans of 94 kcal are 2,360 kJ (C31). */
    readonly knownKj: number;
    /** Drinks (by count) whose energy is unknown. */
    readonly unknownCount: number;
    /** Every drink (by count), so a logged drink is never "nothing logged", whatever its energy. */
    readonly count: number;
  };
  /** food.energyKj + alcohol.knownKj, for display only. */
  readonly totalEnergyKj: number;
  readonly foodEnergyIncomplete: boolean;
  /** foodEnergyIncomplete, or a drink with unknown energy. */
  readonly totalIncomplete: boolean;
}

/** The day's food and drinks, with alcohol energy as its own part (C11). */
export function dayIntake(
  food: readonly FoodEntryLike[],
  drinks: readonly DrinkEntryLike[],
): DayIntake {
  const sum = sumNutrients(food.map((f) => f.nutrients));
  const unknownCounts = nutrientCompleteness(food);
  // Mapped explicitly: totalDrinkEnergy reads { kcal, count, measure }, so rows passed as they are
  // would count every drink as unknown.
  const drinksTotal = totalDrinkEnergy(
    drinks.map((d) => ({ kcal: d.kcalPerServe, count: d.count, measure: d.beverage })),
  );
  const knownKj = Math.round(kcalToKj(drinksTotal.knownKcal));
  const foodEnergyIncomplete = unknownCounts.energyKj > 0;
  return {
    food: sum,
    unknownCounts,
    entryCount: food.length,
    alcohol: {
      knownKcal: drinksTotal.knownKcal,
      knownKj,
      unknownCount: drinksTotal.unknownCount,
      count: drinks.reduce((total, d) => total + d.count, 0),
    },
    totalEnergyKj: sum.energyKj + knownKj,
    foodEnergyIncomplete,
    totalIncomplete: foodEnergyIncomplete || drinksTotal.unknownCount > 0,
  };
}

/** Food energy only: the figure the floor and the meal checks use (C11). */
export function foodEnergyKj(food: readonly FoodEntryLike[]): number {
  return sumNutrients(food.map((f) => f.nutrients)).energyKj;
}

/** A planned day's food energy: the owner's own portions only (HS-23), never a drink (C11). */
export function plannedFoodEnergyKj(meals: readonly PlannedMeal[]): number {
  return meals.reduce((total, meal) => total + ownerMealNutrients(meal).energyKj, 0);
}

/**
 * The amount a figure shows (T11): energy rounded down to a whole kJ; grams to a whole gram, half
 * up for a complete total and down for a lower bound (a total with a missing figure), so "at
 * least" never overstates.
 */
export function shownAmount(value: number, unit: 'kj' | 'g', complete: boolean): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Cannot show ${value}`);
  // The small allowance keeps a sum such as 0.1 + 0.2 + 0.7 from flooring to 0.
  if (unit === 'kj' || !complete) return Math.floor(value + 1e-9);
  return roundTo(value, 0);
}

export type LimitState = 'within' | 'over' | 'incomplete';

/**
 * A limit bar's state from the amount it shows (HS-09, D35, T11): over when the shown amount is
 * above the whole-gram limit (even with a missing figure, since the total is at least that much);
 * otherwise incomplete when any entry lacks the figure, never within; otherwise within. 20.4 g
 * against 20 g shows "20 / 20 g" and is within; 20.5 g shows "21 / 20 g" and is over.
 */
export function limitState(eatenG: number, unknownCount: number, limitG: number): LimitState {
  if (shownAmount(eatenG, 'g', unknownCount === 0) > limitG) return 'over';
  return unknownCount > 0 ? 'incomplete' : 'within';
}

/** value ÷ of, within 0–1; 0 when `of` is not above 0. */
export function fillFraction(value: number, of: number): number {
  if (!(of > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / of));
}
