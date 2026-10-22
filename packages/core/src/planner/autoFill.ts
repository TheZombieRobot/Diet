/**
 * The optional auto-fill (item 22 design 3.9; HS-10, HS-25, NU-06, NU-07, P41, P43; item 20
 * section 7 steps 5 to 9; V10, V11, V16, V34, V43, V44). A proposal only: nothing is written here,
 * and the repository checks every day again when the owner accepts it.
 *
 * Per date, in order: only the empty slots the day plans (never an optional slot, never a stored
 * meal replaced); candidates are the ranked safe suggestions (allergen 'ok' only, so a recipe whose
 * allergens are not fully known is never filled), cut to the first five per slot when a day has
 * more than one empty slot. Combinations are tried in order of their summed ranks, first with the
 * preferences (no recipe in the same slot as the day before; the week's eggs held to six), then
 * without them. Portions start at one serve and rise by halves, the most protein-dense meal first,
 * to at most two serves (one for a single sitting after a reflux symptom). The first combination
 * whose day passes appDayCheck is proposed; with none, the date is refused with the first
 * combination's reason. Deterministic: the same input always gives the same output.
 */
import { MEAL_SLOTS } from '../fasting/mealCheck';
import type { RecipeChecks } from '../recipes/checks';
import { FIRST_WEEK_MAX_EGGS, PLANNER_MY_SERVES_MAX } from '../recipes/constants';
import type { RefId, SeedId } from '../storage/primitives';
import type { MealSlot, PlannedMealRecord } from '../storage/records';
import { plannerEnergyAim } from '../targets/energy';
import type { LocalDate } from '../util/time';
import { mealSharing, planAllergenDecision } from './allergens';
import type { MealSharing } from '../recipes/allergens';
import { type AppDayRefusal, appDayCheck, type PlanDayContext } from './checks';
import type { PlanRecipeLookup } from './context';
import { countedDay, figureComplete } from './figures';
import type { PlanCandidate } from './rank';
import { isSingleSittingPlan } from './slots';

export const AUTO_FILL_CANDIDATES_PER_SLOT = 5;

/** The step a raised portion takes (P43). */
const PORTION_STEP = 0.5;

export interface AutoFillDayInput {
  readonly ctx: PlanDayContext;
  /** The day's meals now. */
  readonly stored: readonly PlannedMealRecord[];
  /** suggestionsFor(...).ok for the slot and sharing, ranked. */
  readonly candidates: (slot: MealSlot, sharing: MealSharing) => readonly PlanCandidate[];
}

export interface AutoFillRecipeFacts {
  readonly checks: RecipeChecks;
  readonly oneMealOk: boolean;
  readonly usesLeftoversFrom: SeedId | null;
  readonly eggsPerServe: number;
  readonly title: string;
}

export interface AutoFillInput {
  /** The editable dates of the shown week, in order. */
  readonly days: readonly AutoFillDayInput[];
  /** profile.householdSize. */
  readonly householdSize: number;
  /** Item 20's ketoFirstWeek, only in the first planned week under a Kickstart or keto ceiling. */
  readonly firstWeek: {
    readonly dinners: readonly SeedId[];
    readonly snacks: readonly SeedId[];
  } | null;
  /** Σ eggsPerServe × myServes over the week's stored meals. */
  readonly eggsAlreadyPlanned: number;
  /** The meals of the date before the first input date. */
  readonly dayBefore: readonly PlannedMealRecord[];
  readonly facts: (id: RefId) => AutoFillRecipeFacts | null;
  readonly lookup: Pick<PlanRecipeLookup, 'checksOf' | 'resolve'>;
}

export type AutoFillDay =
  | {
      readonly date: LocalDate;
      readonly status: 'proposed';
      readonly meals: readonly PlannedMealRecord[];
    }
  | {
      readonly date: LocalDate;
      readonly status: 'refused';
      readonly refusal:
        AppDayRefusal | { readonly reason: 'no-candidates'; readonly slot: MealSlot };
    }
  | { readonly date: LocalDate; readonly status: 'nothing-to-fill' };

export type AutoFillRefusal = Extract<AutoFillDay, { readonly status: 'refused' }>['refusal'];

/** Every combination of one index per list, in order of the summed ranks, then slot by slot. */
function combinations(sizes: readonly number[]): number[][] {
  let out: number[][] = [[]];
  for (const size of sizes) {
    out = out.flatMap((prefix) => Array.from({ length: size }, (_, i) => [...prefix, i]));
  }
  const sum = (c: readonly number[]): number => c.reduce((a, b) => a + b, 0);
  return out.sort((a, b) => {
    const d = sum(a) - sum(b);
    if (d !== 0) return d;
    for (let i = 0; i < a.length; i += 1) {
      const x = (a[i] ?? 0) - (b[i] ?? 0);
      if (x !== 0) return x;
    }
    return 0;
  });
}

const slotOrder = (slot: MealSlot): number => MEAL_SLOTS.indexOf(slot);

const eggsOf = (meals: readonly PlannedMealRecord[], input: AutoFillInput): number =>
  meals.reduce((total, m) => total + (input.facts(m.recipeId)?.eggsPerServe ?? 0) * m.myServes, 0);

/** Raises the proposed portions by halves while the day's known energy or protein is short. */
function raisePortions(
  stored: readonly PlannedMealRecord[],
  proposed: PlannedMealRecord[],
  ctx: PlanDayContext,
  aimKj: number,
  input: AutoFillInput,
): PlannedMealRecord[] {
  const counted = stored.filter((m) => ctx.counted.includes(m.slot)).length + proposed.length;
  const cap = ctx.refluxDay && isSingleSittingPlan(ctx.slots, counted) ? 1 : PLANNER_MY_SERVES_MAX;
  const proteinPerServe = (m: PlannedMealRecord): number =>
    input.lookup.checksOf(m.recipeId)?.nutritionPerServe.proteinG ?? 0;
  let meals = proposed;
  for (;;) {
    const day = countedDay([...stored, ...meals], ctx.counted, input.lookup);
    const { totals } = day.figures;
    const short =
      (figureComplete(day.figures, 'energyKj') && totals.energyKj < aimKj) ||
      (figureComplete(day.figures, 'proteinG') &&
        totals.proteinG < ctx.targets.protein.checkTargetG);
    if (!short) return meals;
    const raisable = meals
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.myServes + PORTION_STEP <= cap)
      .sort(
        (a, b) =>
          proteinPerServe(b.m) - proteinPerServe(a.m) ||
          (a.m.slot === 'dinner' ? -1 : b.m.slot === 'dinner' ? 1 : 0) ||
          slotOrder(a.m.slot) - slotOrder(b.m.slot),
      );
    const pick = raisable[0];
    if (pick === undefined) return meals;
    meals = meals.map((m, i) => (i === pick.i ? { ...m, myServes: m.myServes + PORTION_STEP } : m));
  }
}

export function autoFillWeek(input: AutoFillInput): readonly AutoFillDay[] {
  const out: AutoFillDay[] = [];
  let previous: readonly PlannedMealRecord[] = input.dayBefore;
  let eggs = input.eggsAlreadyPlanned;
  input.days.forEach((dayInput, index) => {
    const { stored } = dayInput;
    const result = fillDay(dayInput, index + 1, previous, eggs, input);
    out.push(result);
    if (result.status === 'proposed') {
      eggs += eggsOf(result.meals, input);
      previous = [...stored, ...result.meals];
    } else {
      previous = stored;
    }
  });
  return out;
}

function fillDay(
  dayInput: AutoFillDayInput,
  k: number,
  previous: readonly PlannedMealRecord[],
  eggsSoFar: number,
  input: AutoFillInput,
): AutoFillDay {
  const { ctx, stored } = dayInput;
  const date = ctx.date;
  const aim = plannerEnergyAim(ctx.targets.energy);
  if (aim.kind === 'none') {
    return {
      date,
      status: 'refused',
      refusal: { reason: aim.reason === 'needs-guide' ? 'no-guide' : 'no-estimate' },
    };
  }
  const empty = ctx.slots.slots.filter((slot) => !stored.some((m) => m.slot === slot));
  if (empty.length === 0) return { date, status: 'nothing-to-fill' };

  const plannedBefore = new Set(previous.map((m) => m.recipeId));
  const lists: { slot: MealSlot; householdServes: number; list: PlanCandidate[] }[] = [];
  for (const slot of MEAL_SLOTS.filter((s) => empty.includes(s))) {
    const householdServes = slot === 'dinner' ? input.householdSize : 1;
    let list = dayInput.candidates(slot, mealSharing(householdServes)).filter((c) => {
      const from = input.facts(c.view.id)?.usesLeftoversFrom ?? null;
      return from === null || plannedBefore.has(from);
    });
    const firstId =
      input.firstWeek === null || k > 7
        ? undefined
        : slot === 'dinner'
          ? input.firstWeek.dinners[k - 1]
          : slot === 'snack'
            ? input.firstWeek.snacks[k - 1]
            : undefined;
    const first = list.find((c) => c.view.id === firstId);
    if (first !== undefined) list = [first, ...list.filter((c) => c !== first)];
    if (empty.length > 1) list = list.slice(0, AUTO_FILL_CANDIDATES_PER_SLOT);
    if (list.length === 0)
      return { date, status: 'refused', refusal: { reason: 'no-candidates', slot } };
    lists.push({ slot, householdServes, list });
  }

  const storedIds = new Set(stored.map((m) => m.recipeId));
  const sameSlotBefore = (slot: MealSlot, id: RefId): boolean =>
    previous.some((m) => m.slot === slot && m.recipeId === id);
  const singleSitting = isSingleSittingPlan(
    ctx.slots,
    stored.filter((m) => ctx.counted.includes(m.slot)).length + lists.length,
  );
  // Pass 2 (no preferences) runs only when pass 1 found nothing that passes; the refusal shown is
  // the first combination's.
  let firstRefusal: AppDayRefusal | null = null;
  for (const pass of [1, 2] as const) {
    for (const combo of combinations(lists.map((l) => l.list.length))) {
      const picks = combo.map((rank, i) => {
        const entry = lists[i];
        if (entry === undefined) throw new RangeError('combination out of range');
        const candidate = entry.list[rank];
        if (candidate === undefined) throw new RangeError('combination out of range');
        return { entry, candidate };
      });
      const ids = picks.map((p) => p.candidate.view.id);
      if (new Set([...ids, ...storedIds]).size !== ids.length + storedIds.size) continue;
      if (pass === 1 && picks.some((p) => sameSlotBefore(p.entry.slot, p.candidate.view.id))) {
        continue;
      }
      const proposed = raisePortions(
        stored,
        picks.map(({ entry, candidate }) => ({
          slot: entry.slot,
          recipeId: candidate.view.id,
          myServes: 1,
          householdServes: entry.householdServes,
        })),
        ctx,
        aim.kj,
        input,
      );
      if (pass === 1 && eggsSoFar + eggsOf(proposed, input) > FIRST_WEEK_MAX_EGGS) continue;
      // A second guard: candidates are 'ok' only, so this never refuses.
      const allergenOk = picks.every(
        ({ candidate }) =>
          planAllergenDecision({
            kind: 'auto-fill',
            blocked: [],
            serving: { serving: candidate.serving, conflicts: candidate.conflicts },
            allergensUnknown: candidate.view.allergens.facts.allergensUnknown,
            recipeId: candidate.view.id,
            labelChecked: [],
            conflictConfirmed: [],
          }).allowed,
      );
      if (!allergenOk) continue;
      const check = appDayCheck({
        day: countedDay([...stored, ...proposed], ctx.counted, input.lookup),
        ctx,
        kind: 'auto-fill',
        oneMealOk: (id) => input.facts(id)?.oneMealOk ?? false,
      });
      if (check.ok) return { date, status: 'proposed', meals: proposed };
      firstRefusal ??= withoutOk(check);
    }
  }
  if (firstRefusal === null) {
    // Every combination repeated a recipe already on the day.
    return {
      date,
      status: 'refused',
      refusal: { reason: 'no-candidates', slot: lists[0]?.slot ?? 'dinner' },
    };
  }
  const refusal = firstRefusal;
  // On a single-sitting reflux day the one-serve cap is why the day falls short: say so, and offer
  // the split meal and the snack (V44).
  const shortOnReflux =
    ctx.refluxDay &&
    singleSitting &&
    (refusal.reason === 'below-floor' ||
      refusal.reason === 'energy-short' ||
      refusal.reason === 'protein-short' ||
      refusal.reason === 'one-meal-short');
  return {
    date,
    status: 'refused',
    refusal: shortOnReflux
      ? { reason: 'one-meal-reflux', recipeId: lists[lists.length - 1]?.list[0]?.view.id ?? '' }
      : refusal,
  };
}

/** A failed check's refusal, without its `ok` field. */
export function withoutOk(check: { readonly ok: false } & AppDayRefusal): AppDayRefusal {
  return Object.fromEntries(
    Object.entries(check).filter(([key]) => key !== 'ok'),
  ) as unknown as AppDayRefusal;
}
