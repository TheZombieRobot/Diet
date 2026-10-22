/**
 * The one rule every plan write passes (item 22 design 3.11; HS-10, HS-23, HS-24, HS-25, HS-R18,
 * HS-R20, C07, C108; V7, V11, V23, V38, V41, V46, V47). The repository runs it inside the write's
 * transaction against the records as they are then, so a stale screen or a hand-made request
 * cannot get round the floor, the targets, the allergen rules or the slot rules.
 *
 * - Only the kinds a screen can send are written: the owner's own meal (exactly one meal), auto-fill
 *   and copy. Item 21's other kinds are refused until a later item designs them.
 * - Only dates in the planning range; only slots the day's window counts.
 * - Only the meals this request writes are judged (portion, wanted, allergens); meals already
 *   stored are kept as they are and take part only through the day's counted figures.
 * - An owner's day below the floor, or with energy not known, is written with a note (C108). A day
 *   the app makes must pass appDayCheck.
 * One date's refusal never blocks another; each date is all or nothing.
 */
import { MEAL_SLOTS } from '../fasting/mealCheck';
import { HOUSEHOLD_SERVES_LIMITS, MAX_MY_SERVES } from '../nutrition/portion';
import { blockedAllergens, servingFor } from '../recipes/allergens';
import { PLANNER_MY_SERVES_MAX } from '../recipes/constants';
import type { Allergen } from '../storage/allergens';
import type { RefId } from '../storage/primitives';
import type {
  DietMode,
  MealSlot,
  PlanDayRecord,
  PlannedMealRecord,
  ProfileRecord,
} from '../storage/records';
import type { PlanWriteKind } from '../targets/energy';
import type { LocalDate } from '../util/time';
import { type AllergenConfirmation, mealSharing, planAllergenDecision } from './allergens';
import { withoutOk } from './autoFill';
import {
  type AppDayRefusal,
  appDayCheck,
  type DayFloorNote,
  ownerDayFloorNote,
  type PlanDayContext,
} from './checks';
import type { PlanRecipeLookup } from './context';
import { OWNER_MY_SERVES_MAX } from './copyWeek';
import { countedDay } from './figures';
import { planDateState } from './week';

export interface PlanMealWrite {
  readonly date: LocalDate;
  readonly slot: MealSlot;
  /** null removes the slot's meal. */
  readonly meal: {
    readonly recipeId: RefId;
    readonly myServes: number;
    readonly householdServes: number;
  } | null;
}

export interface PlanWriteRequest {
  readonly kind: PlanWriteKind;
  readonly writes: readonly PlanMealWrite[];
  /** Confirmed by the owner in this action; never stored. */
  readonly labelChecked: readonly AllergenConfirmation[];
  /** 'owner-meal' only; never stored. */
  readonly conflictConfirmed: readonly AllergenConfirmation[];
}

export interface PlanWriteContext {
  readonly today: LocalDate;
  readonly day: (date: LocalDate) => PlanDayContext;
  readonly stored: (date: LocalDate) => PlanDayRecord | undefined;
  /** Live views (hidden, disliked, allergen facts) and checks. */
  readonly lookup: PlanRecipeLookup;
  readonly profile: Pick<ProfileRecord, 'allergens' | 'glutenFreeHousehold' | 'dietMode'>;
}

export type PlanWriteRefusal =
  | { readonly reason: 'kind' | 'past-day' | 'future-day' | 'portion' | 'replace' }
  | { readonly reason: 'slot'; readonly slot: MealSlot }
  | {
      readonly reason: 'recipe-missing' | 'label-check-needed' | 'not-wanted';
      readonly recipeId: RefId;
    }
  | {
      readonly reason: 'allergen-conflict';
      readonly recipeId: RefId;
      readonly conflicts: readonly Allergen[];
    }
  | AppDayRefusal;

export type PlanWriteDay =
  | {
      readonly date: LocalDate;
      readonly status: 'write';
      readonly meals: readonly PlannedMealRecord[];
      readonly dietMode: DietMode;
      readonly floorNote: DayFloorNote;
    }
  | { readonly date: LocalDate; readonly status: 'refused'; readonly refusal: PlanWriteRefusal };

/** The kinds a screen can send now; item 21's other kinds are refused until designed (V7). */
export const BUILT_PLAN_WRITE_KINDS = Object.freeze([
  'owner-meal',
  'auto-fill',
  'copy',
] as const satisfies readonly PlanWriteKind[]);

const isBuiltKind = (kind: unknown): kind is (typeof BUILT_PLAN_WRITE_KINDS)[number] =>
  (BUILT_PLAN_WRITE_KINDS as readonly unknown[]).includes(kind);

function checkDate(
  kind: (typeof BUILT_PLAN_WRITE_KINDS)[number],
  date: LocalDate,
  writes: readonly PlanMealWrite[],
  request: PlanWriteRequest,
  ctx: PlanWriteContext,
): PlanWriteDay {
  const refused = (refusal: PlanWriteRefusal): PlanWriteDay => ({
    date,
    status: 'refused',
    refusal,
  });
  const state = planDateState(date, ctx.today);
  if (state === 'past') return refused({ reason: 'past-day' });
  if (state === 'too-far') return refused({ reason: 'future-day' });
  const day = ctx.day(date);
  const appMade = kind !== 'owner-meal';
  const bySlot = new Map<MealSlot, PlannedMealRecord>(
    (ctx.stored(date)?.meals ?? []).map((m) => [m.slot, { ...m }]),
  );
  for (const write of writes) {
    if (write.meal === null) {
      if (appMade) return refused({ reason: 'kind' });
      bySlot.delete(write.slot);
      continue;
    }
    const { recipeId, myServes, householdServes } = write.meal;
    if (!day.counted.includes(write.slot)) return refused({ reason: 'slot', slot: write.slot });
    const view = ctx.lookup.viewOf(recipeId);
    if (view === null) return refused({ reason: 'recipe-missing', recipeId });
    // An owner's change that leaves a stored (imported) portion above 4 as it was writes it back
    // unchanged, within the validator's bound; a new portion is held to 4 (V12).
    const kept = !appMade && bySlot.get(write.slot)?.myServes === myServes;
    const maxServes =
      kind === 'auto-fill' ? PLANNER_MY_SERVES_MAX : kept ? MAX_MY_SERVES : OWNER_MY_SERVES_MAX;
    if (
      !Number.isFinite(myServes) ||
      !(myServes > 0) ||
      myServes > maxServes ||
      !Number.isInteger(householdServes) ||
      householdServes < HOUSEHOLD_SERVES_LIMITS.min ||
      householdServes > HOUSEHOLD_SERVES_LIMITS.max
    ) {
      return refused({ reason: 'portion' });
    }
    if (appMade && bySlot.has(write.slot)) return refused({ reason: 'replace' });
    if (appMade && (view.hidden || view.disliked))
      return refused({ reason: 'not-wanted', recipeId });
    const blocked = blockedAllergens(ctx.profile, mealSharing(householdServes));
    const serving = servingFor(blocked, view.allergens.facts);
    const decision = planAllergenDecision({
      kind,
      blocked,
      serving,
      allergensUnknown: view.allergens.facts.allergensUnknown,
      recipeId,
      labelChecked: request.labelChecked,
      conflictConfirmed: request.conflictConfirmed,
    });
    if (!decision.allowed) {
      return refused(
        decision.refusal === 'allergen-conflict'
          ? { reason: 'allergen-conflict', recipeId, conflicts: serving.conflicts }
          : { reason: 'label-check-needed', recipeId },
      );
    }
    bySlot.set(write.slot, { slot: write.slot, recipeId, myServes, householdServes });
  }
  const meals = MEAL_SLOTS.flatMap((slot) => {
    const meal = bySlot.get(slot);
    return meal === undefined ? [] : [meal];
  });
  const counted = countedDay(meals, day.counted, ctx.lookup);
  let floorNote: DayFloorNote = null;
  if (appMade) {
    const check = appDayCheck({
      day: counted,
      ctx: day,
      kind,
      oneMealOk: (id) => ctx.lookup.viewOf(id)?.oneMealOk ?? false,
    });
    if (!check.ok) return refused(withoutOk(check));
  } else {
    floorNote = ownerDayFloorNote(counted, day);
  }
  return { date, status: 'write', meals, dietMode: ctx.profile.dietMode, floorNote };
}

export function checkPlanWrite(
  request: PlanWriteRequest,
  ctx: PlanWriteContext,
): readonly PlanWriteDay[] {
  const dates = [...new Set(request.writes.map((w) => w.date))];
  const { kind } = request;
  // An owner write changes exactly one meal, so a bulk write is never labelled the owner's and a
  // confirmation never covers more than one meal (item 21 T28; contract 10 rule 4).
  if (!isBuiltKind(kind) || (kind === 'owner-meal' && request.writes.length !== 1)) {
    return dates.map((date) => ({ date, status: 'refused', refusal: { reason: 'kind' } }));
  }
  return dates.map((date) =>
    checkDate(
      kind,
      date,
      request.writes.filter((w) => w.date === date),
      request,
      ctx,
    ),
  );
}
