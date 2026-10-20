/**
 * The single-meal check and the widen-window prompt (item 15; HEALTH_SAFETY.md section 3;
 * DOC_REVIEW C10, C11, C29, C62, C64, C73; DECISIONS one-meal row; FL-10, FL-12, FL-13, HS-18).
 *
 * Every comparison is strict, with no tolerance: offering the 5 pm snack more often is the safe
 * direction. A day's food is short when the plan alone, or what is logged so far plus the meals
 * still planned, comes in under the protein target or the day's energy target. When there is no
 * energy target (no rough energy guide), energy is "not shown to be met": the check never passes
 * and the snack and the widen line are offered (item 21's energyForMealChecks returns null then).
 * The 5,000 kJ floor is never an input here (it only refuses or warns), drinks are never counted
 * as food (C11), and the eating window decides only whether the day is one sitting, never the
 * targets (HS-22).
 */
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import type { RefId, TimeZone } from '../storage/primitives';
import type {
  FoodLogRecord,
  IngredientRecord,
  MealSlot,
  PlanDayRecord,
  PlannedMealRecord,
  RecipeLine,
  RecipeRecord,
} from '../storage/records';
import { ownerMealNutrients } from '../nutrition/portion';
import { type LocalDate, localDateOf } from '../util/time';

/** More cooked protein food than this in one sitting is unrealistic for one meal (C29). */
export const SINGLE_MEAL_PROTEIN_FOOD_MAX_G = 600;

/** An ingredient with at least this much protein per 100 g counts as protein food (C29). */
export const PROTEIN_DENSE_MIN_G_PER_100G = 10;

/** Meal slots in the order a day eats them (the plan_days validator's order). */
export const MEAL_SLOTS: readonly MealSlot[] = Object.freeze([
  'breakfast',
  'lunch',
  'meal1',
  'snack',
  'dinner',
] as const);

/** One planned meal's figures, for the owner's own portion. */
export interface PlannedMealFigures {
  readonly slot: MealSlot;
  /** A lower bound when incomplete. */
  readonly proteinG: number;
  /** False when the recipe is missing, or its protein is unknown with a 0 g lower bound. */
  readonly proteinKnown: boolean;
  /** Food only. */
  readonly foodEnergyKj: number;
  /** Cooked grams of protein-dense ingredients in the owner's portion. */
  readonly proteinFoodCookedG: number;
  /** Protein or energy is a lower bound (D35). */
  readonly incomplete: boolean;
}

/** What the food log holds for a date. */
export interface LoggedIntake {
  readonly proteinG: number;
  /** food_log only: drinks are never counted (C11). */
  readonly foodEnergyKj: number;
  readonly loggedSlots: readonly MealSlot[];
  /** Entries on the date that are not a logged planned slot (a label, a recipe, an estimate). */
  readonly otherEntries: number;
  readonly incomplete: boolean;
}

export interface MealCheckInput {
  /** effectiveProteinTargetG for the phase. */
  readonly proteinTargetG: number;
  /** The day's energy target (item 21's energyForMealChecks); null: energy not shown to be met. */
  readonly dayEnergyTargetKj: number | null;
  /** Null: no plan for the date. */
  readonly planned: readonly PlannedMealFigures[] | null;
  /** Null: no food log available. */
  readonly logged: LoggedIntake | null;
  readonly windowClosed: boolean;
  /** isOneMealWindow(windowOn(date)). */
  readonly oneMealWindow: boolean;
}

/**
 * Why a day is short. 'energy-unknown': there is no energy target, so energy is not shown to be
 * met (the check never passes on it).
 */
export type MealCheckReason = 'protein' | 'energy' | 'energy-unknown' | 'portion';

/** The protein of a single-sitting day: all of its planned meals together. */
export interface SittingHeadline {
  /** Rounded down to whole grams, so a figure never reads as the target when it is below it. */
  readonly proteinG: number;
  readonly atLeast: boolean;
  readonly unknown: boolean;
  /** The sitting is one planned dinner. */
  readonly dinnerOnly: boolean;
}

export type MealCheckResult =
  | { readonly kind: 'unavailable' }
  | {
      readonly kind: 'ok';
      readonly sitting: SittingHeadline | null;
      readonly energyChecked: boolean;
    }
  | {
      readonly kind: 'short-before';
      readonly reasons: readonly MealCheckReason[];
      readonly sitting: SittingHeadline | null;
      readonly energyChecked: boolean;
    }
  | {
      readonly kind: 'short-after';
      readonly reasons: readonly Exclude<MealCheckReason, 'portion'>[];
      readonly energyChecked: boolean;
    };

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** The energy reason for a figure: short, not shown to be met, or none. */
function energyReason(figure: number, targetKj: number | null): MealCheckReason | null {
  if (targetKj === null) return 'energy-unknown';
  return figure < targetKj ? 'energy' : null;
}

export function mealCheck(input: MealCheckInput): MealCheckResult {
  const { planned, logged, proteinTargetG, dayEnergyTargetKj } = input;
  const energyChecked = dayEnergyTargetKj !== null;
  if (planned === null && logged === null) return { kind: 'unavailable' };

  if (input.windowClosed) {
    // After the window: what was logged is compared alone (C62).
    if (logged === null) return { kind: 'unavailable' };
    const reasons: Exclude<MealCheckReason, 'portion'>[] = [];
    if (logged.proteinG < proteinTargetG) reasons.push('protein');
    const energy = energyReason(logged.foodEnergyKj, dayEnergyTargetKj);
    if (energy === 'energy' || energy === 'energy-unknown') reasons.push(energy);
    return reasons.length > 0
      ? { kind: 'short-after', reasons, energyChecked }
      : { kind: 'ok', sitting: null, energyChecked };
  }

  // Before the window closes, logged food is only compared alongside a plan (C62).
  if (planned === null) return { kind: 'unavailable' };

  const sittingDay = input.oneMealWindow || planned.length === 1;
  const loggedSlots = new Set(logged?.loggedSlots ?? []);
  const unlogged = MEAL_SLOTS.flatMap((slot) =>
    planned.filter((m) => m.slot === slot && !loggedSlots.has(slot)),
  );
  // Each entry logged another way takes the place of the earliest unlogged planned meal, so one
  // meal is never counted twice and the projection only errs low.
  const remaining = unlogged.slice(Math.min(logged?.otherEntries ?? 0, unlogged.length));

  const reasons: MealCheckReason[] = [];
  const planProtein = sum(planned.map((m) => m.proteinG));
  const projectedProtein = (logged?.proteinG ?? 0) + sum(remaining.map((m) => m.proteinG));
  if (
    Math.min(planProtein, projectedProtein) < proteinTargetG ||
    planned.some((m) => !m.proteinKnown)
  ) {
    reasons.push('protein');
  }
  const planEnergy = sum(planned.map((m) => m.foodEnergyKj));
  const projectedEnergy = (logged?.foodEnergyKj ?? 0) + sum(remaining.map((m) => m.foodEnergyKj));
  const energy = energyReason(Math.min(planEnergy, projectedEnergy), dayEnergyTargetKj);
  if (energy !== null) reasons.push(energy);
  if (
    sittingDay &&
    sum(planned.map((m) => m.proteinFoodCookedG)) > SINGLE_MEAL_PROTEIN_FOOD_MAX_G
  ) {
    reasons.push('portion');
  }

  const sitting: SittingHeadline | null = sittingDay
    ? {
        proteinG: Math.floor(planProtein),
        atLeast: planned.some((m) => m.incomplete || !m.proteinKnown),
        unknown: planProtein === 0 && planned.some((m) => !m.proteinKnown),
        dinnerOnly: planned.length === 1 && planned[0]?.slot === 'dinner',
      }
    : null;
  return reasons.length > 0
    ? { kind: 'short-before', reasons, sitting, energyChecked }
    : { kind: 'ok', sitting, energyChecked };
}

/** The planned meals of a date; null when there is no row, or the row only holds a window. */
export function plannedMealsOf(
  row: Pick<PlanDayRecord, 'meals'> | undefined,
): readonly PlannedMealRecord[] | null {
  return row === undefined || row.meals.length === 0 ? null : row.meals;
}

type ResolvedIngredient = Pick<
  IngredientRecord,
  'nutrientsPer100g' | 'unknownNutrients' | 'cookedYield' | 'yieldCitation'
>;

/**
 * What the checks read of a recipe: a stored record, or item 20's recipeChecksOf of a seed recipe
 * (its live figures). A type widening only (item 20 design pre-flight 4).
 */
export type MealCheckRecipe = Pick<
  RecipeRecord,
  'serves' | 'nutritionPerServe' | 'unknownNutrients'
> & {
  readonly lines: readonly RecipeLine[];
};

/**
 * Cooked grams of protein food in the owner's serves of a recipe (C29). An ingredient counts when
 * it cannot be found, its protein is unknown, or it has at least 10 g protein per 100 g on its
 * stored basis. Its weight is the cooked weight; else the raw weight times a cited cooked yield
 * when that is larger; else the raw weight. Household serves are not an input (HS-23).
 */
export function proteinDenseCookedGrams(
  recipe: Pick<MealCheckRecipe, 'serves' | 'lines'>,
  myServes: number,
  resolve: (id: RefId) => ResolvedIngredient | null,
): number {
  const grams = sum(
    recipe.lines.map((line) => {
      const ingredient = resolve(line.ingredientId);
      const dense =
        ingredient === null ||
        ingredient.unknownNutrients.includes('proteinG') ||
        ingredient.nutrientsPer100g.proteinG >= PROTEIN_DENSE_MIN_G_PER_100G;
      if (!dense) return 0;
      if (line.cookedG !== null) return line.cookedG;
      const cited =
        ingredient !== null &&
        ingredient.cookedYield !== null &&
        ingredient.yieldCitation !== null &&
        ingredient.yieldCitation.trim() !== '';
      return cited ? Math.max(line.rawG, line.rawG * (ingredient.cookedYield ?? 1)) : line.rawG;
    }),
  );
  return (grams * myServes) / recipe.serves;
}

/** The figures of a planned meal; a missing recipe counts as nothing known (the snack is offered). */
export function plannedMealFigures(
  meal: PlannedMealRecord,
  recipe: MealCheckRecipe | null,
  resolve: (id: RefId) => ResolvedIngredient | null,
): PlannedMealFigures {
  if (recipe === null) {
    return {
      slot: meal.slot,
      proteinG: 0,
      proteinKnown: false,
      foodEnergyKj: 0,
      proteinFoodCookedG: 0,
      incomplete: true,
    };
  }
  const nutrients = ownerMealNutrients({
    perServe: recipe.nutritionPerServe,
    myServes: meal.myServes,
    householdServes: meal.householdServes,
  });
  const proteinUnknown = recipe.unknownNutrients.includes('proteinG');
  return {
    slot: meal.slot,
    proteinG: nutrients.proteinG,
    proteinKnown: !(proteinUnknown && nutrients.proteinG === 0),
    foodEnergyKj: nutrients.energyKj,
    proteinFoodCookedG: proteinDenseCookedGrams(recipe, meal.myServes, resolve),
    incomplete: proteinUnknown || recipe.unknownNutrients.includes('energyKj'),
  };
}

/** What the food log holds for a local date, each row read in its own zone. Drinks are not here. */
export function loggedIntakeOn(
  date: LocalDate,
  rows: readonly FoodLogRecord[],
  homeTimeZone: TimeZone,
): LoggedIntake {
  const onDate = rows.filter(
    (row) =>
      localDateOf(
        row.at,
        resolveZone(row.timeZone, homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone,
      ) === date,
  );
  const slotOf = (row: FoodLogRecord): MealSlot | null => {
    if (row.sourceKind !== 'plan' || row.refId === null) return null;
    return MEAL_SLOTS.find((slot) => row.refId === `${date}#${slot}`) ?? null;
  };
  const loggedSlots = MEAL_SLOTS.filter((slot) => onDate.some((row) => slotOf(row) === slot));
  return {
    proteinG: sum(onDate.map((row) => row.nutrients.proteinG)),
    foodEnergyKj: sum(onDate.map((row) => row.nutrients.energyKj)),
    loggedSlots,
    otherEntries: onDate.filter((row) => slotOf(row) === null).length,
    incomplete: onDate.some(
      (row) =>
        row.unknownNutrients.includes('proteinG') || row.unknownNutrients.includes('energyKj'),
    ),
  };
}
