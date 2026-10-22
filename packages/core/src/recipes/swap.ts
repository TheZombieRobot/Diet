/**
 * Substitute ingredient (item 20 design 4.7; C107, FL-07, HS-24, C43). Which swaps a line offers
 * is item 18's one rule, swapDecision: never a food known to carry an allergen the owner listed
 * (tofu with soy listed, canned tuna with fish listed), never a food known to carry a gluten
 * cereal while Gluten-free household is on, gluten-free swaps only with it on, and a
 * brand-dependent candidate always marked "check the label". Item 20 adds only the pool, dislikes
 * (item 18's isDislikedFood), the alcohol filter and garden-first order. A swap keeps every
 * allergen of the line it replaces.
 */
import { swapDecision } from '../foods/allergens';
import { isDislikedFood } from '../foods/names';
import { type Allergen, type AllergenFacts } from '../storage/allergens';
import { foodAllergenFacts, type IngredientView } from '../storage/overrides';
import type { RefId } from '../storage/primitives';
import type { ProfileRecord, RecipeLine } from '../storage/records';
import { allergenUnion } from './allergens';
import { RECIPE_ALCOHOL_WORDS } from './constants';
import type { RecipeFoods } from './foodKind';
import {
  type RecipeNutrition,
  recipeNutrition,
  type RecipeSnapshot,
  recipeSnapshot,
} from './nutrition';
import type { SeedRecipeLine } from './types';

export interface SwapCandidate {
  readonly id: RefId;
  readonly name: string;
  readonly view: IngredientView;
  readonly facts: AllergenFacts;
  /** Its allergens are not complete: shown with "Check the label for allergens" (C43). */
  readonly checkLabel: boolean;
  readonly inGarden: boolean;
}

export interface SwapOptions {
  readonly candidates: readonly SwapCandidate[];
  readonly hidden: {
    readonly allergen: number;
    /** Known to carry a gluten cereal, with Gluten-free household on (FL-07). */
    readonly glutenHousehold: number;
    readonly dislike: number;
    readonly glutenFree: number;
  };
}

export type SwapProfile = Pick<
  ProfileRecord,
  'allergens' | 'dislikeIngredientIds' | 'dislikeTerms' | 'glutenFreeHousehold'
>;

const isAlcoholFood = (view: Pick<IngredientView, 'name' | 'aliases'>): boolean =>
  [view.name, ...view.aliases].some((name) => RECIPE_ALCOHOL_WORDS.test(name));

const isSeedLine = (line: RecipeLine | SeedRecipeLine): line is SeedRecipeLine => 'swaps' in line;

/**
 * The ids a line may be swapped to, each once and never its own: the line's curated swaps; for an
 * owner copy, every seed line that has (or offers) its current ingredient, with that line's
 * ingredient and swaps, so a swap can be undone; then the ingredient's own substitutes (item 18).
 * Ids that do not resolve, cooked forms and alcohol foods are left out.
 */
export function swapPool(
  line: RecipeLine | SeedRecipeLine,
  seedLines: readonly SeedRecipeLine[] | null,
  foods: RecipeFoods,
): RefId[] {
  const current = line.ingredientId;
  const ids: RefId[] = [];
  if (isSeedLine(line)) ids.push(...line.swaps);
  for (const seedLine of seedLines ?? []) {
    if (seedLine.ingredientId === current || seedLine.swaps.includes(current))
      ids.push(seedLine.ingredientId, ...seedLine.swaps);
  }
  ids.push(...(foods.resolve(current)?.substitutes ?? []));
  return [...new Set(ids)].filter((id) => {
    if (id === current) return false;
    const view = foods.resolve(id);
    return view !== null && view.nutrientBasis !== 'cooked' && !isAlcoholFood(view);
  });
}

/** The candidates a line offers the owner, garden foods first, and how many were left out and why. */
export function substituteOptions(input: {
  readonly line: RecipeLine | SeedRecipeLine;
  readonly seedLines: readonly SeedRecipeLine[] | null;
  readonly foods: RecipeFoods;
  readonly profile: SwapProfile;
  readonly gardenIngredientIds: ReadonlySet<RefId>;
}): SwapOptions {
  const { foods, profile } = input;
  const current = foods.resolve(input.line.ingredientId) ?? { allergensAtLeast: [] };
  const candidates: SwapCandidate[] = [];
  const hidden = { allergen: 0, glutenHousehold: 0, dislike: 0, glutenFree: 0 };
  for (const id of swapPool(input.line, input.seedLines, foods)) {
    const view = foods.resolve(id);
    if (view === null) continue;
    const decision = swapDecision(current, view, profile);
    if (!decision.offered) {
      if (decision.reason === 'allergen') hidden.allergen += 1;
      else if (decision.reason === 'gluten-household') hidden.glutenHousehold += 1;
      else hidden.glutenFree += 1;
      continue;
    }
    if (isDislikedFood(view, profile)) {
      hidden.dislike += 1;
      continue;
    }
    candidates.push({
      id,
      name: view.name,
      view,
      facts: foodAllergenFacts(view),
      checkLabel: decision.checkLabel,
      inGarden: input.gardenIngredientIds.has(id),
    });
  }
  return {
    candidates: [...candidates.filter((c) => c.inGarden), ...candidates.filter((c) => !c.inGarden)],
    hidden,
  };
}

/** What a swap would store: the lines, the allergens (never fewer) and the figures' snapshot. */
export interface SwapDraft {
  readonly lines: RecipeLine[];
  readonly allergens: Allergen[];
  /** Null while the schema cannot store the copy's figures (D35; design 6.4). */
  readonly snapshot: RecipeSnapshot | null;
}

/** The base's lines with one replaced, keeping its raw weight with no cooked weight or text (P18). */
export function applySwap(input: {
  readonly base: {
    readonly serves: number;
    readonly allergens: readonly Allergen[];
    readonly lines: readonly RecipeLine[];
  };
  readonly lineIndex: number;
  readonly ingredientId: RefId;
  readonly origin: readonly Allergen[];
  readonly foods: RecipeFoods;
}): SwapDraft {
  const { base, lineIndex, foods } = input;
  const replaced = base.lines[lineIndex];
  if (!Number.isInteger(lineIndex) || replaced === undefined)
    throw new RangeError('No such recipe line');
  const lines: RecipeLine[] = base.lines.map((line, i) =>
    i === lineIndex
      ? { ingredientId: input.ingredientId, rawG: replaced.rawG, cookedG: null, displayAs: null }
      : {
          ingredientId: line.ingredientId,
          rawG: line.rawG,
          cookedG: line.cookedG,
          displayAs: line.displayAs,
        },
  );
  return {
    lines,
    // The base's lines too, so the swapped-out food's allergens stay (HS-24).
    allergens: allergenUnion({
      declared: base.allergens,
      previous: null,
      origin: input.origin,
      lines: [...base.lines, ...lines],
      foods,
    }),
    snapshot: recipeSnapshot(recipeNutrition({ serves: base.serves, lines }, foods)),
  };
}

/**
 * Whether Substitute ingredient can save a copy now: not with a line that is not in the app, and
 * not while the copy's figures cannot be stored (every recipe before item 10; P17).
 */
export function swappable(n: RecipeNutrition): 'yes' | 'figures-unknown' | 'ingredient-missing' {
  if (n.lines.some((line) => line.view === null)) return 'ingredient-missing';
  return recipeSnapshot(n) === null ? 'figures-unknown' : 'yes';
}
