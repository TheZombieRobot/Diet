/**
 * One view of a recipe for the screens and the planner (item 20 design 4.9): live figures, the
 * badge, heart and carb labels, allergens against the owner's profile, swap hints and the list's
 * sections. A seed recipe or an owner's copy; a copy keeps its origin's allergens (P14).
 */
import { foodBadge } from '../foods/figures';
import { isDislikedFood } from '../foods/names';
import { entryConfidence } from '../foods/view';
import type { Confidence } from '../nutrition/confidence';
import type { Nutrients } from '../nutrition/nutrients';
import type { Allergen, AllergenFacts } from '../storage/allergens';
import type { RefId, SeedId } from '../storage/primitives';
import type { MealSlot, NutrientKey, RecipeLine, RecipeRecord } from '../storage/records';
import {
  type AllergenSource,
  blockedAllergens,
  glutenCerealsIn,
  type MealSharing,
  originAllergens,
  type RecipeAllergenView,
  recipeAllergenView,
  type Serving,
  servingFor,
} from './allergens';
import { type CarbStyleView, carbStyleOf, usesSilverbeet } from './carbStyle';
import { SALTY_SEED_IDS, SWAP_HINTS_SHOWN } from './constants';
import type { RecipeFoods } from './foodKind';
import {
  cholesterolScore,
  eggsPerServe,
  favouredKeys,
  type HeartSmart,
  heartSmart,
  heartSmartInput,
} from './heartSmart';
import { type RecipeNutrition, recipeNutrition } from './nutrition';
import { substituteOptions, type SwapProfile, swappable } from './swap';
import type { RecipeData, SeedRecipe, SeedRecipeLine } from './types';

export interface RecipeLineView {
  readonly index: number;
  readonly ingredientId: RefId;
  /** The ingredient's (corrected) name; the line's own text when it is not in the app. */
  readonly name: string;
  readonly resolved: boolean;
  readonly rawG: number;
  readonly cookedG: number | null;
  readonly displayAs: string | null;
  readonly egg: boolean;
  readonly inGarden: boolean;
  readonly inSeason: boolean;
  readonly leftover: boolean;
  readonly salty: boolean;
  /** The first swap candidates' names, filtered exactly as the swap panel filters them. */
  readonly swapHints: readonly string[];
  readonly allergens: AllergenFacts;
  /** This line's allergens the owner listed. */
  readonly conflicts: readonly Allergen[];
}

export interface RecipeView {
  readonly id: RefId;
  readonly origin: 'seed' | 'owner';
  /** An owner copy's seed, if it is in the dataset; a seed's own recipe. */
  readonly seed: SeedRecipe | null;
  readonly title: string;
  readonly serves: number;
  readonly timeMinutes: number | null;
  readonly slots: readonly MealSlot[];
  readonly oneMealOk: boolean;
  readonly lines: readonly RecipeLineView[];
  readonly method: readonly string[];
  /** So a view is item 21's RankableRecipe. */
  readonly perServe: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
  readonly nutrition: RecipeNutrition;
  /**
   * Item 18's foodBadge: none while every figure reads "not known"; otherwise Database or
   * Estimate, never Label (C32), and Estimate while no food database is approved (entryConfidence).
   */
  readonly badge: Confidence | null;
  readonly carbStyle: CarbStyleView;
  readonly heart: HeartSmart;
  readonly cholesterolScore: number;
  readonly allergens: RecipeAllergenView;
  readonly serving: Serving;
  readonly conflicts: readonly Allergen[];
  readonly blocked: readonly Allergen[];
  readonly glutenCereals: readonly Allergen[];
  readonly disliked: boolean;
  readonly hidden: boolean;
  readonly usesLeftoversFrom: SeedRecipe | null;
  readonly leftoversFeed: readonly SeedRecipe[];
  readonly swappable: 'yes' | 'figures-unknown' | 'ingredient-missing';
  readonly eggsPerServe: number;
  readonly usesSilverbeet: boolean;
}

export interface RecipeViewContext {
  readonly data: RecipeData;
  readonly foods: RecipeFoods;
  /** The owner's stored recipes, for copies' origins. */
  readonly storedById: ReadonlyMap<RefId, RecipeRecord>;
  readonly profile: SwapProfile;
  /** 'own' on the screens; item 22 passes 'shared' for household meals. */
  readonly meal: MealSharing;
  readonly gardenIngredientIds: ReadonlySet<RefId>;
  readonly hiddenSeedIds: ReadonlySet<SeedId>;
  /** 1–12, local. */
  readonly month: number;
  /** 1, or the planned portion when opened from a plan day. */
  readonly myServes: number;
  /** Item 21's saturated-fat budget in grams, or null. */
  readonly satFatBudgetG: number | null;
}

const isSeedRecipe = (recipe: SeedRecipe | RecipeRecord): recipe is SeedRecipe =>
  'carbStyle' in recipe;

/** The seed an owner copy comes from, following stored copies to the first seed found. */
function seedOf(
  recipe: RecipeRecord,
  data: RecipeData,
  stored: ReadonlyMap<RefId, RecipeRecord>,
): SeedRecipe | null {
  const seen = new Set<RefId>();
  let next = recipe.derivedFromRecipeId;
  while (next !== null && !seen.has(next)) {
    seen.add(next);
    const id: RefId = next;
    const seed = data.recipes.find((r) => r.id === id);
    if (seed !== undefined) return seed;
    next = stored.get(id)?.derivedFromRecipeId ?? null;
  }
  return null;
}

export function recipeView(recipe: SeedRecipe | RecipeRecord, ctx: RecipeViewContext): RecipeView {
  const { data, foods, profile } = ctx;
  const isSeed = isSeedRecipe(recipe);
  const seed = isSeed ? recipe : seedOf(recipe, data, ctx.storedById);
  const lines: readonly RecipeLine[] = recipe.lines;
  const nutrition = recipeNutrition(recipe, foods);
  const origin = isSeed
    ? []
    : originAllergens(recipe.derivedFromRecipeId, data, ctx.storedById, foods);
  const source: AllergenSource = {
    allergens: recipe.allergens,
    lines,
    derivedFromRecipeId: isSeed ? null : recipe.derivedFromRecipeId,
  };
  const allergens = recipeAllergenView(source, foods, origin);
  const blocked = blockedAllergens(profile, ctx.meal);
  const { serving, conflicts } = servingFor(blocked, allergens.facts);
  const seedLines: readonly SeedRecipeLine[] | null = isSeed ? null : (seed?.lines ?? null);
  const lineViews = lines.map((line, index): RecipeLineView => {
    const facts = nutrition.lines[index];
    const view = facts?.view ?? null;
    const lineFacts: AllergenFacts = facts?.allergens ?? {
      allergens: [],
      allergensUnknown: true,
    };
    // A seed's line carries its curated swaps (substituteOptions reads them).
    const options = substituteOptions({
      line,
      seedLines,
      foods,
      profile,
      gardenIngredientIds: ctx.gardenIngredientIds,
    });
    return {
      index,
      ingredientId: line.ingredientId,
      name: view?.name ?? line.displayAs ?? '',
      resolved: view !== null,
      rawG: line.rawG,
      cookedG: line.cookedG,
      displayAs: line.displayAs,
      egg: facts?.kind.egg ?? false,
      inGarden: ctx.gardenIngredientIds.has(line.ingredientId),
      inSeason: view !== null && view.seasonMonths.includes(ctx.month),
      leftover: isSeed ? (recipe.lines[index]?.leftover ?? false) : false,
      salty: (SALTY_SEED_IDS as readonly string[]).includes(line.ingredientId),
      swapHints: options.candidates.slice(0, SWAP_HINTS_SHOWN).map((c) => c.name),
      allergens: lineFacts,
      conflicts: lineFacts.allergens.filter((a) => blocked.includes(a)),
    };
  });
  const heart = heartSmart(
    heartSmartInput(nutrition, recipe.serves, lines, {
      myServes: ctx.myServes,
      satFatBudgetG: ctx.satFatBudgetG,
    }),
  );
  const leftoverSource =
    isSeed && recipe.usesLeftoversFrom !== null
      ? (data.recipes.find((r) => r.id === recipe.usesLeftoversFrom) ?? null)
      : null;
  return {
    id: recipe.id,
    origin: isSeed ? 'seed' : 'owner',
    seed,
    title: recipe.title,
    serves: recipe.serves,
    timeMinutes: recipe.timeMinutes,
    slots: seed?.slots ?? ['dinner'],
    oneMealOk: seed?.oneMealOk ?? true,
    lines: lineViews,
    method: recipe.method,
    perServe: nutrition.perServe,
    unknownNutrients: nutrition.unknownNutrients,
    nutrition,
    badge: foodBadge({
      confidence: entryConfidence({ confidence: nutrition.confidence }, foods.approved),
      nutrients: nutrition.perServe,
      unknownNutrients: nutrition.unknownNutrients,
    }),
    carbStyle: carbStyleOf({
      written: isSeed ? recipe.carbStyle : null,
      perServe: nutrition.perServe,
      unknownNutrients: nutrition.unknownNutrients,
    }),
    heart,
    cholesterolScore: cholesterolScore(heart, favouredKeys(nutrition, recipe.serves, lines)),
    allergens,
    serving,
    conflicts,
    blocked,
    glutenCereals: glutenCerealsIn(allergens.facts),
    disliked: lines.some((line) => {
      const view = foods.resolve(line.ingredientId);
      return view !== null && isDislikedFood(view, profile);
    }),
    hidden: seed !== null && ctx.hiddenSeedIds.has(seed.id),
    usesLeftoversFrom: leftoverSource,
    leftoversFeed: isSeed ? data.recipes.filter((r) => r.usesLeftoversFrom === recipe.id) : [],
    swappable: swappable(nutrition),
    eggsPerServe: eggsPerServe(
      lines,
      nutrition.lines.map((l) => l.kind),
      recipe.serves,
    ),
    usesSilverbeet: usesSilverbeet(recipe),
  };
}

export type RecipeSection = 'week' | 'dinners' | 'snacks' | 'other' | 'ownOther';

export const RECIPE_SECTIONS: readonly RecipeSection[] = Object.freeze([
  'week',
  'dinners',
  'snacks',
  'other',
  'ownOther',
]);

export interface RecipeListEntry {
  readonly recipe: SeedRecipe | RecipeRecord;
  readonly section: RecipeSection;
  /** 1–7 in the week section; null elsewhere. */
  readonly day: number | null;
}

const byTitle = (a: RecipeListEntry, b: RecipeListEntry): number =>
  a.recipe.title.localeCompare(b.recipe.title, 'en-NZ', { sensitivity: 'base' }) ||
  (a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0);

/**
 * The list's sections in order (design 3.3): the silverbeet week in day order, then dinners,
 * snacks and the rest by title; each seed once, replaced by the owner's copy of it (D3). Other
 * copies of the same seed, and copies whose seed is missing, go to "Your other recipes".
 */
export function listRecipes(data: RecipeData, owner: readonly RecipeRecord[]): RecipeListEntry[] {
  const copyOf = new Map<RefId, RecipeRecord>();
  const others: RecipeRecord[] = [];
  const seedIds = new Set(data.recipes.map((r) => r.id));
  for (const copy of owner) {
    const from = copy.derivedFromRecipeId;
    if (from !== null && seedIds.has(from) && !copyOf.has(from)) copyOf.set(from, copy);
    else others.push(copy);
  }
  const week = data.ketoFirstWeek.dinners;
  const sections: Record<RecipeSection, RecipeListEntry[]> = {
    week: [],
    dinners: [],
    snacks: [],
    other: [],
    ownOther: others.map((recipe) => ({ recipe, section: 'ownOther', day: null })),
  };
  for (const seed of data.recipes) {
    const recipe = copyOf.get(seed.id) ?? seed;
    const day = week.indexOf(seed.id);
    const section: RecipeSection =
      day >= 0
        ? 'week'
        : seed.slots.includes('dinner')
          ? 'dinners'
          : seed.slots.includes('snack')
            ? 'snacks'
            : 'other';
    sections[section].push({ recipe, section, day: day >= 0 ? day + 1 : null });
  }
  sections.week.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  for (const section of ['dinners', 'snacks', 'other', 'ownOther'] as const)
    sections[section].sort(byTitle);
  return RECIPE_SECTIONS.flatMap((section) => sections[section]);
}
