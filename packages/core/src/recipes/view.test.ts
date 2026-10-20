import { describe, expect, it } from 'vitest';
import { plannedMealFigures } from '../fasting/mealCheck';
import * as foodsApi from '../foods';
import type { RecipeRecord } from '../storage/records';
import * as recipesApi from '.';
import { recipeChecksOf } from './checks';
import { recipeData } from './dataset';
import { eggCount, roundRecipeGrams } from './scale';
import { fixtureFoods, overrideFiguresFor } from './testData';
import type { RecipeData, SeedRecipe } from './types';
import { listRecipes, recipeView, type RecipeViewContext } from './view';

const data = (): RecipeData => {
  const result = recipeData();
  if (result.status !== 'ok') throw new Error('The recipes did not load');
  return result.data;
};
const recipe = (id: string): SeedRecipe => {
  const found = data().recipes.find((r) => r.id === `seed:recipe-${id}`);
  if (found === undefined) throw new Error(id);
  return found;
};
const context = (changes: Partial<RecipeViewContext> = {}): RecipeViewContext => ({
  data: data(),
  foods: fixtureFoods({ notLoaded: 'all' }),
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
  ...changes,
});

const AT = '2000-01-01T00:00:00.000Z';
const copyOf = (seed: SeedRecipe, id: string): RecipeRecord => ({
  id,
  title: `${seed.title}, my way`,
  serves: seed.serves,
  timeMinutes: seed.timeMinutes,
  lines: seed.lines.map((l) => ({
    ingredientId: l.ingredientId,
    rawG: l.rawG,
    cookedG: l.cookedG,
    displayAs: l.displayAs,
  })),
  method: [...seed.method],
  tags: [],
  allergens: [...seed.allergens],
  derivedFromRecipeId: seed.id,
  nutritionPerServe: {
    energyKj: 0,
    proteinG: 0,
    fatG: 0,
    saturatedFatG: 0,
    carbsG: 0,
    sugarsG: 0,
    fibreG: 0,
    sodiumMg: 0,
  },
  unknownNutrients: [],
  confidence: 'estimate',
  sourceMix: { label: 0, 'nz-fcdb': 0, usda: 0, estimate: seed.lines.length },
  createdAt: AT,
  updatedAt: AT,
});

describe('recipe views and the list (item 20)', () => {
  it('U14: ingredient amounts and egg counts round for display; recipes/ and foods/ share no export name', () => {
    expect([roundRecipeGrams(2.3), roundRecipeGrams(47.6), roundRecipeGrams(437)]).toEqual([
      2.5, 48, 435,
    ]);
    expect([eggCount(400 / 4), eggCount((150 * 5) / 4), eggCount(10)]).toEqual([2, 4, 1]);
    const foods = new Set(Object.keys(foodsApi));
    expect(Object.keys(recipesApi).filter((name) => foods.has(name))).toEqual([]);
  });

  it('U15: a view carries its leftovers, season, swap hints, salt and an owner copy’s seed', () => {
    const traybake = recipeView(recipe('chicken-silverbeet-traybake'), context({ month: 1 }));
    expect(traybake.leftoversFeed.map((r) => r.id)).toEqual([
      'seed:recipe-silverbeet-lemon-chicken-soup',
      'seed:recipe-snack-chicken-lettuce-wraps',
    ]);
    expect(traybake.lines.find((l) => l.ingredientId === 'seed:silverbeet')?.inSeason).toBe(true);
    expect(traybake.lines.find((l) => l.ingredientId === 'seed:avocado')).toBeUndefined();
    // Swap hints are filtered exactly as the panel is: tofu is not hinted to a soy-listing owner.
    const soy = recipeView(
      recipe('chicken-silverbeet-traybake'),
      context({ profile: { ...context().profile, allergens: ['soy'] } }),
    );
    expect(soy.lines[0]?.swapHints).toEqual(['Chicken breast', 'Chicken drumsticks']);
    expect(traybake.lines[0]?.swapHints).toEqual([
      'Chicken breast',
      'Firm tofu',
      'Chicken drumsticks',
    ]);
    const salty = recipeView(recipe('tofu-mushroom-silverbeet-stir-fry'), context());
    expect(salty.lines.filter((l) => l.salty).map((l) => l.ingredientId)).toEqual([
      'seed:soy-sauce',
    ]);
    // Not loaded: no badge, every figure unknown; tofu's allergens not fully known.
    expect(salty.badge).toBeNull();
    expect(salty.allergens.facts).toEqual({ allergens: ['soy', 'wheat'], allergensUnknown: true });
    const frittata = recipe('silverbeet-feta-frittata');
    const copy = recipeView(copyOf(frittata, '00000000-0000-4000-8000-0000000000e1'), context());
    expect(copy).toMatchObject({
      origin: 'owner',
      slots: frittata.slots,
      oneMealOk: true,
      carbStyle: { written: null },
    });
    expect(copy.seed?.id).toBe(frittata.id);
  });

  it('U15: the list puts the silverbeet week first in day order and a copy in its seed’s place', () => {
    const frittata = recipe('silverbeet-feta-frittata');
    const copy = copyOf(frittata, '00000000-0000-4000-8000-0000000000e2');
    const entries = listRecipes(data(), [copy]);
    const week = entries.filter((e) => e.section === 'week');
    expect(week.map((e) => e.recipe.id)).toEqual(
      data().ketoFirstWeek.dinners.map((id) => (id === frittata.id ? copy.id : id)),
    );
    expect(week.map((e) => e.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(entries.map((e) => e.section).filter((s, i, all) => all.indexOf(s) === i)).toEqual([
      'week',
      'dinners',
      'snacks',
      'other',
    ]);
    expect(entries).toHaveLength(30);
    const dinners = entries.filter((e) => e.section === 'dinners').map((e) => e.recipe.title);
    expect(dinners).toEqual(
      [...dinners].sort((a, b) => a.localeCompare(b, 'en-NZ', { sensitivity: 'base' })),
    );
  });

  it('U16 HS-37: the checks read live figures, and item 15’s check takes them: unknown protein offers the snack', () => {
    const soup = recipe('silverbeet-lemon-chicken-soup');
    const meal = { slot: 'dinner' as const, recipeId: soup.id, myServes: 1, householdServes: 4 };
    const shipped = fixtureFoods({ notLoaded: 'all' });
    const unknown = plannedMealFigures(meal, recipeChecksOf(soup, shipped), shipped.resolve);
    expect(unknown).toMatchObject({ proteinKnown: false, incomplete: true, proteinG: 0 });
    const filled = fixtureFoods({
      notLoaded: 'all',
      overrides: overrideFiguresFor(soup.lines.map((l) => l.ingredientId)),
    });
    const known = plannedMealFigures(meal, recipeChecksOf(soup, filled), filled.resolve);
    expect(known).toMatchObject({ proteinKnown: true, incomplete: false });
    expect(known.proteinG).toBeGreaterThan(0);
  });
});
