import { describe, expect, it } from 'vitest';
import type { Confidence } from '../nutrition/confidence';
import { toAvailableCarbsG, netCarbsOf } from '../nutrition/netCarbs';
import { NUTRIENT_KEYS, type Nutrients } from '../nutrition/nutrients';
import { ownerMealNutrients } from '../nutrition/portion';
import { RECIPE_SNAPSHOT_ALL_UNKNOWN_STORABLE } from './constants';
import { recipeData } from './dataset';
import type { RecipeFoods } from './foodKind';
import { per100gRaw, recipeNutrition, recipeSnapshot } from './nutrition';
import { scaleLines } from './scale';
import { exampleOwnFood, fixtureFoods, SYNTHETIC_PER_100G } from './testData';
import type { RecipeLine } from '../storage/records';
import type { SeedRecipe } from './types';
import { recipeView } from './view';

const recipes = (): readonly SeedRecipe[] => {
  const result = recipeData();
  if (result.status !== 'ok') throw new Error('The recipes did not load');
  return result.data.recipes;
};

type Recipe = { readonly serves: number; readonly lines: readonly RecipeLine[] };

/** The badge the recipe page shows (RecipeView.badge). */
const badgeOf = (recipe: SeedRecipe, foods: RecipeFoods): Confidence | null => {
  const result = recipeData();
  if (result.status !== 'ok') throw new Error('The recipes did not load');
  return recipeView(recipe, {
    data: result.data,
    foods,
    storedById: new Map(),
    profile: {
      allergens: [],
      dislikeIngredientIds: [],
      dislikeTerms: [],
      glutenFreeHousehold: false,
    },
    meal: 'own',
    gardenIngredientIds: new Set(),
    hiddenSeedIds: new Set(),
    month: 1,
    myServes: 1,
    satFatBudgetG: null,
  }).badge;
};

/** Σ(rawG × per100 ÷ 100) ÷ serves, worked out here independently of recipeNutrition. */
function expectedPerServe(recipe: Recipe, per100: (id: string) => Nutrients | null): Nutrients {
  const out = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as unknown as Nutrients;
  for (const line of recipe.lines) {
    const figures = per100(line.ingredientId);
    if (figures === null) continue;
    for (const k of NUTRIENT_KEYS) out[k] += (line.rawG * figures[k]) / 100 / recipe.serves;
  }
  return out;
}

describe('recipe figures from ingredients (item 20)', () => {
  it('U4 NU-02: per serve = Σ ingredients ÷ serves for every recipe, with complete, shipped and partly loaded figures', () => {
    const complete = fixtureFoods();
    const shipped = fixtureFoods({ notLoaded: 'all' });
    for (const recipe of recipes()) {
      const n = recipeNutrition(recipe, complete);
      const want = expectedPerServe(recipe, () => SYNTHETIC_PER_100G);
      for (const k of NUTRIENT_KEYS) expect(n.perServe[k]).toBeCloseTo(want[k], 9);
      expect(n.unknownNutrients).toEqual([]);
      // Shipped: nothing is loaded, so every figure is unknown and every known part 0.
      const none = recipeNutrition(recipe, shipped);
      expect(none.unknownNutrients).toEqual([...NUTRIENT_KEYS]);
      expect(Object.values(none.perServe).every((v) => v === 0)).toBe(true);
      expect(none.noneLoaded).toBe(true);
    }
    // One line not loaded: the others are kept as lower bounds.
    const traybake = recipes()[0];
    if (traybake === undefined) throw new Error('No recipes');
    const partly = recipeNutrition(traybake, fixtureFoods({ notLoaded: ['seed:silverbeet'] }));
    const want = expectedPerServe(traybake, (id) =>
      id === 'seed:silverbeet' ? null : SYNTHETIC_PER_100G,
    );
    for (const k of NUTRIENT_KEYS) expect(partly.perServe[k]).toBeCloseTo(want[k], 9);
    expect(partly.unknownNutrients).toEqual([...NUTRIENT_KEYS]);
    expect(partly.noneLoaded).toBe(false);
  });

  it('U4 NU-02: holds for 300 random recipes made from the catalogue', () => {
    const foods = fixtureFoods();
    const ids = [...foods.seedById.values()].filter((f) => f.basis !== 'cooked').map((f) => f.id);
    let seed = 7;
    const next = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 300; i++) {
      const lines = Array.from({ length: 1 + Math.floor(next() * 12) }, () => ({
        ingredientId: ids[Math.floor(next() * ids.length)] ?? 'seed:silverbeet',
        rawG: Math.round(1 + next() * 999),
        cookedG: null,
        displayAs: null,
      }));
      const recipe = { serves: 1 + Math.floor(next() * 8), lines };
      const n = recipeNutrition(recipe, foods);
      const want = expectedPerServe(recipe, () => SYNTHETIC_PER_100G);
      for (const k of NUTRIENT_KEYS) expect(n.perServe[k]).toBeCloseTo(want[k], 9);
    }
  });

  it('U5 NU-03 C01: net carbs are the lines’ available carbohydrate ÷ serves; fibre is never subtracted twice', () => {
    const available = exampleOwnFood(
      '00000000-0000-4000-8000-0000000000a1',
      'Example available food',
      {
        ...SYNTHETIC_PER_100G,
        carbsG: 2,
        fibreG: 10,
      },
    );
    // A "total" figure (8 g, 3 g fibre) is converted when it is entered: 5 g available.
    const total = exampleOwnFood('00000000-0000-4000-8000-0000000000a2', 'Example total food', {
      ...SYNTHETIC_PER_100G,
      carbsG: toAvailableCarbsG({ carbsG: 8, fibreG: 3, carbBasis: 'total' }),
      fibreG: 3,
    });
    const foods = fixtureFoods({ own: [available, total] });
    const n = recipeNutrition(
      {
        serves: 2,
        lines: [
          { ingredientId: available.id, rawG: 150 },
          { ingredientId: total.id, rawG: 50 },
        ],
      },
      foods,
    );
    expect(n.perServe.carbsG).toBeCloseTo((2 * 150 + 5 * 50) / 100 / 2, 9);
    expect(netCarbsOf(n.perServe)).toBe(n.perServe.carbsG);
    expect(n.perServe.carbsG).toBeGreaterThanOrEqual(0);
  });

  it('U8 C32 FL-02 HS-37: the badge is Database at best, never Label, and none while every figure reads "not known"', () => {
    const traybake = recipes()[0];
    if (traybake === undefined) throw new Error('No recipes');
    const db = ['nz-fcdb', 'usda'] as const;
    expect(badgeOf(traybake, fixtureFoods({ source: 'nz-fcdb', approved: db }))).toBe('database');
    // The same database figures while no database is approved count as Estimate (N43).
    expect(badgeOf(traybake, fixtureFoods({ source: 'nz-fcdb' }))).toBe('estimate');
    expect(badgeOf(traybake, fixtureFoods({ source: 'estimate', approved: db }))).toBe('estimate');
    // All label figures: Database at best, never Label; Estimate while no database is approved.
    expect(badgeOf(traybake, fixtureFoods({ source: 'label', approved: db }))).toBe('database');
    expect(badgeOf(traybake, fixtureFoods({ source: 'label' }))).toBe('estimate');
    // Nothing loaded, or nothing resolves: no badge at all.
    expect(badgeOf(traybake, fixtureFoods({ notLoaded: 'all' }))).toBeNull();
    const missing = traybake.lines.map((l) => ({ ...l, ingredientId: 'seed:not-in-the-app' }));
    expect(badgeOf({ ...traybake, lines: missing }, fixtureFoods())).toBeNull();
    // H20b: one of several lines not loaded: Estimate, with "at least" figures.
    const partly = fixtureFoods({ source: 'nz-fcdb', approved: db, notLoaded: ['seed:garlic'] });
    expect(badgeOf(traybake, partly)).toBe('estimate');
    expect(recipeNutrition(traybake, partly).perServe.energyKj).toBeGreaterThan(0);
    // Contract 5: one line missing one figure is Estimate too, so "at least" never sits by Database.
    const gap = fixtureFoods({
      source: 'nz-fcdb',
      approved: db,
      missing: { 'seed:silverbeet': ['fibreG'] },
    });
    expect(recipeNutrition(traybake, gap).unknownNutrients).toEqual(['fibreG']);
    expect(badgeOf(traybake, gap)).toBe('estimate');
    // C67: a cooked-basis food on a line never multiplies raw grams; that line is all unknown.
    const cooked = {
      ...exampleOwnFood(
        '00000000-0000-4000-8000-0000000000b1',
        'Example cooked food',
        SYNTHETIC_PER_100G,
      ),
      nutrientBasis: 'cooked' as const,
    };
    const n = recipeNutrition(
      {
        serves: 1,
        lines: [{ ingredientId: cooked.id, rawG: 100 }],
      },
      fixtureFoods({ own: [cooked] }),
    );
    expect(n.unknownNutrients).toEqual([...NUTRIENT_KEYS]);
    expect(n.lines[0]?.source).toBe('estimate');
  });

  it('U7 HS-39: an owner copy is stored with every figure it does not have listed unknown (schema version 2)', () => {
    expect(RECIPE_SNAPSHOT_ALL_UNKNOWN_STORABLE).toBe(true);
    const traybake = recipes()[0];
    if (traybake === undefined) throw new Error('No recipes');
    expect(
      recipeSnapshot(recipeNutrition(traybake, fixtureFoods({ notLoaded: ['seed:garlic'] }))),
    ).toMatchObject({ unknownNutrients: [...NUTRIENT_KEYS], confidence: 'estimate' });
    const stored = recipeSnapshot(recipeNutrition(traybake, fixtureFoods()));
    expect(stored?.unknownNutrients).toEqual([]);
    expect(stored?.sourceMix.estimate).toBe(traybake.lines.length);
  });

  it('U12 HS-23: cooking for more changes amounts only; no figure takes a household or cooking-for input', () => {
    const frittata = recipes()[2];
    if (frittata === undefined) throw new Error('No recipes');
    const doubled = scaleLines(frittata.lines, 4, 8);
    expect(doubled[0]?.rawG).toBe(800);
    expect(doubled[0]?.cookedG).toBe(800);
    expect(doubled.every((l) => l.scaled)).toBe(true);
    // recipeNutrition takes the recipe and the foods only.
    expectTwoParameters();
    const n = recipeNutrition(frittata, fixtureFoods());
    const perServe = n.perServe;
    for (const householdServes of [1, 4, 8])
      expect(ownerMealNutrients({ perServe, myServes: 1, householdServes })).toEqual(perServe);
    const raw = per100gRaw(n);
    expect(raw.energyKj).toBeCloseTo(SYNTHETIC_PER_100G.energyKj, 9);
  });
});

/** HS-23 as a type: the figures function has exactly two parameters, neither a serves count. */
function expectTwoParameters(): void {
  type Params = Parameters<typeof recipeNutrition>;
  const length: Params['length'] = 2;
  // @ts-expect-error -- no third (household or cooking-for) parameter exists.
  const extra: Params[2] = 1;
  expect([length, extra]).toEqual([2, 1]);
}
