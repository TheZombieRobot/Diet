/**
 * Heart-smart, the saturated-fat flag and the cholesterol-conscious score (item 20 design 4.5;
 * NU-04, C70, HEALTH_SAFETY section 4; P8, P10, P33, P37, P38). A figure any ingredient lacks never
 * makes a recipe heart-smart (HS-39): fat or saturated fat not fully known reads "not worked out",
 * while a lower bound already over the cap still flags, since the true figure can only be higher.
 */
import { CHEESE_FLAG_ABOVE_G } from '../foods/heart';
import type { Nutrients } from '../nutrition/nutrients';
import type { NutrientKey, RecipeLine } from '../storage/records';
import {
  EDIBLE_G_PER_EGG,
  HEART_SMART_MAX_SAT_SHARE_OF_FAT,
  HEART_SMART_PORTION_SHARE,
  LEGUME_SMALL_G_PER_SERVE,
  SAT_FAT_REFERENCE_G,
} from './constants';
import { type FavourKey, FLAG_REASONS, type FlagReason, type LineKind } from './foodKind';
import type { RecipeNutrition } from './nutrition';

export type HeartSmart =
  | { readonly kind: 'heart-smart'; readonly capG: number }
  | { readonly kind: 'flagged'; readonly reasons: readonly FlagReason[]; readonly capG: number }
  /** Complete, not flagged, more than a quarter of the fat saturated. */
  | { readonly kind: 'neither'; readonly capG: number }
  /** Not flagged on what is known, but fat or saturated fat is not fully known. */
  | { readonly kind: 'unknown'; readonly capG: number };

export interface HeartSmartInput {
  readonly perServe: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
  /** The owner's serves: 1 on the recipe page, the planned portion from a plan day. */
  readonly myServes: number;
  readonly lines: readonly { readonly kind: LineKind; readonly rawGPerServe: number }[];
  /** Item 21's day budget in grams when it is a budget; null otherwise. */
  readonly satFatBudgetG: number | null;
}

/** A third of the day's budget, or of the 24 g label reference when there is none or it is larger. */
export function heartSmartCapG(satFatBudgetG: number | null): number {
  const valid =
    satFatBudgetG !== null && Number.isFinite(satFatBudgetG) && satFatBudgetG > 0
      ? satFatBudgetG
      : SAT_FAT_REFERENCE_G;
  return Math.min(valid, SAT_FAT_REFERENCE_G) * HEART_SMART_PORTION_SHARE;
}

export function heartSmart(input: HeartSmartInput): HeartSmart {
  const capG = heartSmartCapG(input.satFatBudgetG);
  const found = new Set<FlagReason>();
  let cheesePerServe = 0;
  for (const { kind, rawGPerServe } of input.lines) {
    if (kind.role.kind !== 'flag' || kind.flag === null) continue;
    if (kind.role.aboveGramsPerServe === 0) found.add(kind.flag);
    else cheesePerServe += rawGPerServe;
  }
  if (cheesePerServe * input.myServes > CHEESE_FLAG_ABOVE_G) found.add('cheese-over-40g');
  // Complete or a lower bound: a lower bound already over the cap can only be higher.
  if (input.perServe.saturatedFatG * input.myServes > capG) found.add('saturated-fat-high');
  if (found.size > 0) {
    return { kind: 'flagged', reasons: FLAG_REASONS.filter((r) => found.has(r)), capG };
  }
  const unknown =
    input.unknownNutrients.includes('fatG') ||
    input.unknownNutrients.includes('saturatedFatG') ||
    input.lines.some((line) => line.kind.origin === 'unresolved');
  if (unknown) return { kind: 'unknown', capG };
  const { fatG, saturatedFatG } = input.perServe;
  return saturatedFatG <= HEART_SMART_MAX_SAT_SHARE_OF_FAT * fatG
    ? { kind: 'heart-smart', capG }
    : { kind: 'neither', capG };
}

/** The heart test's input for a recipe: its live figures and each line's raw grams a serve. */
export function heartSmartInput(
  n: RecipeNutrition,
  serves: number,
  lines: readonly Pick<RecipeLine, 'rawG'>[],
  options: { readonly myServes?: number; readonly satFatBudgetG?: number | null } = {},
): HeartSmartInput {
  return {
    perServe: n.perServe,
    unknownNutrients: n.unknownNutrients,
    myServes: options.myServes ?? 1,
    lines: n.lines.map((facts, i) => ({
      kind: facts.kind,
      rawGPerServe: (lines[i]?.rawG ?? 0) / serves,
    })),
    satFatBudgetG: options.satFatBudgetG ?? null,
  };
}

/** The favoured kinds a recipe uses, each once; legumes only in small amounts (P37). */
export function favouredKeys(
  n: RecipeNutrition,
  serves: number,
  lines: readonly Pick<RecipeLine, 'rawG'>[],
): FavourKey[] {
  const legumeGPerServe =
    n.lines.reduce(
      (sum, facts, i) => sum + (facts.kind.group === 'legume' ? (lines[i]?.rawG ?? 0) : 0),
      0,
    ) / serves;
  const keys = new Set<FavourKey>();
  for (const facts of n.lines) {
    const key = facts.kind.favour;
    if (key === null) continue;
    if (key === 'legume' && legumeGPerServe > LEGUME_SMALL_G_PER_SERVE) continue;
    keys.add(key);
  }
  return [...keys];
}

/**
 * A whole number that orders otherwise equal recipes, never a filter (P10): heart-smart +2, not
 * worked out −1 (unknown saturated fat never gets the benefit of the doubt), up to 3 favoured
 * kinds +1 each, −3 per flag reason.
 */
export function cholesterolScore(heart: HeartSmart, favoured: readonly FavourKey[]): number {
  const flags = heart.kind === 'flagged' ? heart.reasons.length : 0;
  return (
    (heart.kind === 'heart-smart' ? 2 : 0) -
    (heart.kind === 'unknown' ? 1 : 0) +
    Math.min(favoured.length, 3) -
    3 * flags
  );
}

/** Eggs in one serve, counted at the edible weight (N11: never the as-bought gramsPerEach). */
export function eggsPerServe(
  lines: readonly Pick<RecipeLine, 'rawG'>[],
  kinds: readonly LineKind[],
  serves: number,
): number {
  const grams = lines.reduce((sum, line, i) => sum + (kinds[i]?.egg === true ? line.rawG : 0), 0);
  return grams / EDIBLE_G_PER_EGG / serves;
}
