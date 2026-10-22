/**
 * One builder for the planner's screens, the Fast card wiring and the repository (item 22 design
 * 3.14; V42), so a day a screen shows as acceptable is judged by the same code the repository runs
 * inside its write. The recipe lookup holds live views and figures over the bundled datasets, the
 * owner's recipes, own foods, corrections, dislikes and hidden recipes; with no datasets (one
 * failed to load) it knows no recipe, so every planned meal counts as unknown. This file reaches
 * the phase only through plannerSchedule and the targets only through planDayTargets.
 */
import type { EatingWindow } from '../fasting/eatingWindow';
import { MEAL_SLOTS } from '../fasting/mealCheck';
import { refluxOptionsVisible } from '../fasting/reflux';
import type { FoodDataOk } from '../foods/dataset';
import type { AttributionMap, DatabaseSource } from '../foods/types';
import { allSeedViews } from '../foods/view';
import { type RecipeChecks, recipeChecksOf } from '../recipes/checks';
import type { RecipeFoods } from '../recipes/foodKind';
import type { HeartCapBudget } from '../recipes/heartSmart';
import type { RecipeData, SeedRecipe } from '../recipes/types';
import { listRecipes, type RecipeView, recipeView } from '../recipes/view';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import { type IngredientResolver, ingredientResolver } from '../storage/overrides';
import type { Id, RefId, SeedId } from '../storage/primitives';
import type {
  IngredientOverrideRecord,
  IngredientRecord,
  KickstartEndReason,
  PlanDayRecord,
  ProfileRecord,
  RecipeRecord,
  SymptomRecord,
} from '../storage/records';
import type { DayTargetRecords } from '../targets/dayTargets';
import type { LocalDate } from '../util/time';
import type { PlanDayContext } from './checks';
import type { PlanWriteContext } from './planWrite';
import { dayWindow, type PlannerClock, type PlannerSchedule, plannerSchedule } from './schedule';
import { allowedSlots, planSlotsFor } from './slots';
import { planDayTargets, planTargetsBase, type PlanTargetsBase } from './targets';
import { planDateState } from './week';

export interface PlanData {
  readonly foods: FoodDataOk;
  readonly recipes: RecipeData;
  readonly approved: readonly DatabaseSource[];
  /** The approved sources' attributions for the footer (the app's foods.attribution). */
  readonly attributions: AttributionMap;
}

export interface PlanRecipeLookup {
  /** Live: the dataset, owner recipes, corrections, own foods, dislikes and hidden ids. */
  readonly viewOf: (id: RefId) => RecipeView | null;
  /** Item 20's recipeChecksOf. */
  readonly checksOf: (id: RefId) => RecipeChecks | null;
  readonly resolve: IngredientResolver;
  /** One view per listRecipes entry (each seed once, replaced by the owner's copy of it). */
  readonly listed: () => readonly RecipeView[];
}

export interface PlanLookupRows {
  readonly ownRecipes: readonly RecipeRecord[];
  readonly ownIngredients: readonly IngredientRecord[];
  readonly overrides: readonly IngredientOverrideRecord[];
  readonly profile: Pick<
    ProfileRecord,
    'allergens' | 'dislikeIngredientIds' | 'dislikeTerms' | 'glutenFreeHousehold'
  >;
  readonly hiddenSeedIds: readonly SeedId[];
  /**
   * Today's saturated-fat budget for the views' heart labels (item 20's cap), null for none; a
   * check never reads it. Default null.
   */
  readonly satFatBudgetG?: HeartCapBudget;
}

const NO_RECIPES: PlanRecipeLookup = Object.freeze({
  viewOf: () => null,
  checksOf: () => null,
  resolve: () => null,
  listed: () => [],
});

/** data null (a dataset failed to load): no recipe is known, so every planned meal is unknown. */
export function planRecipeLookup(data: PlanData | null, rows: PlanLookupRows): PlanRecipeLookup {
  if (data === null) return NO_RECIPES;
  const resolve = ingredientResolver(allSeedViews(data.foods), rows.overrides, rows.ownIngredients);
  const foods: RecipeFoods = { resolve, seedById: data.foods.seedById, approved: data.approved };
  const storedById = new Map(rows.ownRecipes.map((r) => [r.id, r]));
  const byId = new Map<RefId, SeedRecipe | RecipeRecord>([
    ...data.recipes.recipes.map((r): [RefId, SeedRecipe] => [r.id, r]),
    ...rows.ownRecipes.map((r): [RefId, RecipeRecord] => [r.id, r]),
  ]);
  const ctx = {
    data: data.recipes,
    foods,
    storedById,
    profile: rows.profile,
    meal: 'own' as const,
    gardenIngredientIds: new Set<RefId>(),
    hiddenSeedIds: new Set(rows.hiddenSeedIds),
    month: 1,
    myServes: 1,
    satFatBudgetG: rows.satFatBudgetG ?? null,
  };
  const views = new Map<RefId, RecipeView>();
  const checks = new Map<RefId, RecipeChecks>();
  const viewOf = (id: RefId): RecipeView | null => {
    const recipe = byId.get(id);
    if (recipe === undefined) return null;
    let view = views.get(id);
    if (view === undefined) {
      view = recipeView(recipe, ctx);
      views.set(id, view);
    }
    return view;
  };
  return {
    viewOf,
    checksOf: (id) => {
      const recipe = byId.get(id);
      if (recipe === undefined) return null;
      let c = checks.get(id);
      if (c === undefined) {
        c = recipeChecksOf(recipe, foods);
        checks.set(id, c);
      }
      return c;
    },
    resolve,
    listed: () =>
      listRecipes(data.recipes, rows.ownRecipes).flatMap((entry) => {
        const view = viewOf(entry.recipe.id);
        return view === null ? [] : [view];
      }),
  };
}

export interface PlanRecords extends DayTargetRecords {
  /** The dates in question and the day before each. */
  readonly planDays: readonly PlanDayRecord[];
  readonly ownRecipes: readonly RecipeRecord[];
  readonly ownIngredients: readonly IngredientRecord[];
  readonly overrides: readonly IngredientOverrideRecord[];
  /** symptom_log rows from the day before the first date to the last. */
  readonly symptoms: readonly SymptomRecord[];
}

/** Each date's context, built when asked and kept. */
export function planDayContextFor(
  records: PlanRecords,
  clock: PlannerClock,
  ps: PlannerSchedule,
  base: PlanTargetsBase,
): (date: LocalDate) => PlanDayContext {
  const home = resolveZone(records.settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  const cache = new Map<LocalDate, PlanDayContext>();
  return (date) => {
    const known = cache.get(date);
    if (known !== undefined) return known;
    const state = planDateState(date, clock.today);
    // A past date shows only the window stored on its row (none while fasting is gated), never
    // one worked out from today's pattern, and counts every stored meal (V3).
    const window: EatingWindow | null =
      state === 'past'
        ? ps.fastingGated
          ? null
          : (records.planDays.find((d) => d.date === date)?.eatingWindow ?? null)
        : dayWindow(date, ps);
    const slots = planSlotsFor(window);
    const ctx: PlanDayContext = {
      date,
      state,
      window,
      slots,
      counted: state === 'past' ? MEAL_SLOTS : allowedSlots(slots),
      targets: planDayTargets(base, date),
      display: base.view.display,
      storedFloorKj: records.targets.energyFloorKj,
      refluxDay: refluxOptionsVisible({
        symptoms: records.symptoms,
        today: date,
        homeTimeZone: home,
        preferEarlier: false,
        preferSplit: false,
      }).symptomTriggered,
    };
    cache.set(date, ctx);
    return ctx;
  };
}

/** The schedule from the planner's records (one place: the screens and the repository). */
export function plannerScheduleOf(
  records: PlanRecords,
  base: PlanTargetsBase,
  clock: PlannerClock,
): PlannerSchedule {
  return plannerSchedule(
    {
      targets: records.targets,
      profile: records.profile,
      periods: records.periods,
      checks: records.checks,
      planDays: records.planDays,
      gates: base.view.gates,
      homeTimeZone: records.settings.homeTimeZone,
      cardStates: records.cardStates,
    },
    clock,
  );
}

export function planWriteContextFromRecords(
  records: PlanRecords,
  clock: PlannerClock,
  data: PlanData | null,
  endsPending: ReadonlyMap<Id, KickstartEndReason> = new Map(),
): PlanWriteContext {
  const latched: PlannerClock = { ...clock, endsPending };
  const base = planTargetsBase(records, latched);
  const ps = plannerScheduleOf(records, base, latched);
  return {
    today: clock.today,
    day: planDayContextFor(records, latched, ps, base),
    stored: (date) => records.planDays.find((d) => d.date === date),
    lookup: planRecipeLookup(data, {
      ownRecipes: records.ownRecipes,
      ownIngredients: records.ownIngredients,
      overrides: records.overrides,
      profile: records.profile,
      hiddenSeedIds: records.settings.hiddenSeedIds,
    }),
    profile: records.profile,
  };
}
