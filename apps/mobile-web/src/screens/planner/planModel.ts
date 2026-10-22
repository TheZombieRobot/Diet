/**
 * The pure builders the planner screens render (item 22 design 5.2): everything a screen shows is
 * worked out here from core's planner functions over one live read, so the week card, the Day
 * screen and the recipe page's Add to plan judge a day exactly as the repository's write does.
 * Nothing here formats a figure (item 18 1.4) or writes.
 */
import {
  addDays,
  type AutoFillDay,
  autoFillWeek,
  blockedAllergens,
  cholesterolCheckinDue,
  type CopyDay,
  copyWeekProposal,
  type CountedDay,
  countedDay,
  type DayTargetsView,
  type EatingWindow,
  electrolyteCopyKeys,
  electrolyteReminderDue,
  energyForMealChecks,
  type GardenStockFacts,
  isFirstPlannedWeek,
  isSingleSittingPlan,
  isSnackAdded,
  joinList,
  type LocalDate,
  type MealCheckResult,
  mealCheck,
  type MealSlot,
  mealSharing,
  type PlanData,
  type PlanDayContext,
  type PlanDayDisplay,
  type PlanDayRecord,
  planDayContextFor,
  planDayDisplay,
  type PlannedMealRecord,
  type PlannerClock,
  type PlannerSchedule,
  plannerScheduleOf,
  type PlanRecipeLookup,
  planRecipeLookup,
  type PlanRecords,
  planTargetsBase,
  planWeekDates,
  readyGardenIngredientIds,
  type RecipeView,
  type RefId,
  snackThatFits,
  stockByIngredient,
  type Suggestions,
  suggestionsFor,
  usesKetoFirstWeek,
} from '@diet/core';
import { foods } from '@diet/core/copy/health';
import type { ReminderItem } from '../today/view';
import type { PlanWeekInputs } from './usePlanWeek';

export interface PlanModel {
  readonly clock: PlannerClock;
  readonly inputs: PlanWeekInputs;
  readonly data: PlanData;
  /** Today's targets view: gates, display and figures (item 21). */
  readonly view: DayTargetsView;
  readonly records: PlanRecords;
  readonly ps: PlannerSchedule;
  readonly dayCtx: (date: LocalDate) => PlanDayContext;
  readonly lookup: PlanRecipeLookup;
  readonly stock: GardenStockFacts;
  /** 1–12 in the device zone. */
  readonly month: number;
}

export function planModel(inputs: PlanWeekInputs, clock: PlannerClock, data: PlanData): PlanModel {
  const records: PlanRecords = {
    ...inputs.targetRecords,
    planDays: inputs.planDays,
    ownRecipes: inputs.recipeRows.recipes,
    ownIngredients: inputs.recipeRows.own,
    overrides: inputs.recipeRows.overrides,
    symptoms: inputs.symptoms,
  };
  const base = planTargetsBase(records, clock);
  const ps = plannerScheduleOf(records, base, clock);
  const daysLeft = new Map<RefId, number | null>();
  for (const [id, lines] of stockByIngredient(inputs.stock)) {
    const days = lines.flatMap((l) =>
      l.source === 'garden' && l.daysLeft !== null ? [l.daysLeft] : [],
    );
    daysLeft.set(id, days.length === 0 ? null : Math.min(...days));
  }
  return {
    clock,
    inputs,
    data,
    view: base.view,
    records,
    ps,
    dayCtx: planDayContextFor(records, clock, ps, base),
    lookup: planRecipeLookup(data, {
      ownRecipes: inputs.recipeRows.recipes,
      ownIngredients: inputs.recipeRows.own,
      overrides: inputs.recipeRows.overrides,
      profile: inputs.recipeRows.profile,
      hiddenSeedIds: inputs.recipeRows.hiddenSeedIds,
      satFatBudgetG:
        base.view.targets.saturatedFat.kind === 'budget'
          ? base.view.targets.saturatedFat.grams
          : null,
    }),
    stock: { ready: readyGardenIngredientIds(inputs.stock, clock.at), daysLeft },
    month: Number(clock.today.slice(5, 7)),
  };
}

export const rowOf = (model: PlanModel, date: LocalDate): PlanDayRecord | undefined =>
  model.inputs.planDays.find((d) => d.date === date);

export interface PlanDayView {
  readonly ctx: PlanDayContext;
  readonly row: PlanDayRecord | undefined;
  readonly day: CountedDay;
  readonly display: PlanDayDisplay;
  /** Item 15's per-day 5 pm snack is added (never on a past date: its window then is not known). */
  readonly snackAdded: boolean;
  /** The 5 pm snack window when it can be added now (none during a stop-sign pause, F20). */
  readonly snack: EatingWindow | null;
  /** The single-sitting meal check on an editable windowed day; null otherwise (2.13). */
  readonly sitting: MealCheckResult | null;
}

export function planDayView(model: PlanModel, date: LocalDate): PlanDayView {
  const ctx = model.dayCtx(date);
  const row = rowOf(model, date);
  const day = countedDay(row?.meals ?? [], ctx.counted, model.lookup);
  const editable = ctx.state === 'editable';
  const singleSitting =
    editable && ctx.window !== null && isSingleSittingPlan(ctx.slots, day.counted.length);
  return {
    ctx,
    row,
    day,
    display: planDayDisplay(day, ctx),
    snackAdded: ctx.state !== 'past' && isSnackAdded(date, model.ps.schedule),
    snack:
      editable && !model.ps.stopSignPause
        ? snackThatFits(date, model.ps.schedule, model.clock.deviceZone, Date.parse(model.clock.at))
        : null,
    sitting: singleSitting
      ? mealCheck({
          proteinTargetG: ctx.targets.protein.checkTargetG,
          dayEnergyTargetKj: energyForMealChecks(ctx.targets.energy),
          planned: day.sitting.length === 0 ? null : day.sitting,
          logged: null,
          windowClosed: false,
          oneMealWindow: ctx.slots.pattern === 'one-meal',
        })
      : null,
  };
}

/** The ranked suggestions for one meal, with the blocked list for its sharing (FL-07). */
export function suggestionsAt(
  model: PlanModel,
  date: LocalDate,
  slot: MealSlot,
  householdServes: number,
): Suggestions {
  const ctx = model.dayCtx(date);
  const profile = model.records.profile;
  return suggestionsFor({
    slot,
    day: ctx.slots,
    views: model.lookup.listed(),
    blocked: blockedAllergens(profile, mealSharing(householdServes)),
    blockedOwn: blockedAllergens(profile, 'own'),
    hiddenSeedIds: new Set(model.inputs.recipeRows.hiddenSeedIds),
    ceiling: ctx.targets.netCarbs,
    stock: model.stock,
    seasonOf: (id) => model.lookup.resolve(id)?.seasonMonths ?? [],
    month: model.month,
    firstWeek: isFirstPlannedWeek(model.inputs.hasMealsBefore),
  });
}

/** The editable dates of a display week. */
export const editableDates = (model: PlanModel, weekStart: LocalDate): LocalDate[] =>
  planWeekDates(weekStart).filter((d) => model.dayCtx(d).state === 'editable');

/** Auto-fill's proposal for the shown week's editable dates (design 2.6, 3.9). */
export function fillProposal(model: PlanModel, weekStart: LocalDate): readonly AutoFillDay[] {
  const dates = editableDates(model, weekStart);
  const first = dates[0];
  if (first === undefined) return [];
  const { lookup } = model;
  const firstWeek =
    isFirstPlannedWeek(model.inputs.hasMealsBefore) &&
    usesKetoFirstWeek(model.dayCtx(first).targets.netCarbs)
      ? model.data.recipes.ketoFirstWeek
      : null;
  const weekMeals = planWeekDates(weekStart).flatMap((d) => rowOf(model, d)?.meals ?? []);
  return autoFillWeek({
    days: dates.map((date) => ({
      ctx: model.dayCtx(date),
      stored: rowOf(model, date)?.meals ?? [],
      candidates: (slot, sharing) =>
        suggestionsAt(model, date, slot, sharing === 'shared' ? 2 : 1).ok,
    })),
    householdSize: model.records.profile.householdSize,
    firstWeek,
    eggsAlreadyPlanned: weekMeals.reduce(
      (n, m) => n + (lookup.viewOf(m.recipeId)?.eggsPerServe ?? 0) * m.myServes,
      0,
    ),
    dayBefore: rowOf(model, addDays(first, -1))?.meals ?? [],
    facts: (id) => {
      const view = lookup.viewOf(id);
      const checks = lookup.checksOf(id);
      return view === null || checks === null
        ? null
        : {
            checks,
            oneMealOk: view.oneMealOk,
            usesLeftoversFrom: view.usesLeftoversFrom?.id ?? null,
            eggsPerServe: view.eggsPerServe,
            title: view.title,
          };
    },
    lookup,
  });
}

/** Copy's proposal: each day of the shown week to the same weekday of the following week. */
export function copyProposal(model: PlanModel, weekStart: LocalDate): readonly CopyDay[] {
  return copyWeekProposal({
    days: planWeekDates(weekStart).map((source) => {
      const target = addDays(source, 7);
      return {
        source,
        target,
        sourceMeals: rowOf(model, source)?.meals ?? [],
        targetMeals: rowOf(model, target)?.meals ?? [],
        ctx: model.dayCtx(target),
      };
    }),
    lookup: model.lookup,
    profile: model.records.profile,
  });
}

/** The planner's side of item 16's reminders (C72, C109): electrolytes, then cholesterol. */
export function plannerReminders(model: PlanModel): ReminderItem[] {
  const { view, inputs, clock } = model;
  const profile = model.records.profile;
  const items: ReminderItem[] = [];
  if (
    electrolyteReminderDue({
      now: clock.at,
      gates: view.gates,
      dietMode: profile.dietMode,
      kickstartToday: model.ps.kickstartToday,
      carbCeilingStartedAt: profile.carbCeilingStartedAt,
      row: inputs.cards.electrolyte,
    })
  ) {
    items.push({ kind: 'electrolytes', lines: electrolyteCopyKeys(view.gates) });
  }
  const trigger = cholesterolCheckinDue({
    now: clock.at,
    onboardingCompletedAt: model.records.settings.onboardingCompletedAt,
    firstLowCarbAt: profile.firstLowCarbAt,
    profileCreatedAt: profile.createdAt,
    rows: inputs.cards.cholesterol,
  });
  if (trigger !== null) items.push({ kind: 'cholesterol', trigger });
  return items;
}

/** A meal is the owner's portion and household serves as stored, or the defaults (V12). */
export function startingServes(
  model: PlanModel,
  slot: MealSlot,
  meal: PlannedMealRecord | null,
): { readonly myServes: number; readonly householdServes: number } {
  return {
    myServes: meal?.myServes ?? 1,
    householdServes:
      meal?.householdServes ?? (slot === 'dinner' ? model.records.profile.householdSize : 1),
  };
}

/** Ready garden foods a recipe uses, by name (C57: never an amount). */
export function gardenFoods(model: PlanModel, view: RecipeView): string | null {
  const names = [
    ...new Set(view.lines.filter((l) => model.stock.ready.has(l.ingredientId)).map((l) => l.name)),
  ];
  return names.length === 0 ? null : joinList(names, foods.listComma, foods.listAnd);
}
