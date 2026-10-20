/**
 * A recipe's carb style and the planner's tie-break (item 20 design 4.6; P11, P12; HS-39). The
 * author's written style can only be confirmed or raised by figures, never lowered, and while its
 * carbs are not worked out it reads "Written for keto", never a bare "Keto". A style is a label,
 * never a carb-ceiling pass. The planner prefers lower-carb styles only under a Kickstart or keto
 * ceiling (item 21's NetCarbCeiling), never under the 50 g hold, moderate, balanced or readiness off.
 */
import type { Nutrients } from '../nutrition/nutrients';
import type { DietMode, NutrientKey, RecipeLine } from '../storage/records';
import type { NetCarbCeiling } from '../targets/carbs';
import { SILVERBEET_ID, STYLE_MAX_NET_CARBS_PER_SERVE_G } from './constants';

export interface CarbStyleView {
  /** Null: not known. */
  readonly style: DietMode | null;
  /** The dataset's carbStyle; null for an owner copy (a swap may change the carbs). */
  readonly written: DietMode | null;
  readonly basis: 'written' | 'figures' | 'none';
  /** Complete, or the known lower bound. */
  readonly netCarbsPerServeG: number;
  readonly complete: boolean;
}

const ORDER: readonly DietMode[] = ['keto', 'moderate-low-carb', 'balanced'];
const higher = (a: DietMode, b: DietMode): DietMode =>
  ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;

function figuresStyle(netCarbsG: number): DietMode {
  if (netCarbsG <= STYLE_MAX_NET_CARBS_PER_SERVE_G.keto) return 'keto';
  if (netCarbsG <= STYLE_MAX_NET_CARBS_PER_SERVE_G['moderate-low-carb']) return 'moderate-low-carb';
  return 'balanced';
}

/** Net carbs a serve are perServe.carbsG: always available carbohydrate (C01), never fibre again. */
export function carbStyleOf(input: {
  readonly written: DietMode | null;
  readonly perServe: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
}): CarbStyleView {
  const { written } = input;
  const n = input.perServe.carbsG;
  const complete = !input.unknownNutrients.includes('carbsG');
  const view = (style: DietMode | null, basis: CarbStyleView['basis']): CarbStyleView => ({
    style,
    written,
    basis,
    netCarbsPerServeG: n,
    complete,
  });
  const fromWritten = (style: DietMode) => view(style, style === written ? 'written' : 'figures');
  if (complete)
    return written === null
      ? view(figuresStyle(n), 'figures')
      : fromWritten(higher(written, figuresStyle(n)));
  // A lower bound can only move a recipe to a higher-carb style.
  if (n > STYLE_MAX_NET_CARBS_PER_SERVE_G['moderate-low-carb']) return view('balanced', 'figures');
  if (written === null) return view(null, 'none');
  if (n > STYLE_MAX_NET_CARBS_PER_SERVE_G.keto)
    return fromWritten(higher(written, 'moderate-low-carb'));
  return view(written, 'written');
}

export type CarbStyleChip =
  | { readonly kind: 'style'; readonly style: DietMode }
  | { readonly kind: 'written'; readonly style: DietMode }
  | { readonly kind: 'not-worked-out' };

/** A bare style only on complete carbs; "Written for …" while the written style stands; else "not worked out". */
export function carbStyleChip(view: CarbStyleView): CarbStyleChip {
  if (view.complete && view.style !== null) return { kind: 'style', style: view.style };
  if (view.basis === 'written' && view.written !== null)
    return { kind: 'written', style: view.written };
  return { kind: 'not-worked-out' };
}

/** The keto first week is used only under a Kickstart or keto ceiling (P4). */
export function usesKetoFirstWeek(ceiling: NetCarbCeiling): boolean {
  return ceiling.kind === 'ceiling' && (ceiling.basis === 'kickstart' || ceiling.basis === 'keto');
}

/** Lower first. Every recipe ties at 0 unless the ceiling is a Kickstart or keto one (P12). */
export function carbStyleRank(style: DietMode | null, ceiling: NetCarbCeiling): number {
  if (!usesKetoFirstWeek(ceiling)) return 0;
  return style === 'keto' ? 0 : style === 'moderate-low-carb' ? 1 : 2;
}

/** What the tie-break reads of a recipe (a RecipeView has these). */
export interface TieBreakRecipe {
  readonly id: string;
  readonly title: string;
  readonly carbStyle: Pick<CarbStyleView, 'style'>;
  readonly cholesterolScore: number;
}

/**
 * Item 22 passes this as the tieBreak of item 21's rankForDietMode, whose own carb key comes
 * first: carb style (only under a Kickstart or keto ceiling), then the cholesterol score (higher
 * first), then title, then id. A ranking, never a pass.
 */
export function plannerTieBreak(
  ceiling: NetCarbCeiling,
): (a: TieBreakRecipe, b: TieBreakRecipe) => number {
  return (a, b) =>
    carbStyleRank(a.carbStyle.style, ceiling) - carbStyleRank(b.carbStyle.style, ceiling) ||
    b.cholesterolScore - a.cholesterolScore ||
    a.title.localeCompare(b.title, 'en-NZ', { sensitivity: 'base' }) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Item 22's first-week preference for every owner (P4). */
export function usesSilverbeet(recipe: {
  readonly lines: readonly Pick<RecipeLine, 'ingredientId'>[];
}): boolean {
  return recipe.lines.some((line) => line.ingredientId === SILVERBEET_ID);
}
