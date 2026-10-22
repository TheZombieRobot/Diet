/**
 * The meals a day plans, from its eating window (item 22 design 3.2; C07, C73, HS-03, HS-17,
 * HS-22; V4, V38, V49). No window (fasting switched off by readiness, or no fasting plan):
 * breakfast, lunch and dinner with an optional snack, at least three eating occasions. A one-meal
 * window (under 2 hours): dinner only; the 5 pm snack comes only through item 15's per-day window.
 * 2 to under 4 hours (22:2): a snack and dinner. 4 hours or more: a first meal and dinner, with an
 * optional snack when 5 pm is inside the window. The window never reaches a figure: these
 * functions take no targets, and the targets take no window (HS-22).
 */
import { type EatingWindow, parseClockTime, windowLength } from '../fasting/eatingWindow';
import { MEAL_SLOTS } from '../fasting/mealCheck';
import { isOneMealWindow, SNACK_TIME, windowContains } from '../fasting/windows';
import type { MealSlot } from '../storage/records';

export type SlotPattern = 'ordinary' | 'one-meal' | 'snack-and-dinner' | 'two-meals';

export interface DaySlots {
  readonly pattern: SlotPattern;
  /** The slots the planner fills, in MEAL_SLOTS order. */
  readonly slots: readonly MealSlot[];
  /** Slots the owner may add; never auto-filled. */
  readonly optional: readonly MealSlot[];
}

/** A window of 4 hours or more (20:4 and longer) plans two meals. */
const TWO_MEALS_MIN_EATING_MINUTES = 240;

export function planSlotsFor(window: EatingWindow | null): DaySlots {
  if (window === null) {
    return { pattern: 'ordinary', slots: ['breakfast', 'lunch', 'dinner'], optional: ['snack'] };
  }
  if (isOneMealWindow(window)) return { pattern: 'one-meal', slots: ['dinner'], optional: [] };
  if (windowLength(window).eatingMinutes < TWO_MEALS_MIN_EATING_MINUTES) {
    return { pattern: 'snack-and-dinner', slots: ['snack', 'dinner'], optional: [] };
  }
  return {
    pattern: 'two-meals',
    slots: ['meal1', 'dinner'],
    optional: windowContains(window, SNACK_TIME) ? ['snack'] : [],
  };
}

/** The slots a day counts and accepts: its slots and optional ones, in MEAL_SLOTS order. */
export function allowedSlots(day: DaySlots): readonly MealSlot[] {
  return MEAL_SLOTS.filter((slot) => day.slots.includes(slot) || day.optional.includes(slot));
}

/** Item 15's single-sitting definition: a one-meal window, or a plan of exactly one counted meal. */
export function isSingleSittingPlan(day: DaySlots, countedMeals: number): boolean {
  return day.pattern === 'one-meal' || countedMeals === 1;
}

/** The meals whose slot is counted, and the rest, each in MEAL_SLOTS order (V38). */
export function mealsInWindow<M extends { readonly slot: MealSlot }>(
  meals: readonly M[],
  counted: readonly MealSlot[],
): { readonly inWindow: readonly M[]; readonly outside: readonly M[] } {
  const ordered = MEAL_SLOTS.flatMap((slot) => meals.filter((m) => m.slot === slot));
  return {
    inWindow: ordered.filter((m) => counted.includes(m.slot)),
    outside: ordered.filter((m) => !counted.includes(m.slot)),
  };
}

export type SlotLabelKey =
  'breakfast' | 'lunch' | 'meal1' | 'snack' | 'snackAtFive' | 'mainMeal' | 'dinner';

/** The word a slot gets on a day (V49); the stored slot ids never change. */
export function slotLabelKey(slot: MealSlot, window: EatingWindow | null): SlotLabelKey {
  if (slot === 'dinner') {
    if (window === null) return 'dinner';
    const start = parseClockTime(window.start);
    const end = parseClockTime(window.end);
    return end > start && end <= parseClockTime(SNACK_TIME) ? 'mainMeal' : 'dinner';
  }
  if (slot === 'snack' && window !== null && planSlotsFor(window).pattern === 'snack-and-dinner') {
    if (window.start === SNACK_TIME) return 'snackAtFive';
    return windowContains(window, SNACK_TIME) ? 'snack' : 'meal1';
  }
  return slot;
}
