/**
 * The planner's writes (item 22 design 5.3; scan plannerHome rule 4): the only screen file that
 * names the app-made kinds. Every write goes through repos.planDays.writeMeals, which checks it
 * again inside its transaction; a refusal comes back as a value.
 */
import type { AllergenConfirmation, LocalDate, MealSlot, PlannedMealRecord } from '@diet/core';
import type { PlanWriteOutcome } from '../../db/repos/planDays';
import type { AppStorage } from '../../db/runtime';

/** The owner adds, changes (meal) or removes (null) one meal, with what they confirmed. */
export function writeOwnerMeal(
  storage: AppStorage,
  write: {
    readonly date: LocalDate;
    readonly slot: MealSlot;
    readonly meal: {
      readonly recipeId: string;
      readonly myServes: number;
      readonly householdServes: number;
    } | null;
  },
  confirmed: {
    readonly labelChecked?: readonly AllergenConfirmation[];
    readonly conflictConfirmed?: readonly AllergenConfirmation[];
  } = {},
): Promise<PlanWriteOutcome> {
  return storage.repos.planDays.writeMeals({
    kind: 'owner-meal',
    writes: [write],
    labelChecked: confirmed.labelChecked ?? [],
    conflictConfirmed: confirmed.conflictConfirmed ?? [],
  });
}

/** Writes the proposal shown when "Use this plan" or "Copy" was pressed. */
export function writeProposal(
  storage: AppStorage,
  kind: 'fillWeek' | 'copyWeek',
  days: readonly { readonly date: LocalDate; readonly meals: readonly PlannedMealRecord[] }[],
): Promise<PlanWriteOutcome> {
  return storage.repos.planDays.writeMeals({
    kind: kind === 'fillWeek' ? 'auto-fill' : 'copy',
    writes: days.flatMap(({ date, meals }) =>
      meals.map((m) => ({
        date,
        slot: m.slot,
        meal: { recipeId: m.recipeId, myServes: m.myServes, householdServes: m.householdServes },
      })),
    ),
    labelChecked: [],
    conflictConfirmed: [],
  });
}
