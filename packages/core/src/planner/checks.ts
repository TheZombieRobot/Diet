/**
 * What a planned day shows, and when the app may make a day (item 22 design 3.6; HS-09, HS-10,
 * HS-25, HS-R18, NU-05, NU-06, C10, C29, C108, P43; V8, V26, V38, V39, V40, V44).
 *
 * An owner's own day is never refused for its figures: below the floor, or with energy not known,
 * it gets a note (C108). A day the app makes (auto-fill or copy) is written only when, over its
 * counted meals, the floor check with unknowns passes, food energy is complete and reaches the
 * day's energy target (the floor only refuses, it is never the aim), protein is complete and
 * reaches the protein check target, a single sitting passes item 15's meal check with no light dish
 * as its only meal (and no more than one serve after a reflux symptom), and any carb ceiling or
 * saturated-fat budget is met on complete figures. With no energy aim there is no app-made day.
 */
import { mealCheck, type MealCheckReason } from '../fasting/mealCheck';
import { floorCheckWithUnknowns } from '../foods/floor';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import type { RefId } from '../storage/primitives';
import type { NutrientKey } from '../storage/records';
import type { DayTargets } from '../targets/dayTargets';
import type { TargetDisplay } from '../targets/display';
import { energyForMealChecks, type PlanWriteKind, plannerEnergyAim } from '../targets/energy';
import { type LimitState, limitState } from '../targets/intake';
import type { LocalDate } from '../util/time';
import type { EatingWindow } from '../fasting/eatingWindow';
import type { MealSlot } from '../storage/records';
import { type CountedDay, figureComplete } from './figures';
import { type DaySlots, isSingleSittingPlan } from './slots';
import type { PlanDateState } from './week';

export interface PlanDayContext {
  readonly date: LocalDate;
  readonly state: PlanDateState;
  /** Past: the row's stored per-day window (null while fasting is gated); else the day's window. */
  readonly window: EatingWindow | null;
  readonly slots: DaySlots;
  /** Past: every slot (nothing set apart); else allowedSlots(slots). */
  readonly counted: readonly MealSlot[];
  readonly targets: DayTargets;
  readonly display: Pick<TargetDisplay, 'plainFigures' | 'pregnancyNote'>;
  /** targets.energyFloorKj as stored (the floor check applies its safe floor). */
  readonly storedFloorKj: number;
  /** A reflux symptom logged on the date or the day before (item 15's refluxOptionsVisible). */
  readonly refluxDay: boolean;
}

export type DayFloorNote = {
  readonly kind: 'below-floor' | 'energy-not-known';
  readonly floorKj: number;
} | null;

/** The note under an owner-planned day, over its counted meals (C108, HS-R18). */
export function ownerDayFloorNote(day: CountedDay, ctx: PlanDayContext): DayFloorNote {
  if (day.counted.length === 0) return null;
  const fc = floorCheckWithUnknowns(
    day.figures.totals.energyKj,
    !figureComplete(day.figures, 'energyKj'),
    ctx.storedFloorKj,
    'owner-meal',
  );
  return fc.ok && fc.note !== null ? { kind: fc.note, floorKj: fc.floorKj } : null;
}

export interface FigureLine {
  readonly known: number;
  readonly unknownCount: number;
  readonly complete: boolean;
}

export interface PlanDayDisplay {
  /** targetKj null: no target, plain figures or the pregnancy note (T25, T26). */
  readonly energy: FigureLine & { readonly targetKj: number | null };
  readonly protein: FigureLine & {
    readonly check:
      | { readonly kind: 'target'; readonly g: number }
      | { readonly kind: 'range'; readonly min: number; readonly max: number }
      | null;
  };
  readonly netCarbs: FigureLine & {
    readonly ceilingG: number | null;
    readonly state: LimitState | null;
  };
  readonly satFat: FigureLine & {
    readonly budgetG: number | null;
    readonly state: LimitState | null;
  };
  readonly floorNote: DayFloorNote;
  /** Nutrients some meals lack: energy, protein, carbs, saturated fat, fibre, then the rest. */
  readonly missing: readonly { readonly key: NutrientKey; readonly count: number }[];
}

const MISSING_ORDER: readonly NutrientKey[] = [
  'energyKj',
  'proteinG',
  'carbsG',
  'saturatedFatG',
  'fibreG',
  ...NUTRIENT_KEYS.filter(
    (k) => !['energyKj', 'proteinG', 'carbsG', 'saturatedFatG', 'fibreG'].includes(k),
  ),
];

function line(day: CountedDay, key: NutrientKey): FigureLine {
  return {
    known: day.figures.totals[key],
    unknownCount: day.figures.unknownCounts[key],
    complete: figureComplete(day.figures, key),
  };
}

export function planDayDisplay(day: CountedDay, ctx: PlanDayContext): PlanDayDisplay {
  const { targets, display } = ctx;
  const energy = line(day, 'energyKj');
  const protein = line(day, 'proteinG');
  const carbs = line(day, 'carbsG');
  const sat = line(day, 'saturatedFatG');
  const ceilingG = targets.netCarbs.kind === 'ceiling' ? targets.netCarbs.grams : null;
  const budgetG =
    targets.saturatedFat.kind === 'budget' && !display.plainFigures
      ? targets.saturatedFat.grams
      : null;
  return {
    energy: {
      ...energy,
      targetKj:
        targets.energy.kind === 'target' && !display.plainFigures && !display.pregnancyNote
          ? targets.energy.targetKj
          : null,
    },
    protein: {
      ...protein,
      check: display.plainFigures
        ? null
        : targets.protein.basis === 'range-top'
          ? { kind: 'target', g: targets.protein.checkTargetG }
          : { kind: 'range', min: targets.protein.rangeG.min, max: targets.protein.rangeG.max },
    },
    netCarbs: {
      ...carbs,
      ceilingG,
      state: ceilingG === null ? null : limitState(carbs.known, carbs.unknownCount, ceilingG),
    },
    satFat: {
      ...sat,
      budgetG,
      state: budgetG === null ? null : limitState(sat.known, sat.unknownCount, budgetG),
    },
    floorNote: ownerDayFloorNote(day, ctx),
    missing: MISSING_ORDER.flatMap((key) => {
      const count = day.figures.unknownCounts[key];
      return count > 0 ? [{ key, count }] : [];
    }),
  };
}

export type AppDayRefusal =
  | { readonly reason: 'no-guide' | 'no-estimate' }
  | { readonly reason: 'below-floor' | 'energy-not-known'; readonly floorKj: number }
  | { readonly reason: 'energy-not-known-aim' | 'energy-short'; readonly aimKj: number }
  | { readonly reason: 'protein-not-known' | 'protein-short'; readonly proteinG: number }
  | { readonly reason: 'one-meal-dish' | 'one-meal-reflux'; readonly recipeId: RefId }
  | { readonly reason: 'one-meal-short'; readonly reasons: readonly MealCheckReason[] }
  | { readonly reason: 'carbs-not-known' | 'carbs-over'; readonly ceilingG: number }
  | { readonly reason: 'sat-fat-not-known' | 'sat-fat-over'; readonly budgetG: number };

/** Auto-fill and copy, over the counted meals only; the first failure wins. */
export function appDayCheck(input: {
  readonly day: CountedDay;
  readonly ctx: PlanDayContext;
  readonly kind: Exclude<PlanWriteKind, 'owner-meal'>;
  /** False for a missing recipe. */
  readonly oneMealOk: (recipeId: RefId) => boolean;
}): { readonly ok: true } | ({ readonly ok: false } & AppDayRefusal) {
  const { day, ctx } = input;
  const { targets } = ctx;
  const totals = day.figures.totals;
  // 1. No energy aim: nothing is planned automatically (T3, V39).
  const aim = plannerEnergyAim(targets.energy);
  if (aim.kind === 'none') {
    return { ok: false, reason: aim.reason === 'needs-guide' ? 'no-guide' : 'no-estimate' };
  }
  // 2. The floor, with unknowns (HS-10, NU-06, HS-R18). A kind outside item 21's list is refused
  // by floorCheck; the owner's own kind never reaches this check.
  if (input.kind === ('owner-meal' as PlanWriteKind)) {
    throw new RangeError('appDayCheck is for app-made days only');
  }
  const energyComplete = figureComplete(day.figures, 'energyKj');
  const fc = floorCheckWithUnknowns(
    totals.energyKj,
    !energyComplete,
    ctx.storedFloorKj,
    input.kind,
  );
  if (!fc.ok) return { ok: false, reason: fc.reason, floorKj: fc.floorKj };
  // 3. The day's energy target, never the floor (C10).
  if (!energyComplete) return { ok: false, reason: 'energy-not-known-aim', aimKj: aim.kj };
  if (totals.energyKj < aim.kj) return { ok: false, reason: 'energy-short', aimKj: aim.kj };
  // 4. Protein (HS-25).
  const proteinG = targets.protein.checkTargetG;
  if (!figureComplete(day.figures, 'proteinG')) {
    return { ok: false, reason: 'protein-not-known', proteinG };
  }
  if (totals.proteinG < proteinG) return { ok: false, reason: 'protein-short', proteinG };
  // 5. A single sitting (C10, C29, P43, V44).
  if (isSingleSittingPlan(ctx.slots, day.counted.length)) {
    const dish = day.counted.find((m) => !input.oneMealOk(m.recipeId));
    if (dish !== undefined) return { ok: false, reason: 'one-meal-dish', recipeId: dish.recipeId };
    const large = ctx.refluxDay ? day.counted.find((m) => m.myServes > 1) : undefined;
    if (large !== undefined) {
      return { ok: false, reason: 'one-meal-reflux', recipeId: large.recipeId };
    }
    const result = mealCheck({
      proteinTargetG: proteinG,
      dayEnergyTargetKj: energyForMealChecks(targets.energy),
      planned: day.sitting,
      logged: null,
      windowClosed: false,
      oneMealWindow: ctx.slots.pattern === 'one-meal',
    });
    if (result.kind !== 'ok') {
      return {
        ok: false,
        reason: 'one-meal-short',
        reasons:
          result.kind === 'unavailable' || result.kind === 'nothing-logged'
            ? ['energy-unknown']
            : result.reasons,
      };
    }
  }
  // 6. The carb ceiling: an unknown figure never passes it.
  if (targets.netCarbs.kind === 'ceiling') {
    const ceilingG = targets.netCarbs.grams;
    const state = limitState(totals.carbsG, day.figures.unknownCounts.carbsG, ceilingG);
    if (state === 'incomplete') return { ok: false, reason: 'carbs-not-known', ceilingG };
    if (state === 'over') return { ok: false, reason: 'carbs-over', ceilingG };
  }
  // 7. The saturated-fat budget, also under plain figures (only its wording changes, V40).
  if (targets.saturatedFat.kind === 'budget') {
    const budgetG = targets.saturatedFat.grams;
    const state = limitState(
      totals.saturatedFatG,
      day.figures.unknownCounts.saturatedFatG,
      budgetG,
    );
    if (state === 'incomplete') return { ok: false, reason: 'sat-fat-not-known', budgetG };
    if (state === 'over') return { ok: false, reason: 'sat-fat-over', budgetG };
  }
  return { ok: true };
}
