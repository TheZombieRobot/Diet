/**
 * The plan's needs (design 2.3; GL-01, NN-04, HS-23). Each planned meal's recipe lines at raw
 * weight, scaled by the serves cooked over the recipe's serves, the same food merged across
 * recipes and days. Only `rawG` is read, never `cookedG` (C67): a cooked-form line is kept apart
 * under its raw food with no amount. Household serves change these grocery amounts only; nothing
 * here computes or writes nutrition.
 */
import {
  isOneMealWindow,
  MEAL_SLOTS,
  type PlanDayRecord,
  type PlannedMealRecord,
  type RecipeLine,
  type RefId,
  type SeedRecipeLine,
  SNACK_TIME,
  twinOf,
} from '@diet/core';
import type { DatedMeal, ListFoods, ResolvedRecipe } from './types';

export type NeedKind = 'grams' | 'eggs' | 'cooked' | 'unknown-food';

export interface NeedSource {
  readonly line: RecipeLine | SeedRecipeLine;
  readonly seedLines: readonly SeedRecipeLine[] | null;
  readonly recipeTitle: string;
}

export interface Need {
  readonly kind: NeedKind;
  /** The food to buy (a cooked form's raw twin); an unresolved id as written. */
  readonly ingredientId: RefId;
  /** Summed raw grams, unrounded. */
  readonly grams: number;
  /** The contributing recipe lines, in plan order. */
  readonly sources: readonly NeedSource[];
}

/**
 * The larger of household serves and the owner's own (J2): household serves include the owner,
 * and an owner who eats more than the household serves cooked is never under-bought.
 */
export function servesCooked(
  meal: Pick<PlannedMealRecord, 'myServes' | 'householdServes'>,
): number {
  return Math.max(meal.householdServes, meal.myServes);
}

const slotIndex = (meal: PlannedMealRecord): number => MEAL_SLOTS.indexOf(meal.slot);

export function planNeeds(
  meals: readonly DatedMeal[],
  recipeOf: (id: RefId) => ResolvedRecipe | null,
  foods: ListFoods,
): { readonly needs: readonly Need[]; readonly mealCount: number; readonly skippedMeals: number } {
  const ordered = [...meals].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : slotIndex(a.meal) - slotIndex(b.meal),
  );
  const needs = new Map<
    string,
    { kind: Need['kind']; ingredientId: RefId; grams: number; sources: NeedSource[] }
  >();
  let mealCount = 0;
  let skippedMeals = 0;
  for (const { meal } of ordered) {
    const recipe = recipeOf(meal.recipeId);
    if (recipe === null) {
      skippedMeals += 1;
      continue;
    }
    mealCount += 1;
    const factor = servesCooked(meal) / recipe.serves;
    for (const line of recipe.lines) {
      const view = foods.resolve(line.ingredientId);
      let kind: Need['kind'];
      let ingredientId: RefId = line.ingredientId;
      let key: string;
      if (view === null) {
        kind = 'unknown-food';
        key = `unknown:${ingredientId}`;
      } else if (view.nutrientBasis === 'cooked') {
        kind = 'cooked';
        ingredientId = twinOf(foods.data, line.ingredientId)?.raw ?? line.ingredientId;
        key = `cooked:${ingredientId}`;
      } else {
        kind = foods.data.seedById.get(ingredientId)?.group === 'egg' ? 'eggs' : 'grams';
        key = ingredientId;
      }
      const source: NeedSource = { line, seedLines: recipe.seedLines, recipeTitle: recipe.title };
      const need = needs.get(key);
      if (need === undefined) {
        needs.set(key, { kind, ingredientId, grams: line.rawG * factor, sources: [source] });
      } else {
        need.grams += line.rawG * factor;
        need.sources.push(source);
      }
    }
  }
  return { needs: [...needs.values()], mealCount, skippedMeals };
}

export interface PlanSummary {
  readonly meals: number;
  readonly days: number;
  readonly unreadable: number;
  /** Days whose own window starts at the 5 pm snack but whose plan has no snack meal (J46). */
  readonly snackDays: number;
}

/** What the build panel says before the tap. Reads plan rows only, never targets. */
export function planSummary(
  rows: readonly PlanDayRecord[],
  recipeFound: (id: RefId) => boolean,
): PlanSummary {
  let meals = 0;
  let days = 0;
  let unreadable = 0;
  let snackDays = 0;
  for (const row of rows) {
    meals += row.meals.length;
    if (row.meals.length > 0) days += 1;
    unreadable += row.meals.filter((m) => !recipeFound(m.recipeId)).length;
    const window = row.eatingWindow;
    if (
      window !== null &&
      window.start === SNACK_TIME &&
      !isOneMealWindow(window) &&
      !row.meals.some((m) => m.slot === 'snack')
    ) {
      snackDays += 1;
    }
  }
  return { meals, days, unreadable, snackDays };
}
