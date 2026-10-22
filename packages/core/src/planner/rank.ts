/**
 * Suggestions for one meal: filtered first, then ordered garden first (item 22 design 3.8; NU-07,
 * FL-04, C43, C107, P41, P43; item 19 2.5; item 20 section 7 steps 1 and 4; V14, V15, V17, V28).
 *
 * Filters, each recipe counted in the first that removes it: the recipe's slots; hidden seeds;
 * dislikes; a recipe containing a blocked allergen (never offered, not merely warned; counted apart
 * when only the household's gluten cereals block it); a light dish as a one-meal day's dinner; and,
 * under a carb ceiling, a recipe whose one serve already passes the whole day's ceiling on known
 * figures. Recipes whose allergens are not fully known go to their own "check labels" group.
 * Ordering runs only after filtering, so a ready garden crop can never bring back a recipe a filter
 * removed: two or more in-season ready garden foods first, then one ready garden food, then the
 * rest; within a group fewer days left first, silverbeet dinners first in the first planned week,
 * then item 21's carb key and item 20's tie-break. Stock is never written and never changes a
 * target.
 */
import { netCarbsOf } from '../nutrition/netCarbs';
import { type Serving, servingFor } from '../recipes/allergens';
import { plannerTieBreak } from '../recipes/carbStyle';
import type { RecipeLineView, RecipeView } from '../recipes/view';
import type { Allergen } from '../storage/allergens';
import type { RefId, SeedId } from '../storage/primitives';
import type { MealSlot } from '../storage/records';
import type { NetCarbCeiling } from '../targets/carbs';
import { dietModeCarbKey } from '../targets/dietModes';
import { limitState } from '../targets/intake';
import type { DaySlots } from './slots';

export interface GardenStockFacts {
  /** Item 19's readyGardenIngredientIds(stock, now). */
  readonly ready: ReadonlySet<RefId>;
  /** The lowest daysLeft of that food's counted garden lines. */
  readonly daysLeft: ReadonlyMap<RefId, number | null>;
}

export interface GardenUse {
  readonly inSeason: readonly RefId[];
  readonly ready: readonly RefId[];
  readonly minDaysLeft: number | null;
}

export function gardenUse(
  lines: readonly Pick<RecipeLineView, 'ingredientId'>[],
  stock: GardenStockFacts,
  seasonOf: (id: RefId) => readonly number[],
  month: number,
): GardenUse {
  const ready = [...new Set(lines.map((l) => l.ingredientId))].filter((id) => stock.ready.has(id));
  const inSeason = ready.filter((id) => {
    const months = seasonOf(id);
    return months.length === 0 || months.includes(month);
  });
  const days = ready.flatMap((id) => {
    const d = stock.daysLeft.get(id) ?? null;
    return d === null ? [] : [d];
  });
  return { inSeason, ready, minDaysLeft: days.length === 0 ? null : Math.min(...days) };
}

export function gardenGroup(use: GardenUse): 0 | 1 | 2 {
  if (use.inSeason.length >= 2) return 0;
  return use.ready.length >= 1 ? 1 : 2;
}

/** One serve's known net carbs already pass the whole day's ceiling (V28). */
export function knownOverCeiling(
  view: Pick<RecipeView, 'perServe' | 'unknownNutrients'>,
  ceiling: NetCarbCeiling,
): boolean {
  if (ceiling.kind !== 'ceiling') return false;
  return (
    limitState(
      netCarbsOf(view.perServe),
      view.unknownNutrients.includes('carbsG') ? 1 : 0,
      ceiling.grams,
    ) === 'over'
  );
}

export interface PlanCandidate {
  readonly view: RecipeView;
  readonly serving: Serving;
  readonly conflicts: readonly Allergen[];
  readonly garden: GardenUse;
  readonly group: 0 | 1 | 2;
}

export interface Suggestions {
  readonly ok: readonly PlanCandidate[];
  readonly checkLabels: readonly PlanCandidate[];
  readonly notShown: {
    readonly allergen: number;
    readonly householdGluten: number;
    readonly dislike: number;
    readonly hidden: number;
    readonly oneMeal: number;
    readonly ceiling: number;
  };
}

export function suggestionsFor(input: {
  readonly slot: MealSlot;
  readonly day: DaySlots;
  /** One per recipe (listRecipes order), built with meal 'own'. */
  readonly views: readonly RecipeView[];
  /** blockedAllergens(profile, sharing). */
  readonly blocked: readonly Allergen[];
  /** blockedAllergens(profile, 'own'): the listed allergens alone. */
  readonly blockedOwn: readonly Allergen[];
  readonly hiddenSeedIds: ReadonlySet<SeedId>;
  /** The date's planDayTargets(...).netCarbs. */
  readonly ceiling: NetCarbCeiling;
  readonly stock: GardenStockFacts;
  readonly seasonOf: (id: RefId) => readonly number[];
  readonly month: number;
  readonly firstWeek: boolean;
}): Suggestions {
  const notShown = {
    allergen: 0,
    householdGluten: 0,
    dislike: 0,
    hidden: 0,
    oneMeal: 0,
    ceiling: 0,
  };
  const ok: PlanCandidate[] = [];
  const checkLabels: PlanCandidate[] = [];
  for (const view of input.views) {
    if (!view.slots.includes(input.slot)) continue;
    if (view.seed !== null && input.hiddenSeedIds.has(view.seed.id)) {
      notShown.hidden += 1;
      continue;
    }
    if (view.disliked) {
      notShown.dislike += 1;
      continue;
    }
    const { serving, conflicts } = servingFor(input.blocked, view.allergens.facts);
    if (serving === 'conflict') {
      if (servingFor(input.blockedOwn, view.allergens.facts).serving === 'conflict') {
        notShown.allergen += 1;
      } else {
        notShown.householdGluten += 1;
      }
      continue;
    }
    if (input.day.pattern === 'one-meal' && input.slot === 'dinner' && !view.oneMealOk) {
      notShown.oneMeal += 1;
      continue;
    }
    if (knownOverCeiling(view, input.ceiling)) {
      notShown.ceiling += 1;
      continue;
    }
    const garden = gardenUse(view.lines, input.stock, input.seasonOf, input.month);
    const candidate: PlanCandidate = {
      view,
      serving,
      conflicts,
      garden,
      group: gardenGroup(garden),
    };
    (serving === 'unknown' ? checkLabels : ok).push(candidate);
  }
  const silverbeetFirst = input.firstWeek && input.slot === 'dinner';
  const tieBreak = plannerTieBreak(input.ceiling);
  const daysKey = (c: PlanCandidate): number =>
    c.group === 2 ? 0 : (c.garden.minDaysLeft ?? Number.POSITIVE_INFINITY);
  const compare = (a: PlanCandidate, b: PlanCandidate): number => {
    if (a.group !== b.group) return a.group - b.group;
    const days = daysKey(a) - daysKey(b);
    if (days !== 0 && !Number.isNaN(days)) return days;
    if (silverbeetFirst && a.view.usesSilverbeet !== b.view.usesSilverbeet) {
      return a.view.usesSilverbeet ? -1 : 1;
    }
    const ka = dietModeCarbKey(a.view, input.ceiling);
    const kb = dietModeCarbKey(b.view, input.ceiling);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return tieBreak(a.view, b.view);
  };
  return { ok: ok.sort(compare), checkLabels: checkLabels.sort(compare), notShown };
}

/** The picker's garden line: 'two' when a suggestion is in group 0, 'one' when the best is 1. */
export function gardenFirstNote(s: Suggestions): 'two' | 'one' | null {
  const groups = [...s.ok, ...s.checkLabels].map((c) => c.group);
  if (groups.includes(0)) return 'two';
  return groups.includes(1) ? 'one' : null;
}
