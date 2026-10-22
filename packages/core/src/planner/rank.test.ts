import { describe, expect, it } from 'vitest';
import { blockedAllergens } from '../recipes/allergens';
import type { RecipeView } from '../recipes/view';
import type { NetCarbCeiling } from '../targets/carbs';
import { foodData } from '../foods/dataset';
import { recipeData } from '../recipes/dataset';
import { planRecipeLookup } from './context';
import { gardenFirstNote, suggestionsFor } from './rank';
import { planSlotsFor } from './slots';
import { fixtureLookup, foodId, R } from './testData';

const KETO: NetCarbCeiling = { kind: 'ceiling', grams: 30, basis: 'keto' };
const KICKSTART: NetCarbCeiling = { kind: 'ceiling', grams: 20, basis: 'kickstart' };
const BALANCED: NetCarbCeiling = { kind: 'none', basis: 'balanced' };

function suggest(
  options: {
    readonly allergens?: Parameters<typeof fixtureLookup>[0] extends infer O
      ? O extends { readonly allergens?: infer A }
        ? A
        : never
      : never;
    readonly glutenFreeHousehold?: boolean;
    readonly sharing?: 'own' | 'shared';
    readonly dislikeTerms?: readonly string[];
    readonly hidden?: readonly string[];
    readonly ceiling?: NetCarbCeiling;
    readonly ready?: readonly string[];
    readonly daysLeft?: Readonly<Record<string, number>>;
    readonly window?: { start: string; end: string } | null;
    readonly firstWeek?: boolean;
    readonly month?: number;
    readonly views?: (views: readonly RecipeView[]) => readonly RecipeView[];
  } = {},
) {
  const lookup = fixtureLookup({
    allergens: options.allergens ?? [],
    glutenFreeHousehold: options.glutenFreeHousehold ?? false,
    dislikeTerms: options.dislikeTerms ?? [],
    hidden: options.hidden ?? [],
  });
  const profile = {
    allergens: [...(options.allergens ?? [])],
    glutenFreeHousehold: options.glutenFreeHousehold ?? false,
  };
  const listed = lookup.listed();
  return suggestionsFor({
    slot: 'dinner',
    day: planSlotsFor(
      options.window === undefined ? { start: '17:00', end: '19:00' } : options.window,
    ),
    views: options.views?.(listed) ?? listed,
    blocked: blockedAllergens(profile, options.sharing ?? 'own'),
    blockedOwn: blockedAllergens(profile, 'own'),
    hiddenSeedIds: new Set(options.hidden ?? []),
    ceiling: options.ceiling ?? KETO,
    stock: {
      ready: new Set((options.ready ?? []).map(foodId)),
      daysLeft: new Map(Object.entries(options.daysLeft ?? {}).map(([k, v]) => [foodId(k), v])),
    },
    seasonOf: (id) => lookup.resolve(id)?.seasonMonths ?? [],
    month: options.month ?? 1,
    firstWeek: options.firstWeek ?? false,
  });
}

const ids = (list: readonly { readonly view: RecipeView }[]) => list.map((c) => c.view.id);

describe('suggestions, garden first among safe recipes (item 22 S8; NU-07, FL-04, C107, P43)', () => {
  it('NU-07: two ready in-season garden foods put Example garden dinner F first, with the "two" line', () => {
    const s = suggest({ ready: ['green-a', 'green-b'] });
    expect(ids(s.ok)[0]).toBe(R.gardenF);
    expect(s.ok[0]?.group).toBe(0);
    expect(gardenFirstNote(s)).toBe('two');
    const one = suggest({ ready: ['green-a'] });
    expect(one.ok.find((c) => c.view.id === R.gardenF)?.group).toBe(1);
    expect(gardenFirstNote(one)).toBe('one');
    // Green C is out of season in January: with A it makes group 1, not 0.
    const offSeason = suggest({
      ready: ['green-a', 'green-c'],
      views: (views) =>
        views.map((v) =>
          v.id === R.gardenF
            ? {
                ...v,
                lines: v.lines.map((l, i) =>
                  i === 2 ? { ...l, ingredientId: foodId('green-c') } : l,
                ),
              }
            : v,
        ),
    });
    expect(offSeason.ok.find((c) => c.view.id === R.gardenF)?.group).toBe(1);
    expect(gardenFirstNote(suggest())).toBeNull();
  });

  it('within a group, fewer days left come first', () => {
    const s = suggest({
      month: 7,
      ready: ['green-a', 'green-b', 'green-c'],
      daysLeft: { 'green-b': 3, 'green-c': 1 },
      views: (views) =>
        views.map((v) =>
          v.id === R.lightM
            ? {
                ...v,
                lines: v.lines.map((l, i) =>
                  i === 2 ? { ...l, ingredientId: foodId('green-c') } : l,
                ),
              }
            : v,
        ),
    });
    expect(ids(s.ok).slice(0, 2)).toEqual([R.lightM, R.gardenF]);
  });

  it('item 19: a ready crop never promotes a recipe a filter removed (fish listed; the 20 g ceiling)', () => {
    const fish = suggest({ allergens: ['fish'], ready: ['green-a', 'green-b'] });
    expect([...ids(fish.ok), ...ids(fish.checkLabels)]).not.toContain(R.fishD);
    const kick = suggest({ ceiling: KICKSTART, ready: ['green-a', 'green-b'] });
    expect(ids(kick.ok)).not.toContain(R.carbI);
    expect(kick.notShown.ceiling).toBeGreaterThan(0);
  });

  it('filters are counted where they remove a recipe; packed recipes go to "check labels"', () => {
    const s = suggest({ allergens: ['fish'], dislikeTerms: ['wheat food'], hidden: [R.bigH] });
    expect(s.notShown).toMatchObject({ allergen: 1, dislike: 1, hidden: 1 });
    expect(ids(s.checkLabels)).toContain(R.packedG);
    expect(ids(s.ok)).not.toContain(R.packedG);
    const gluten = suggest({ glutenFreeHousehold: true, sharing: 'shared' });
    expect(gluten.notShown).toMatchObject({ allergen: 0, householdGluten: 1 });
    const oneMeal = suggest({ window: { start: '18:00', end: '19:00' } });
    expect(oneMeal.notShown.oneMeal).toBe(1);
    expect(ids(oneMeal.ok)).not.toContain(R.soupC);
  });

  it('FL-04: keto and balanced give the same members (apart from the ceiling filter) in another order', () => {
    const keto = ids(suggest({ ceiling: KETO }).ok);
    const balanced = ids(suggest({ ceiling: BALANCED }).ok);
    expect([...balanced].sort()).toEqual([...new Set([...keto, R.wheatE, R.carbI])].sort());
    expect(keto).not.toEqual(balanced.filter((id) => keto.includes(id)));
    expect(keto[0]).not.toBe(R.carbI);
  });

  it('first planned week: silverbeet dinners come first within their group', () => {
    const s = suggest({
      firstWeek: true,
      views: (views) => views.map((v) => (v.id === R.lightM ? { ...v, usesSilverbeet: true } : v)),
    });
    expect(ids(s.ok)[0]).toBe(R.lightM);
    expect(ids(suggest().ok)[0]).not.toBe(R.lightM);
  });

  it('H22a: with the shipped datasets no tuna recipe is offered to a fish-listing owner, nor peanut butter to a peanut-listing one', () => {
    const foods = foodData();
    const recipes = recipeData();
    if (foods.status !== 'ok' || recipes.status !== 'ok') throw new Error('shipped data');
    for (const [allergen, food] of [
      ['fish', 'seed:tuna-in-water'],
      ['peanut', 'seed:peanut-butter'],
    ] as const) {
      const profile = { allergens: [allergen], glutenFreeHousehold: false };
      const lookup = planRecipeLookup(
        { foods, recipes: recipes.data, approved: [], attributions: {} },
        {
          ownRecipes: [],
          ownIngredients: [],
          overrides: [],
          hiddenSeedIds: [],
          profile: { ...profile, dislikeIngredientIds: [], dislikeTerms: [] },
        },
      );
      for (const slot of ['breakfast', 'lunch', 'snack', 'dinner'] as const) {
        const s = suggestionsFor({
          slot,
          day: planSlotsFor(null),
          views: lookup.listed(),
          blocked: blockedAllergens(profile, 'own'),
          blockedOwn: blockedAllergens(profile, 'own'),
          hiddenSeedIds: new Set(),
          ceiling: BALANCED,
          stock: { ready: new Set(), daysLeft: new Map() },
          seasonOf: () => [],
          month: 1,
          firstWeek: false,
        });
        const offered = [...s.ok, ...s.checkLabels];
        expect(offered.some((c) => c.view.lines.some((l) => l.ingredientId === food))).toBe(false);
        // Every seed has a line whose allergens are not fully known, so none is plainly 'ok' (P41).
        expect(s.ok).toEqual([]);
      }
    }
  });
});
