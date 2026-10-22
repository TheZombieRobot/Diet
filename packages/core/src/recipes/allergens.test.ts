import { describe, expect, it } from 'vitest';
import { type Allergen, GLUTEN_CEREALS } from '../storage/allergens';
import { ingredientResolver } from '../storage/overrides';
import type { IngredientOverrideRecord, RecipeLine } from '../storage/records';
import {
  allergenUnion,
  blockedAllergens,
  originAllergens,
  recipeAllergenView,
  servingFor,
} from './allergens';
import { recipeData } from './dataset';
import type { RecipeFoods } from './foodKind';
import { scaleLines } from './scale';
import { applySwap, substituteOptions, type SwapProfile, swapPool } from './swap';
import { exampleOwnFood, fixtureFoods, fixtureSeedViews, SYNTHETIC_PER_100G } from './testData';
import type { RecipeData, SeedRecipe, SeedRecipeLine } from './types';

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
const lineOf = (r: SeedRecipe, ingredientId: string): [number, SeedRecipeLine] => {
  const index = r.lines.findIndex((l) => l.ingredientId === ingredientId);
  const line = r.lines[index];
  if (line === undefined) throw new Error(ingredientId);
  return [index, line];
};
const profile = (changes: Partial<SwapProfile> = {}): SwapProfile => ({
  allergens: [],
  dislikeIngredientIds: [],
  dislikeTerms: [],
  glutenFreeHousehold: false,
  ...changes,
});

/** The shipped allergen model (every packed food brand-dependent), and every list complete (U10b, U11b). */
const shippedModel = fixtureFoods();
function completeAllergenFoods(): RecipeFoods {
  const views = fixtureSeedViews().map((v) => ({
    ...v,
    allergensIfComplete: [...v.allergensAtLeast],
  }));
  return { ...shippedModel, resolve: ingredientResolver(views, [], []) };
}

describe.each([
  ['the shipped allergen model', shippedModel],
  ['every allergen list complete', completeAllergenFoods()],
])('HS-24 recipe allergens are never lost, on %s (item 20)', (_model, foods) => {
  const swap = (r: SeedRecipe, from: string, to: string) =>
    applySwap({ base: r, lineIndex: lineOf(r, from)[0], ingredientId: to, origin: [], foods })
      .allergens;

  it('U10 HS-24 FL-06: a swap keeps the swapped-out food’s allergens and adds the new one’s', () => {
    const patties = recipe('salmon-silverbeet-patties');
    expect(swap(patties, 'seed:almond-meal', 'seed:sunflower-seeds')).toEqual([
      'tree-nut',
      'egg',
      'fish',
    ]);
    expect(swap(patties, 'seed:canned-salmon', 'seed:tuna-in-water')).toContain('fish');
    // A restored copy whose list was emptied: the swapped-out almond line still counts.
    const emptied = { ...patties, allergens: [] };
    expect(swap(emptied, 'seed:almond-meal', 'seed:sunflower-seeds')).toContain('tree-nut');
    // Tofu is brand-dependent but known to contain soy, so the traybake gains soy.
    expect(
      swap(recipe('chicken-silverbeet-traybake'), 'seed:chicken-thigh', 'seed:firm-tofu'),
    ).toEqual(['soy']);
  });

  it('U10 HS-24: scaling, a previous list or an origin can never drop one; an owner copy keeps its origin’s', () => {
    const patties = recipe('salmon-silverbeet-patties');
    const view = (lines: readonly SeedRecipeLine[]) =>
      recipeAllergenView(
        { allergens: patties.allergens, lines, derivedFromRecipeId: null },
        foods,
        [],
      ).facts.allergens;
    expect(view(scaleLines(patties.lines, 4, 20))).toEqual(view(patties.lines));
    const union = allergenUnion({
      declared: [],
      previous: ['sesame'],
      origin: ['peanut'],
      lines: patties.lines,
      foods,
    });
    expect(union).toEqual(['peanut', 'tree-nut', 'egg', 'fish', 'sesame']);
    // A restored copy of the patties with its list emptied and the almond line swapped out.
    const [almond] = lineOf(patties, 'seed:almond-meal');
    const lines = patties.lines.map((l, i) =>
      i === almond ? { ...l, ingredientId: 'seed:sunflower-seeds' } : l,
    );
    const origin = originAllergens(patties.id, data(), new Map(), foods);
    const copy = recipeAllergenView(
      { allergens: [], lines, derivedFromRecipeId: patties.id },
      foods,
      origin,
    );
    expect(copy.facts.allergens).toEqual(['tree-nut', 'egg', 'fish']);
    expect(copy.inheritedOnly).toEqual(['tree-nut']);
    // A tampered two-step loop of copies ends.
    const a = { allergens: ['sesame'] as Allergen[], lines: [], derivedFromRecipeId: 'b' };
    const b = { allergens: ['lupin'] as Allergen[], lines: [], derivedFromRecipeId: 'a' };
    expect(
      originAllergens(
        'a',
        data(),
        new Map([
          ['a', a],
          ['b', b],
        ]),
        foods,
      ),
    ).toEqual(['sesame', 'lupin']);
  });

  it('U10 P41: the lines whose labels to check are those whose allergens are not fully known', () => {
    const frittata = recipe('silverbeet-feta-frittata');
    const view = recipeAllergenView({ ...frittata, derivedFromRecipeId: null }, foods, []);
    // Feta, olive oil, oregano and pepper are packed: their allergens depend on the brand.
    expect(view.checkLabelLines).toEqual(foods === shippedModel ? [3, 4, 5, 6] : []);
  });

  it('U10 HS-24: 200 random swap sequences never shrink a recipe’s allergens', () => {
    let seed = 24;
    const next = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const ids = [...foods.seedById.values()].filter((f) => f.basis !== 'cooked').map((f) => f.id);
    for (let i = 0; i < 200; i++) {
      const base = data().recipes[Math.floor(next() * data().recipes.length)];
      if (base === undefined) continue;
      let current: { serves: number; allergens: Allergen[]; lines: RecipeLine[] } = {
        serves: base.serves,
        allergens: [...base.allergens],
        lines: [...base.lines],
      };
      for (let step = 0; step < 4; step++) {
        const draft = applySwap({
          base: current,
          lineIndex: Math.floor(next() * current.lines.length),
          ingredientId: ids[Math.floor(next() * ids.length)] ?? 'seed:salt',
          origin: base.allergens,
          foods,
        });
        expect(draft.allergens).toEqual(expect.arrayContaining(current.allergens));
        current = { ...current, allergens: draft.allergens, lines: draft.lines };
      }
    }
  });

  it('U11 C107 HS-24: a swap known to carry a listed allergen is never offered, brand-dependent or not', () => {
    const options = (
      r: SeedRecipe,
      ingredientId: string,
      p: SwapProfile,
      garden: readonly string[] = [],
    ) =>
      substituteOptions({
        line: lineOf(r, ingredientId)[1],
        seedLines: null,
        foods,
        profile: p,
        gardenIngredientIds: new Set(garden),
      });
    const traybake = recipe('chicken-silverbeet-traybake');
    const soy = options(traybake, 'seed:chicken-thigh', profile({ allergens: ['soy'] }));
    expect(soy.candidates.map((c) => c.id)).not.toContain('seed:firm-tofu');
    expect(soy.hidden.allergen).toBe(1);
    const fish = options(
      recipe('salmon-silverbeet-patties'),
      'seed:canned-salmon',
      profile({ allergens: ['fish'] }),
    );
    expect(fish.candidates).toEqual([]);
    expect(fish.hidden.allergen).toBe(2);
    const gluten = options(
      recipe('oats-yoghurt-berries'),
      'seed:trim-milk',
      profile({ allergens: ['gluten'] }),
    );
    for (const c of gluten.candidates)
      expect(
        c.facts.allergens.filter((a) => (GLUTEN_CEREALS as readonly Allergen[]).includes(a)),
      ).toEqual([]);
    // Garden foods first.
    const green = options(traybake, 'seed:silverbeet', profile(), ['seed:kale']);
    expect(green.candidates.map((c) => c.id)).toEqual(['seed:kale', 'seed:spinach']);
  });
});

describe('swaps offered on the shipped model (item 20)', () => {
  const foods = shippedModel;

  it('U11 FL-07 C107: a gluten-free swap is offered only with Gluten-free household on, whatever the profile lists', () => {
    const line: SeedRecipeLine = {
      ingredientId: 'seed:soy-sauce',
      rawG: 30,
      cookedG: null,
      displayAs: '2 tablespoons',
      swaps: ['seed:salt'],
      leftover: false,
    };
    const offer = (p: SwapProfile) =>
      substituteOptions({
        line,
        seedLines: null,
        foods,
        profile: p,
        gardenIngredientIds: new Set(),
      });
    const off = offer(profile({ allergens: ['gluten'] }));
    expect(off.candidates).toEqual([]);
    expect(off.hidden.glutenFree).toBe(1);
    expect(offer(profile({ glutenFreeHousehold: true })).candidates.map((c) => c.id)).toEqual([
      'seed:salt',
    ]);
  });

  it('U11 FL-07: with Gluten-free household on, a swap known to carry a gluten cereal is never offered', () => {
    const [, almond] = lineOf(recipe('salmon-silverbeet-patties'), 'seed:almond-meal');
    const offer = (p: SwapProfile) =>
      substituteOptions({
        line: almond,
        seedLines: null,
        foods,
        profile: p,
        gardenIngredientIds: new Set(),
      });
    expect(offer(profile()).candidates.map((c) => c.id)).toContain('seed:plain-flour');
    const household = offer(profile({ glutenFreeHousehold: true }));
    expect(household.candidates.map((c) => c.id)).toEqual(['seed:sunflower-seeds']);
    expect(household.hidden).toEqual({
      allergen: 0,
      glutenHousehold: 1,
      dislike: 0,
      glutenFree: 0,
    });
  });

  it('U11 C43: disliked foods are left out and counted; a brand-dependent candidate says "check the label"', () => {
    const traybake = recipe('chicken-silverbeet-traybake');
    const [, thigh] = lineOf(traybake, 'seed:chicken-thigh');
    const offer = (p: SwapProfile) =>
      substituteOptions({
        line: thigh,
        seedLines: null,
        foods,
        profile: p,
        gardenIngredientIds: new Set(),
      });
    const all = offer(profile());
    expect(all.candidates.find((c) => c.id === 'seed:firm-tofu')?.checkLabel).toBe(true);
    expect(all.candidates.find((c) => c.id === 'seed:chicken-breast')?.checkLabel).toBe(false);
    const byTerm = offer(profile({ dislikeTerms: ['tofu'] }));
    expect(byTerm.candidates.map((c) => c.id)).not.toContain('seed:firm-tofu');
    expect(byTerm.hidden.dislike).toBe(1);
    expect(offer(profile({ dislikeIngredientIds: ['seed:chicken-breast'] })).hidden.dislike).toBe(
      1,
    );
  });

  it('U11 C11: an alcohol food, a cooked form, an unresolved id or the line’s own food is never in the pool', () => {
    const wine = exampleOwnFood(
      '00000000-0000-4000-8000-0000000000d1',
      'Example white wine',
      SYNTHETIC_PER_100G,
    );
    const override: IngredientOverrideRecord = {
      seedId: 'seed:chicken-thigh',
      changes: [
        {
          field: 'substitutes',
          value: [wine.id, 'seed:chicken-breast-cooked', 'seed:nothing', 'seed:chicken-thigh'],
        },
      ],
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };
    const withWine = fixtureFoods({ own: [wine], overrides: [override] });
    const [, thigh] = lineOf(recipe('chicken-silverbeet-traybake'), 'seed:chicken-thigh');
    expect(swapPool(thigh, null, withWine)).toEqual(['seed:chicken-breast', 'seed:firm-tofu']);
  });

  it('U11 FL-07: a shared household meal also blocks the gluten cereals while Gluten-free household is on', () => {
    const p = { allergens: ['peanut' as const], glutenFreeHousehold: true };
    expect(blockedAllergens(p, 'own')).toEqual(['peanut']);
    expect(blockedAllergens(p, 'shared')).toEqual(['peanut', 'wheat', 'barley', 'oats', 'rye']);
    expect(blockedAllergens({ allergens: ['gluten'], glutenFreeHousehold: false }, 'own')).toEqual([
      ...GLUTEN_CEREALS,
    ]);
  });

  it('P41: allergens not fully known are never served as free of a listed allergen', () => {
    const facts = { allergens: ['soy' as const], allergensUnknown: true };
    expect(servingFor([], facts).serving).toBe('ok');
    expect(servingFor(['peanut'], facts).serving).toBe('unknown');
    expect(servingFor(['soy'], facts)).toEqual({ serving: 'conflict', conflicts: ['soy'] });
  });
});
