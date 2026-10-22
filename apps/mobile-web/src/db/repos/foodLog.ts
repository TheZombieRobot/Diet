/**
 * The food log (storage spec sections 4.7 and 8.2; item 23 design 4.3): the generic repository,
 * the entries by local date (item 21's Nutrition today card), and the only ways the app writes a
 * food entry or a label food. Every row is built by core's entry builders inside the write's own
 * transaction, from the records as they are then (scan foodLogHome keeps every app write here):
 *
 * - A label food's rules run here again (core parseLabelForm, with the alcohol gate worked out from
 *   the readiness rows and the profile), so no caller can store a drink name under 18, skip a
 *   tick, or store figures the form would refuse (HS-32, HS-R23).
 * - A weight is never multiplied by figures for another state (core labelEntry; C67).
 * - A recipe or plan entry is worked out from the recipe's current figures for the owner's own
 *   serves (HS-23); its unknown figures stay listed (schema version 2), and it is never Label.
 * - A planned meal is logged once: a second plan row for a slot, or a planned meal already logged
 *   as the same recipe, or a recipe already logged that day, is refused unless the owner confirmed
 *   eating it twice (logAgain).
 * - No entry is dated ahead of now ('future-time'), and a plan entry is dated on its plan date.
 * The generic create and update stay for tests and restore; app code never calls them.
 */
import {
  allSeedViews,
  APPROVED_NUTRIENT_SOURCES,
  DEFAULT_HOME_TIME_ZONE,
  entryLocalDate,
  type FoodDataOk,
  foodData,
  type FoodLogRecord,
  gateInputFromRecords,
  type Id,
  type IngredientOverrideRecord,
  type IngredientRecord,
  ingredientResolver,
  type Instant,
  isSeedId,
  type LabelAmount,
  labelEntry,
  type LabelFormInput,
  type LabelFormResult,
  type LocalDate,
  localDateOf,
  type LogEntryDraft,
  type MealSlot,
  labelFoodChange,
  labelIngredient,
  parseLabelForm,
  type PlanDayRecord,
  planEntry,
  planMealsToLog,
  planRefOf,
  planRowRebuildable,
  type PortionFigures,
  readinessGates,
  type RecipeData,
  recipeData,
  recipeEntry,
  recipeNutrition,
  type RecipeRecord,
  type RefId,
  resolveZone,
  sameRecipeLogged,
  seedRecipe,
  type SettingsRecord,
  type TimeZone,
  utcRangeCovering,
} from '@diet/core';
import Dexie from 'dexie';
import type { DietDb } from '../db';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { type CrudRepo, crudRepo, stampUpdate } from './crud';
import { planDayInScope } from './planDays';
import { recipesInScope } from './recipes';

export interface FoodLogRepo extends CrudRepo<'food_log'> {
  /** Entries whose local date, in their own recorded zone, is `date`, in time order. */
  readonly forLocalDate: (date: LocalDate) => Promise<FoodLogRecord[]>;
  /** Entries whose local date is in [from, to], in time order (item 23). */
  readonly forLocalDates: (from: LocalDate, to: LocalDate) => Promise<FoodLogRecord[]>;
  readonly logLabel: (input: {
    readonly foodId: Id;
    readonly amount: LabelAmount;
    readonly at?: Instant;
  }) => Promise<FoodLogRecord>;
  readonly logNewLabelFood: (input: {
    readonly form: LabelFormInput;
    readonly amount: LabelAmount;
    readonly at?: Instant;
  }) => Promise<{ readonly food: IngredientRecord; readonly entry: FoodLogRecord }>;
  readonly saveLabelFood: (input: {
    readonly id: Id;
    readonly form: LabelFormInput;
  }) => Promise<IngredientRecord>;
  readonly logRecipe: (input: {
    readonly recipeId: RefId;
    readonly serves: number;
    readonly at?: Instant;
    readonly logAgain?: boolean;
  }) => Promise<FoodLogRecord>;
  readonly logPlan: (input: {
    readonly date: LocalDate;
    readonly slot: MealSlot;
    readonly serves?: number;
    readonly at?: Instant;
    readonly logAgain?: boolean;
  }) => Promise<FoodLogRecord>;
  readonly changeEntry: (
    id: Id,
    change: { readonly at?: Instant; readonly amount?: LabelAmount; readonly serves?: number },
  ) => Promise<FoodLogRecord>;
}

const sortByAt = (rows: FoodLogRecord[]) =>
  rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

const homeOf = (settings: SettingsRecord | undefined): TimeZone =>
  resolveZone(settings?.homeTimeZone ?? null, DEFAULT_HOME_TIME_ZONE).timeZone;

/** The shipped food and recipe data a recipe entry is worked out from, read before the transaction. */
function shippedData(): { readonly foods: FoodDataOk; readonly recipes: RecipeData } {
  const foods = foodData();
  const recipes = recipeData();
  if (foods.status !== 'ok' || recipes.status !== 'ok')
    throw new StorageRuleError('food_log', 'food-source-missing');
  return { foods, recipes: recipes.data };
}

/** A recipe's live figures for one serve, or null when it is not in the app. */
function portionFigures(
  recipeId: RefId,
  shipped: { readonly foods: FoodDataOk },
  own: readonly IngredientRecord[],
  overrides: readonly IngredientOverrideRecord[],
  stored: readonly RecipeRecord[],
): PortionFigures | null {
  const recipe = isSeedId(recipeId) ? seedRecipe(recipeId) : stored.find((r) => r.id === recipeId);
  if (recipe === null || recipe === undefined) return null;
  const n = recipeNutrition(recipe, {
    resolve: ingredientResolver(allSeedViews(shipped.foods), overrides, own),
    seedById: shipped.foods.seedById,
    approved: APPROVED_NUTRIENT_SOURCES,
  });
  return {
    refId: recipeId,
    title: recipe.title,
    perServe: n.perServe,
    unknownNutrients: n.unknownNutrients,
    confidence: n.confidence,
  };
}

/** A core refusal as the error a screen reads (its reason is a fixed code). */
function draftOrThrow(
  result: { ok: true; draft: LogEntryDraft } | { ok: false; refusal: string },
): LogEntryDraft {
  if (!result.ok) throw new StorageRuleError('food_log', 'entry-refused', result.refusal);
  return result.draft;
}

/** The rows of the food stores a recipe or plan entry is worked out from, read in its transaction. */
interface RecipeRows {
  readonly own: IngredientRecord[];
  readonly overrides: IngredientOverrideRecord[];
  readonly stored: RecipeRecord[];
  readonly settings: SettingsRecord | undefined;
  readonly planDay: PlanDayRecord | undefined;
  /** The entries in the UTC cover of the date. */
  readonly rows: FoodLogRecord[];
}

const RECIPE_STORES = [
  'food_log',
  'ingredients',
  'ingredient_overrides',
  'recipes',
  'settings',
  'plan_days',
] as const;

/** Reads the rows a recipe or plan entry is worked out from, then runs `next`. @transactionScope */
function withRecipeRows<T>(
  db: DietDb,
  date: LocalDate,
  next: (rows: RecipeRows) => T | PromiseLike<T>,
): PromiseLike<T> {
  const { lower, upper } = utcRangeCovering(date, date);
  return Dexie.Promise.all([
    db.ingredients.toArray(),
    db.ingredient_overrides.toArray(),
    recipesInScope(db),
    db.settings.get('singleton'),
    planDayInScope(db, date),
    db.food_log.where('at').between(lower, upper, true, false).toArray(),
  ]).then(([own, overrides, stored, settings, planDay, rows]) =>
    next({ own, overrides, stored, settings, planDay, rows }),
  );
}

/**
 * The label rules as the write reads the records: item 13's alcohol gate from the readiness rows
 * and the profile (it depends only on answer 1 and the birth year), and the other label foods;
 * then runs `next`.
 * @transactionScope
 */
function withLabelRules<T>(
  db: DietDb,
  form: LabelFormInput,
  editingId: Id | null,
  today: LocalDate,
  next: (result: LabelFormResult, ingredients: IngredientRecord[]) => T | PromiseLike<T>,
): PromiseLike<T> {
  return Dexie.Promise.all([
    db.readiness.toArray(),
    db.profile.get('singleton'),
    db.ingredients.toArray(),
  ]).then(([readiness, profile, ingredients]) => {
    const gates = readinessGates(
      gateInputFromRecords({
        rows: readiness,
        birthYear: profile?.birthYear ?? null,
        heightCm: profile?.heightCm ?? null,
        currentWeightKg: null,
        today,
      }),
    );
    const result = parseLabelForm(form, {
      alcoholLoggingAvailable: gates.alcoholLoggingAvailable,
      otherLabelFoods: ingredients.filter((i) => i.source === 'label'),
      editingId,
    });
    return next(result, ingredients);
  });
}

export function foodLogRepo(ctx: RepoContext): FoodLogRepo {
  const crud = crudRepo(ctx, 'food_log');
  const { db, env } = ctx;

  const forLocalDates: FoodLogRepo['forLocalDates'] = async (from, to) => {
    const { lower, upper } = utcRangeCovering(from, to);
    const [rows, settings] = await db.transaction('r', ['food_log', 'settings'], () =>
      Dexie.Promise.all([
        db.food_log.where('at').between(lower, upper, true, false).toArray(),
        db.settings.get('singleton'),
      ]),
    );
    const home = homeOf(settings);
    return sortByAt(
      rows.filter((row) => {
        const date = entryLocalDate(row, home);
        return date >= from && date <= to;
      }),
    );
  };

  /** Now, the device zone and the entry's instant, taken before the transaction (D15). */
  const moment = (at: Instant | undefined) => {
    const now = env.now();
    if (at !== undefined && at > now) throw new StorageRuleError('food_log', 'future-time');
    return { now, zone: env.timeZone(), at: at ?? now };
  };

  const entryRow = (draft: LogEntryDraft, id: Id, at: Instant, zone: TimeZone) =>
    prepare('food_log', { id, at, timeZone: zone, ...draft }, env);

  const labelFoodOf = (result: LabelFormResult) => {
    if (result.ok) return result.food;
    const problem = Object.values(result.problems)[0];
    throw new StorageRuleError('ingredients', 'label-refused', problem ?? 'unconfirmed');
  };

  const logLabel: FoodLogRepo['logLabel'] = ({ foodId, amount, at }) =>
    guardedWrite(ctx, () => {
      const m = moment(at);
      const id = env.randomId();
      return db.transaction('rw', ['food_log', 'ingredients'], () =>
        db.ingredients.get(foodId).then((food) => {
          if (food === undefined || food.source !== 'label')
            throw new StorageRuleError('food_log', 'food-source-missing');
          const row = entryRow(draftOrThrow(labelEntry(food, amount)), id, m.at, m.zone);
          return db.food_log.add(row).then(() => row);
        }),
      );
    });

  const logNewLabelFood: FoodLogRepo['logNewLabelFood'] = ({ form, amount, at }) =>
    guardedWrite(ctx, () => {
      const m = moment(at);
      const foodId = env.randomId();
      const entryId = env.randomId();
      const today = localDateOf(m.now, m.zone);
      return db.transaction('rw', ['food_log', 'ingredients', 'readiness', 'profile'], () =>
        withLabelRules(db, form, null, today, (result) => {
          const parsed = labelFoodOf(result);
          const food = prepare('ingredients', labelIngredient(parsed, foodId, m.now), env);
          const entry = entryRow(draftOrThrow(labelEntry(food, amount)), entryId, m.at, m.zone);
          return db.ingredients
            .add(food)
            .then(() => db.food_log.add(entry))
            .then(() => ({ food, entry }));
        }),
      );
    });

  const saveLabelFood: FoodLogRepo['saveLabelFood'] = ({ id, form }) =>
    guardedWrite(ctx, () => {
      const now = env.now();
      const today = localDateOf(now, env.timeZone());
      return db.transaction('rw', ['ingredients', 'readiness', 'profile'], () =>
        withLabelRules(db, form, id, today, (result, ingredients) => {
          const stored = ingredients.find((i) => i.id === id);
          if (stored === undefined || stored.source !== 'label')
            throw new StorageRuleError('ingredients', 'food-source-missing');
          const parsed = labelFoodOf(result);
          const row = prepare(
            'ingredients',
            stampUpdate(
              'ingredients',
              stored as unknown as Record<string, unknown>,
              labelFoodChange(parsed, stored, now),
              env,
            ),
            env,
            stored,
          );
          return db.ingredients.put(row).then(() => row);
        }),
      );
    });

  const logRecipe: FoodLogRepo['logRecipe'] = ({ recipeId, serves, at, logAgain }) =>
    guardedWrite(ctx, () => {
      const m = moment(at);
      const id = env.randomId();
      const shipped = shippedData();
      const date = localDateOf(m.at, m.zone);
      return db.transaction('rw', [...RECIPE_STORES], () =>
        withRecipeRows(db, date, (r) => {
          const figures = portionFigures(recipeId, shipped, r.own, r.overrides, r.stored);
          if (figures === null) throw new StorageRuleError('food_log', 'food-source-missing');
          const home = homeOf(r.settings);
          if (
            logAgain !== true &&
            sameRecipeLogged(r.rows, r.planDay, date, recipeId, home) !== null
          )
            throw new StorageRuleError('food_log', 'already-logged');
          const row = entryRow(draftOrThrow(recipeEntry(figures, serves)), id, m.at, m.zone);
          return db.food_log.add(row).then(() => row);
        }),
      );
    });

  const logPlan: FoodLogRepo['logPlan'] = ({ date, slot, serves, at, logAgain }) =>
    guardedWrite(ctx, () => {
      const m = moment(at);
      const id = env.randomId();
      const shipped = shippedData();
      if (localDateOf(m.at, m.zone) !== date)
        throw new StorageRuleError('food_log', 'entry-other-day');
      return db.transaction('rw', [...RECIPE_STORES], () =>
        withRecipeRows(db, date, (r) => {
          const home = homeOf(r.settings);
          const meal = planMealsToLog(r.planDay, r.rows, date, home).find((p) => p.slot === slot);
          if (meal === undefined) throw new StorageRuleError('food_log', 'plan-not-found');
          if (meal.logged !== null && (meal.logged.by === 'plan' || logAgain !== true))
            throw new StorageRuleError('food_log', 'plan-slot-logged');
          const figures = portionFigures(meal.recipeId, shipped, r.own, r.overrides, r.stored);
          if (figures === null) throw new StorageRuleError('food_log', 'food-source-missing');
          const draft = draftOrThrow(planEntry(date, slot, figures, serves ?? meal.myServes));
          const row = entryRow(draft, id, m.at, m.zone);
          return db.food_log.add(row).then(() => row);
        }),
      );
    });

  const changeEntry: FoodLogRepo['changeEntry'] = (id, change) =>
    guardedWrite(ctx, () => {
      const m = moment(change.at);
      const rebuild = change.amount !== undefined || change.serves !== undefined;
      const shipped = rebuild ? shippedData() : null;
      return db.transaction('rw', [...RECIPE_STORES], () =>
        db.food_log.get(id).then((row) => {
          if (row === undefined) throw new StorageRuleError('food_log', 'not-found');
          return db.settings.get('singleton').then((settings) => {
            const day = entryLocalDate(row, homeOf(settings));
            if (change.at !== undefined && localDateOf(change.at, m.zone) !== day)
              throw new StorageRuleError('food_log', 'entry-other-day');
            const timing =
              change.at === undefined
                ? { at: row.at, timeZone: row.timeZone }
                : { at: change.at, timeZone: m.zone };
            if (!rebuild) {
              const next = prepare(
                'food_log',
                stampUpdate('food_log', row as unknown as Record<string, unknown>, timing, env),
                env,
                row,
              );
              return db.food_log.put(next).then(() => next);
            }
            const kindOk =
              row.sourceKind === 'label'
                ? change.amount !== undefined && change.serves === undefined
                : change.serves !== undefined && change.amount === undefined;
            if (!kindOk || row.sourceKind === 'estimate')
              throw new StorageRuleError('food_log', 'entry-refused');
            const plan = row.sourceKind === 'plan' ? planRefOf(row.refId) : null;
            return withRecipeRows(db, plan?.date ?? day, (r) => {
              const put = (draft: LogEntryDraft) => {
                const next = prepare('food_log', { id, ...timing, ...draft }, env, row);
                return db.food_log.put(next).then(() => next);
              };
              if (row.sourceKind === 'label') {
                const food = r.own.find((i) => i.id === row.refId && i.source === 'label');
                if (food === undefined || change.amount === undefined)
                  throw new StorageRuleError('food_log', 'food-source-missing');
                return put(draftOrThrow(labelEntry(food, change.amount)));
              }
              const serves = change.serves as number;
              const titleOf = (recipeId: RefId) =>
                shipped === null
                  ? null
                  : (portionFigures(recipeId, shipped, r.own, r.overrides, r.stored)?.title ??
                    null);
              const recipeId =
                plan === null
                  ? row.refId
                  : (planRowRebuildable(row, r.planDay, titleOf)?.recipeId ?? null);
              const figures =
                recipeId === null || shipped === null
                  ? null
                  : portionFigures(recipeId, shipped, r.own, r.overrides, r.stored);
              if (figures === null) throw new StorageRuleError('food_log', 'food-source-missing');
              return put(
                draftOrThrow(
                  plan === null
                    ? recipeEntry(figures, serves)
                    : planEntry(plan.date, plan.slot, figures, serves),
                ),
              );
            });
          });
        }),
      );
    });

  return {
    ...crud,
    forLocalDate: (date) => forLocalDates(date, date),
    forLocalDates,
    logLabel,
    logNewLabelFood,
    saveLabelFood,
    logRecipe,
    logPlan,
    changeEntry,
  };
}
