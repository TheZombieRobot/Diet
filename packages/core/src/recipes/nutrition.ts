/**
 * A recipe's figures, worked out at read time from its lines' raw grams and the current view of
 * each ingredient (item 20 design 4.3; NU-02, NU-03, C01, C32, C67, D35). A figure any line lacks
 * is listed as unknown and its known part is a lower bound; nothing is filled in. Showing them is
 * item 18's (totalRows, figureText, foodBadge, nutritionFooter; HS-37): there is no rounding here.
 */
import { lineSourceForMix } from '../foods/view';
import { type NutritionSource, recipeConfidence } from '../nutrition/confidence';
import { NUTRIENT_KEYS, nutrientsForGrams, type Nutrients } from '../nutrition/nutrients';
import type { AllergenFacts } from '../storage/allergens';
import { foodAllergenFacts, type IngredientView } from '../storage/overrides';
import type { NutrientKey, RecipeLine, RecipeRecord, SourceMix } from '../storage/records';
import { RECIPE_SNAPSHOT_ALL_UNKNOWN_STORABLE } from './constants';
import { type LineKind, lineKindOf, type RecipeFoods } from './foodKind';

export interface LineFacts {
  /** Null when the line's ingredient is not in the app. */
  readonly view: IngredientView | null;
  readonly kind: LineKind;
  /** This line's raw grams of the ingredient; an unknown figure is 0 here and listed below. */
  readonly nutrients: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
  /** lineSourceForMix(view, approved); Estimate when unresolved or on a cooked basis. */
  readonly source: NutritionSource;
  /** foodAllergenFacts(view); nothing known and unknown when unresolved. */
  readonly allergens: AllergenFacts;
}

const zeroNutrients = (): Nutrients => {
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) out[key] = 0;
  return out;
};

function assertGrams(rawG: number): void {
  if (!Number.isFinite(rawG) || rawG <= 0 || rawG > 5000)
    throw new RangeError('A recipe line weighs more than 0 g and at most 5,000 g');
}

/** One line's figures and allergens from its ingredient's current view. */
export function lineFacts(
  line: Pick<RecipeLine, 'ingredientId' | 'rawG'>,
  foods: RecipeFoods,
): LineFacts {
  assertGrams(line.rawG);
  const view = foods.resolve(line.ingredientId);
  const kind = lineKindOf(line.ingredientId, foods);
  if (view === null) {
    return {
      view,
      kind,
      nutrients: zeroNutrients(),
      unknownNutrients: [...NUTRIENT_KEYS],
      source: 'estimate',
      allergens: { allergens: [], allergensUnknown: true },
    };
  }
  const allergens = foodAllergenFacts(view);
  // C67: raw grams are never multiplied by cooked figures.
  if (view.nutrientBasis === 'cooked') {
    return {
      view,
      kind,
      nutrients: zeroNutrients(),
      unknownNutrients: [...NUTRIENT_KEYS],
      source: 'estimate',
      allergens,
    };
  }
  const nutrients = nutrientsForGrams(view.nutrientsPer100g, line.rawG);
  // An unknown figure counts as nothing known, whatever is stored for it (D35 stores 0).
  for (const key of view.unknownNutrients) nutrients[key] = 0;
  return {
    view,
    kind,
    nutrients,
    unknownNutrients: NUTRIENT_KEYS.filter((k) => view.unknownNutrients.includes(k)),
    source: lineSourceForMix(view, foods.approved),
    allergens,
  };
}

export interface RecipeNutrition {
  readonly lines: readonly LineFacts[];
  /** The sum over the lines. */
  readonly totals: Nutrients;
  /** totals ÷ serves; a key in unknownNutrients is a lower bound. */
  readonly perServe: Nutrients;
  /** The union of the lines' lists, in NUTRIENT_KEYS order; may hold all eight. */
  readonly unknownNutrients: readonly NutrientKey[];
  /** Every line lacks all eight (item 18's foods.totals.noneLoaded case). */
  readonly noneLoaded: boolean;
  /** recipeConfidence of the line sources: the weakest, capped at Database (C32). */
  readonly confidence: 'database' | 'estimate';
  readonly sourceMix: SourceMix;
  readonly rawTotalG: number;
}

/** The figures of one serve of a recipe as written. No household or cooking-for input (HS-23). */
export function recipeNutrition(
  recipe: Pick<RecipeRecord, 'serves'> & {
    readonly lines: readonly Pick<RecipeLine, 'ingredientId' | 'rawG'>[];
  },
  foods: RecipeFoods,
): RecipeNutrition {
  const { serves } = recipe;
  if (!Number.isInteger(serves) || serves < 1 || serves > 50)
    throw new RangeError('A recipe makes 1 to 50 whole serves');
  const lines = recipe.lines.map((line) => lineFacts(line, foods));
  const totals = zeroNutrients();
  const perServe = zeroNutrients();
  for (const key of NUTRIENT_KEYS) {
    for (const line of lines) totals[key] += line.nutrients[key];
    perServe[key] = totals[key] / serves;
  }
  const unknown = new Set(lines.flatMap((line) => line.unknownNutrients));
  const sourceMix: SourceMix = { label: 0, 'nz-fcdb': 0, usda: 0, estimate: 0 };
  for (const line of lines) sourceMix[line.source] += 1;
  const confidence = recipeConfidence(lines.map((line) => line.source));
  return {
    lines,
    totals,
    perServe,
    unknownNutrients: NUTRIENT_KEYS.filter((k) => unknown.has(k)),
    noneLoaded: lines.every((line) => line.unknownNutrients.length === NUTRIENT_KEYS.length),
    confidence: confidence === 'database' ? 'database' : 'estimate',
    sourceMix,
    rawTotalG: recipe.lines.reduce((sum, line) => sum + line.rawG, 0),
  };
}

/** Per 100 g of the raw ingredients as listed, not of the cooked dish (P21). */
export function per100gRaw(n: RecipeNutrition): Nutrients {
  const out = zeroNutrients();
  if (n.rawTotalG <= 0) return out;
  for (const key of NUTRIENT_KEYS) out[key] = (n.totals[key] * 100) / n.rawTotalG;
  return out;
}

/** What an owner copy stores of its figures: a record of the last save (screens use live figures). */
export interface RecipeSnapshot {
  readonly nutritionPerServe: Nutrients;
  readonly unknownNutrients: NutrientKey[];
  readonly confidence: 'database' | 'estimate';
  readonly sourceMix: SourceMix;
}

/**
 * Whether a recipe's figures can be worked out at all: whole serves from 1 to 50 and lines that
 * each weigh more than 0 g and at most 5,000 g (the version-1 validator's ranges, so a row outside
 * them is refused by the validator with its own reason, not by recipeNutrition's RangeError).
 */
export function recipeFiguresComputable(recipe: {
  readonly serves: unknown;
  readonly lines: unknown;
}): boolean {
  const { serves, lines } = recipe;
  return (
    typeof serves === 'number' &&
    Number.isInteger(serves) &&
    serves >= 1 &&
    serves <= 50 &&
    Array.isArray(lines) &&
    lines.every((line: unknown) => {
      if (typeof line !== 'object' || line === null) return false;
      const { ingredientId, rawG } = line as Readonly<Record<string, unknown>>;
      return (
        typeof ingredientId === 'string' &&
        typeof rawG === 'number' &&
        Number.isFinite(rawG) &&
        rawG > 0 &&
        rawG <= 5000
      );
    })
  );
}

/** The snapshot, or null while the schema cannot store a recipe whose eight figures are all unknown (D35). */
export function recipeSnapshot(n: RecipeNutrition): RecipeSnapshot | null {
  if (n.unknownNutrients.length === NUTRIENT_KEYS.length && !RECIPE_SNAPSHOT_ALL_UNKNOWN_STORABLE)
    return null;
  return {
    nutritionPerServe: { ...n.perServe },
    unknownNutrients: [...n.unknownNutrients],
    confidence: n.confidence,
    sourceMix: { ...n.sourceMix },
  };
}
