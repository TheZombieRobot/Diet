/**
 * A day of the food log (item 23 design 2.5; C11, C32, HS-18, HS-23, HS-R18, HS-R23).
 *
 * - Each row belongs to the local date of its instant in its own recorded zone (D6).
 * - A planned meal counts once: the plan panel and the repository see a plan row for its slot, or
 *   a recipe row of the same recipe; item 15's meal check counts one row per planned slot, so a
 *   restored duplicate never doubles the protein it reads.
 * - Alcohol energy never counts as food in a check (C11): a label (or restored estimate) entry's
 *   energy counts as at most what its protein, fat, carbohydrate and fibre give, whatever its name.
 *   The error is low, which offers the snack more often (the safe direction).
 * - A date with no entries is "nothing logged" (empty), never a day that met or missed a target.
 * - Badges go through item 18's entryConfidence and foodBadge: none when every figure reads "not
 *   known" (contract 5).
 */
import { foodBadge } from '../foods/figures';
import type { DatabaseSource } from '../foods/types';
import { entryConfidence } from '../foods/view';
import { APPROVED_NUTRIENT_SOURCES } from '../foods/approval';
import { type LoggedIntake, loggedIntakeOn, MEAL_SLOTS } from '../fasting/mealCheck';
import type { Confidence } from '../nutrition/confidence';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import { recordLocalDate } from '../storage/kickstart';
import type { Id, Instant, RefId, TimeZone } from '../storage/primitives';
import type {
  FoodLogRecord,
  MealSlot,
  NutrientBasis,
  NutrientKey,
  PlanDayRecord,
} from '../storage/records';
import { type DayIntake, dayIntake, type DrinkEntryLike } from '../targets/intake';
import type { LocalDate } from '../util/time';
import { labelEnergyKj } from './labelForm';

/** The local date of an entry, in its own zone, falling back to the home zone. */
export function entryLocalDate(
  row: Pick<FoodLogRecord, 'at' | 'timeZone'>,
  home: TimeZone,
): LocalDate {
  return recordLocalDate(row.at, row.timeZone, home);
}

const byTime = (a: FoodLogRecord, b: FoodLogRecord): number =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const rowsOn = (rows: readonly FoodLogRecord[], date: LocalDate, home: TimeZone) =>
  rows.filter((row) => entryLocalDate(row, home) === date).sort(byTime);

/** The badge an entry shows (contract 5; C97): null when every figure reads "not known". */
export function entryBadge(
  entry: Pick<FoodLogRecord, 'confidence' | 'nutrients' | 'unknownNutrients'>,
  approved: readonly DatabaseSource[] = APPROVED_NUTRIENT_SOURCES,
): Confidence | null {
  return foodBadge({
    confidence: entryConfidence(entry, approved),
    nutrients: entry.nutrients,
    unknownNutrients: entry.unknownNutrients,
  });
}

export interface LogDay {
  readonly date: LocalDate;
  /** On the date in each row's own zone, by time, then id. */
  readonly entries: readonly FoodLogRecord[];
  /** Item 21's dayIntake: food and alcohol apart (drinks only for the alcohol line). */
  readonly intake: DayIntake;
  /** NUTRIENT_KEYS some entry lacks. */
  readonly unknownKeys: readonly NutrientKey[];
  /** At least one entry, and none shows a figure (every entryBadge is null). */
  readonly noneKnown: boolean;
}

export function logDay(
  rows: readonly FoodLogRecord[],
  drinks: readonly DrinkEntryLike[],
  date: LocalDate,
  home: TimeZone,
  approved: readonly DatabaseSource[] = APPROVED_NUTRIENT_SOURCES,
): LogDay {
  const entries = rowsOn(rows, date, home);
  const intake = dayIntake(entries, drinks);
  return {
    date,
    entries,
    intake,
    unknownKeys: NUTRIENT_KEYS.filter((k) => intake.unknownCounts[k] > 0),
    noneKnown: entries.length > 0 && entries.every((e) => entryBadge(e, approved) === null),
  };
}

const slotOfRef = (refId: string | null, date: LocalDate): MealSlot | null =>
  MEAL_SLOTS.find((slot) => refId === `${date}#${slot}`) ?? null;

export type PlanSlotLog =
  | { readonly by: 'plan'; readonly entryId: Id; readonly name: string }
  | { readonly by: 'recipe'; readonly entryId: Id; readonly at: Instant };

export interface PlanMealToLog {
  readonly slot: MealSlot;
  readonly recipeId: RefId;
  readonly myServes: number;
  readonly logged: PlanSlotLog | null;
}

/**
 * The date's planned meals for the owner (myServes above 0), in slot order, each with how it is
 * already in the log: its plan row, or a recipe row of the same recipe (one row covers one slot).
 */
export function planMealsToLog(
  planDay: Pick<PlanDayRecord, 'date' | 'meals'> | undefined,
  rows: readonly FoodLogRecord[],
  date: LocalDate,
  home: TimeZone,
): PlanMealToLog[] {
  if (planDay === undefined || planDay.date !== date) return [];
  const onDate = rowsOn(rows, date, home);
  const taken = new Set<Id>();
  return MEAL_SLOTS.flatMap((slot) => {
    const meal = planDay.meals.find((m) => m.slot === slot && m.myServes > 0);
    if (meal === undefined) return [];
    const planRow = onDate.find(
      (r) => r.sourceKind === 'plan' && slotOfRef(r.refId, date) === slot,
    );
    let logged: PlanSlotLog | null = null;
    if (planRow !== undefined) {
      logged = { by: 'plan', entryId: planRow.id, name: planRow.name };
    } else {
      const recipeRow = onDate.find(
        (r) => r.sourceKind === 'recipe' && r.refId === meal.recipeId && !taken.has(r.id),
      );
      if (recipeRow !== undefined) {
        taken.add(recipeRow.id);
        logged = { by: 'recipe', entryId: recipeRow.id, at: recipeRow.at };
      }
    }
    return [{ slot, recipeId: meal.recipeId, myServes: meal.myServes, logged }];
  });
}

/** The earliest entry on the date that is this recipe: a recipe row, or a plan row of a slot planned with it. */
export function sameRecipeLogged(
  rows: readonly FoodLogRecord[],
  planDay: Pick<PlanDayRecord, 'meals'> | undefined,
  date: LocalDate,
  recipeId: RefId,
  home: TimeZone,
): FoodLogRecord | null {
  return (
    rowsOn(rows, date, home).find((row) => {
      if (row.sourceKind === 'recipe') return row.refId === recipeId;
      if (row.sourceKind !== 'plan') return false;
      const slot = slotOfRef(row.refId, date);
      return planDay?.meals.some((m) => m.slot === slot && m.recipeId === recipeId) ?? false;
    }) ?? null
  );
}

/** The plan date and slot of a plan row's ref ('2026-10-18#dinner'). */
export function planRefOf(
  refId: string | null,
): { readonly date: LocalDate; readonly slot: MealSlot } | null {
  const m = refId === null ? null : /^(\d{4}-\d{2}-\d{2})#([a-z0-9]+)$/.exec(refId);
  const slot = MEAL_SLOTS.find((s) => s === m?.[2]);
  return m?.[1] === undefined || slot === undefined ? null : { date: m[1], slot };
}

/**
 * A plan row can be rebuilt from its slot's recipe only while the slot still holds a meal for the
 * owner whose recipe's title is the row's name (a re-planned slot is another food).
 */
export function planRowRebuildable(
  row: Pick<FoodLogRecord, 'sourceKind' | 'refId' | 'name'>,
  planDay: Pick<PlanDayRecord, 'meals'> | undefined,
  titleOf: (recipeId: RefId) => string | null,
): { readonly recipeId: RefId } | null {
  const ref = row.sourceKind === 'plan' ? planRefOf(row.refId) : null;
  const meal = planDay?.meals.find((m) => m.slot === ref?.slot && m.myServes > 0);
  if (meal === undefined) return null;
  return titleOf(meal.recipeId) === row.name ? { recipeId: meal.recipeId } : null;
}

/**
 * The energy a check counts for an entry (C11): a label or estimate entry's energy as at most what
 * its protein, fat, carbohydrate and fibre give, so alcohol energy typed on a label never meets a
 * check; a recipe or plan entry's own figure. Unknown figures are stored as 0 and only lower it.
 */
export function energyForChecks(row: Pick<FoodLogRecord, 'sourceKind' | 'nutrients'>): number {
  const n = row.nutrients;
  if (row.sourceKind === 'recipe' || row.sourceKind === 'plan') return n.energyKj;
  return Math.min(
    n.energyKj,
    labelEnergyKj({
      proteinG: n.proteinG,
      fatG: n.fatG,
      carbsAvailableG: n.carbsG,
      fibreG: n.fibreG,
    }),
  );
}

/**
 * What item 15's meal check reads of the log for a date: one row per planned slot (the earliest),
 * label energy capped by energyForChecks, and `empty` for a date with no entries. Never null.
 */
export function loggedIntakeForMealCheck(
  rows: readonly FoodLogRecord[],
  date: LocalDate,
  home: TimeZone,
): LoggedIntake {
  const onDate = rowsOn(rows, date, home);
  const seenSlots = new Set<MealSlot>();
  const prepared = onDate.flatMap((row) => {
    const slot = row.sourceKind === 'plan' ? slotOfRef(row.refId, date) : null;
    if (slot !== null) {
      if (seenSlots.has(slot)) return [];
      seenSlots.add(slot);
    }
    return [{ ...row, nutrients: { ...row.nutrients, energyKj: energyForChecks(row) } }];
  });
  return { ...loggedIntakeOn(date, prepared, home), empty: prepared.length === 0 };
}

export type EntryAmount =
  | { readonly kind: 'grams'; readonly grams: number; readonly state: NutrientBasis }
  | { readonly kind: 'label-serves'; readonly serves: number; readonly grams: number }
  | { readonly kind: 'serves'; readonly serves: number };

/** How an entry's amount reads: "150 g cooked", "2 serves (60 g)", "1.5 serves". */
export function entryAmount(
  row: Pick<FoodLogRecord, 'sourceKind' | 'grams' | 'weightBasis' | 'servings'>,
): EntryAmount {
  if (row.grams !== null && row.weightBasis !== null) {
    return row.servings !== null && row.sourceKind === 'label'
      ? { kind: 'label-serves', serves: row.servings, grams: row.grams }
      : { kind: 'grams', grams: row.grams, state: row.weightBasis };
  }
  return { kind: 'serves', serves: row.servings ?? 0 };
}

const newestFirst = (rows: readonly FoodLogRecord[]) => [...rows].sort((a, b) => byTime(b, a));

/** Recipes logged recently, newest first, each once: recipe rows, and plan rows through their plan day. */
export function recentRecipeIds(
  rows: readonly FoodLogRecord[],
  planDays: readonly Pick<PlanDayRecord, 'date' | 'meals'>[],
  limit: number,
): RefId[] {
  const ids: RefId[] = [];
  for (const row of newestFirst(rows)) {
    let id: RefId | null = null;
    if (row.sourceKind === 'recipe') id = row.refId;
    else if (row.sourceKind === 'plan') {
      const ref = planRefOf(row.refId);
      id =
        planDays.find((d) => d.date === ref?.date)?.meals.find((m) => m.slot === ref?.slot)
          ?.recipeId ?? null;
    }
    if (id !== null && !ids.includes(id)) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** Label foods logged recently, newest first, each once. */
export function recentLabelFoodIds(rows: readonly FoodLogRecord[], limit: number): RefId[] {
  const ids: RefId[] = [];
  for (const row of newestFirst(rows)) {
    if (row.sourceKind === 'label' && row.refId !== null && !ids.includes(row.refId))
      ids.push(row.refId);
    if (ids.length >= limit) break;
  }
  return ids;
}
