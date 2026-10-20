import { describe, expect, it } from 'vitest';
import raw from '../../data/recipes.json' with { type: 'json' };
import { type FoodDataOk, foodData, seedViews } from '../foods/dataset';
import { heartRoleOf } from '../foods/heart';
import type { ReleaseRow } from '../foods/types';
import { NUTRIENT_KEYS, type Nutrients } from '../nutrition/nutrients';
import { foodAllergenFacts } from '../storage/overrides';
import { RECIPE_IDS_V1 } from './constants';
import { loadRecipeData, recipeData, seedRecipe } from './dataset';
import { RECIPE_INGREDIENT_CONTRACT } from './foodKind';
import { RECIPE_DATA_RULES, type RecipeDataRule, recipeDataProblems } from './validate';

const shipped = (): FoodDataOk => {
  const data = foodData();
  if (data.status !== 'ok') throw new Error('The shipped catalogue did not load');
  return data;
};

type Mutable = {
  recipes: {
    id: string;
    title: string;
    serves: number;
    slots: string[];
    carbStyle: string;
    lines: {
      ingredientId: string;
      rawG: number;
      cookedG: number | null;
      displayAs: string;
      swaps: string[];
      leftover: boolean;
    }[];
    method: string[];
    allergens: string[];
    usesLeftoversFrom: string | null;
  }[];
  ketoFirstWeek: { dinners: string[]; snacks: string[] };
};
const copy = (): Mutable => structuredClone(raw);
const recipe = (data: Mutable, id: string) => {
  const found = data.recipes.find((r) => r.id === `seed:recipe-${id}`);
  if (found === undefined) throw new Error(id);
  return found;
};
const at = (id: string) => `recipes[${RECIPE_IDS_V1.indexOf(`seed:recipe-${id}`)}]`;

/** The shipped catalogue with every food given the same synthetic figures (never shipped). */
function withFigures(
  per100g: Nutrients,
  only: Readonly<Record<string, Nutrients>> = {},
): FoodDataOk {
  const base = shipped();
  const row = (id: string): ReleaseRow => {
    const figures = only[id] ?? per100g;
    const values = Object.fromEntries(
      NUTRIENT_KEYS.map((k) => [
        k,
        {
          value: figures[k],
          unit: k === 'energyKj' ? 'kJ' : k === 'sodiumMg' ? 'mg' : 'g',
          field: k,
          source: 'nz-fcdb',
        },
      ]),
    ) as unknown as ReleaseRow['values'];
    return { source: 'nz-fcdb', foodId: id, foodName: 'Example', values };
  };
  return {
    ...base,
    releaseStatus: 'ok',
    release: {
      version: 1,
      sources: [
        {
          id: 'nz-fcdb',
          title: 'Example',
          edition: 'Example',
          retrievedOn: '2000-01-01',
          decidedOn: '2000-01-01',
        },
      ],
      foods: Object.fromEntries(base.catalogue.foods.map((f) => [f.id, row(f.id)])),
    },
  };
}
const zero: Nutrients = {
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
};

describe('NU-11 the shipped recipe dataset (item 20)', () => {
  it('U1 NU-11: passes every rule against item 18’s catalogue, loads frozen, in RECIPE_IDS_V1 order', () => {
    expect(recipeDataProblems(raw, shipped())).toEqual([]);
    const result = recipeData();
    if (result.status !== 'ok') throw new Error('The recipes did not load');
    expect(result.data.recipes.map((r) => r.id)).toEqual(RECIPE_IDS_V1);
    expect(new Set(RECIPE_IDS_V1).size).toBe(30);
    expect(Object.isFrozen(result.data.recipes[0]?.lines[0])).toBe(true);
    for (const id of RECIPE_IDS_V1) expect(seedRecipe(id)?.id).toBe(id);
    expect(seedRecipe('seed:recipe-nothing')).toBeNull();
    // A catalogue that failed to load leaves no recipes, and nothing throws.
    expect(loadRecipeData(raw, { status: 'error' })).toEqual({ status: 'error' });
    expect(loadRecipeData({ datasetVersion: 2 }, shipped())).toEqual({ status: 'error' });
  });

  it('U2 item 18 contract (H20a): every ingredient is an item 18 seed with at least the allergens recipes rely on', () => {
    const viewOf = new Map(seedViews().map((v) => [v.id, v]));
    const used = new Set(
      (raw as unknown as Mutable).recipes.flatMap((r) =>
        r.lines.flatMap((l) => [l.ingredientId, ...l.swaps]),
      ),
    );
    expect(used.size).toBe(65);
    for (const id of used) {
      const view = viewOf.get(id);
      expect(view, id).toBeDefined();
      expect(['raw', 'as-sold'], id).toContain(view?.nutrientBasis);
      const facts = view === undefined ? [] : foodAllergenFacts(view).allergens;
      expect(facts, id).toEqual(
        expect.arrayContaining([...(RECIPE_INGREDIENT_CONTRACT[id] ?? [])]),
      );
    }
    // Contract 1.2: the ids item 20's code and tests name.
    for (const id of [
      'seed:soy-sauce',
      'seed:fish-sauce',
      'seed:salt',
      'seed:liquid-stock',
      'seed:coconut-oil',
      'seed:coconut-cream',
      'seed:bacon',
      'seed:chicken-breast-cooked',
      'seed:silverbeet',
      'seed:firm-tofu',
    ])
      expect(viewOf.has(id), id).toBe(true);
    const seeds = shipped().seedById;
    expect(seeds.get('seed:eggs')?.group).toBe('egg');
    const lean = seeds.get('seed:beef-mince-lean');
    expect(lean && heartRoleOf(lean)).toEqual({ kind: 'neutral' });
    // Regular mince is a fatty cut (item 18); no recipe uses it.
    expect(used.has('seed:beef-mince')).toBe(false);
  });

  const cases: [RecipeDataRule, string, (d: Mutable) => void, string][] = [
    ['shape', 'an extra key', (d) => Object.assign(d.recipes[0] ?? {}, { extra: 1 }), 'recipes[0]'],
    [
      'id',
      'a bad id',
      (d) => void (recipe(d, 'chicken-kale-chickpeas').id = 'seed:recipe-Bad'),
      `${at('chicken-kale-chickpeas')}.id`,
    ],
    [
      'text',
      'a step with no full stop',
      (d) => void (recipe(d, 'chicken-kale-chickpeas').method[0] = 'Cook it'),
      `${at('chicken-kale-chickpeas')}.method[0]`,
    ],
    [
      'numbers',
      'nine serves',
      (d) => void (recipe(d, 'chicken-kale-chickpeas').serves = 9),
      `${at('chicken-kale-chickpeas')}.serves`,
    ],
    [
      'slots',
      'slots out of order',
      (d) => void (recipe(d, 'silverbeet-lemon-chicken-soup').slots = ['dinner', 'lunch']),
      `${at('silverbeet-lemon-chicken-soup')}.slots`,
    ],
    [
      'style',
      'a style that is not a diet mode',
      (d) => void (recipe(d, 'chicken-kale-chickpeas').carbStyle = 'paleo'),
      `${at('chicken-kale-chickpeas')}.carbStyle`,
    ],
    [
      'ingredient',
      'a food not in item 18',
      (d) =>
        void ((recipe(d, 'chicken-kale-chickpeas').lines[1] ?? { ingredientId: '' }).ingredientId =
          'seed:not-a-food'),
      `${at('chicken-kale-chickpeas')}.lines[1].ingredientId`,
    ],
    [
      'ingredient',
      'a swap to a cooked form',
      (d) =>
        void recipe(d, 'chicken-kale-chickpeas').lines[0]?.swaps.push('seed:chicken-breast-cooked'),
      `${at('chicken-kale-chickpeas')}.lines[0].swaps[1]`,
    ],
    [
      'basis',
      'a line on a cooked form',
      (d) =>
        void ((recipe(d, 'chicken-kale-chickpeas').lines[0] ?? { ingredientId: '' }).ingredientId =
          'seed:chicken-breast-cooked'),
      `${at('chicken-kale-chickpeas')}.lines[0].ingredientId`,
    ],
    [
      'allergens-match',
      'milk dropped from the frittata',
      (d) => void (recipe(d, 'silverbeet-feta-frittata').allergens = ['egg']),
      `${at('silverbeet-feta-frittata')}.allergens`,
    ],
    [
      'allergens-match',
      'fish dropped from the tuna salad (a brand-dependent line)',
      (d) => void (recipe(d, 'tuna-egg-green-bean-salad').allergens = ['egg']),
      `${at('tuna-egg-green-bean-salad')}.allergens`,
    ],
    [
      'cooked-weight',
      'a chicken line with no cooked weight',
      (d) => void ((recipe(d, 'chicken-kale-chickpeas').lines[0] ?? { cookedG: 0 }).cookedG = null),
      `${at('chicken-kale-chickpeas')}.lines[0].cookedG`,
    ],
    [
      'eggs',
      '425 g of eggs',
      (d) => void ((recipe(d, 'silverbeet-feta-frittata').lines[0] ?? { rawG: 0 }).rawG = 425),
      `${at('silverbeet-feta-frittata')}.lines[0].rawG`,
    ],
    [
      'cholesterol',
      'a bacon line',
      (d) =>
        void recipe(d, 'chicken-kale-chickpeas').lines.push({
          ingredientId: 'seed:bacon',
          rawG: 100,
          cookedG: null,
          displayAs: '100 g',
          swaps: [],
          leftover: false,
        }),
      `${at('chicken-kale-chickpeas')}.lines[10].ingredientId`,
    ],
    [
      'cholesterol',
      'feta over 40 g a serve',
      (d) => void ((recipe(d, 'silverbeet-feta-frittata').lines[3] ?? { rawG: 0 }).rawG = 200),
      `${at('silverbeet-feta-frittata')}.lines`,
    ],
    [
      'leftovers',
      'a leftover line with no source',
      (d) => void (recipe(d, 'silverbeet-lemon-chicken-soup').usesLeftoversFrom = null),
      `${at('silverbeet-lemon-chicken-soup')}.usesLeftoversFrom`,
    ],
    [
      'wording',
      'wine in a step',
      (d) => void (recipe(d, 'chicken-kale-chickpeas').method[1] = 'Deglaze with white wine.'),
      `${at('chicken-kale-chickpeas')}.method[1]`,
    ],
    [
      'first-week',
      'day 2’s soup moved to day 4',
      (d) => {
        const days = d.ketoFirstWeek.dinners;
        [days[1], days[3]] = [days[3] ?? '', days[1] ?? ''];
      },
      'ketoFirstWeek.dinners[3]',
    ],
    [
      'first-week',
      'the wraps snack moved to day 5',
      (d) => {
        const days = d.ketoFirstWeek.snacks;
        [days[1], days[4]] = [days[4] ?? '', days[1] ?? ''];
      },
      'ketoFirstWeek.snacks[4]',
    ],
    [
      'first-week',
      'boiled eggs on days 5 to 7 (over six eggs)',
      (d) => {
        d.ketoFirstWeek.snacks.splice(
          4,
          3,
          ...Array<string>(3).fill('seed:recipe-snack-eggs-avocado-cucumber'),
        );
      },
      'ketoFirstWeek',
    ],
    [
      'coverage',
      'one tofu dinner',
      (d) => {
        const tofu = recipe(d, 'baked-tofu-spinach-avocado');
        if (tofu.lines[0]) tofu.lines[0].ingredientId = 'seed:chicken-breast';
        tofu.allergens = [];
      },
      'recipes',
    ],
    [
      'coverage',
      'every silverbeet dinner keto',
      (d) => {
        for (const id of [
          'red-lentil-silverbeet-soup',
          'chicken-brown-rice-silverbeet-bowl',
          'fish-potato-silverbeet-traybake',
        ])
          recipe(d, id).carbStyle = 'keto';
      },
      'recipes',
    ],
  ];

  it.each(cases)('U3 NU-11: %s rule catches %s', (rule, _what, mutate, path) => {
    const data = copy();
    mutate(data);
    expect(recipeDataProblems(data, shipped())).toContainEqual({ path, rule });
  });

  it('U3 NU-11: every one of the 16 rules has a seeded failure', () => {
    expect(new Set(cases.map(([rule]) => rule))).toEqual(new Set(RECIPE_DATA_RULES));
  });

  it('U3 NU-11: once figures exist, a keto recipe over 10 g of net carbs a serve and a flagged one are refused', () => {
    // Synthetic figures only: every food 0, then one food given carbs or saturated fat.
    const carbs = withFigures(zero, { 'seed:silverbeet': { ...zero, carbsG: 20 } });
    expect(recipeDataProblems(raw, carbs)).toContainEqual({
      path: `${at('chicken-silverbeet-traybake')}.carbStyle`,
      rule: 'style',
    });
    // 800 g of chicken at 5 g saturated fat per 100 g: 10 g a serve, over the 8 g cap.
    const fat = withFigures(zero, {
      'seed:chicken-thigh': { ...zero, fatG: 10, saturatedFatG: 5 },
    });
    expect(recipeDataProblems(raw, fat)).toContainEqual({
      path: `${at('chicken-silverbeet-traybake')}.lines`,
      rule: 'cholesterol',
    });
    expect(recipeDataProblems(raw, withFigures(zero))).toEqual([]);
  });

  it('U3 NU-11: never throws, whatever is changed (200 seeded random changes)', () => {
    let seed = 20;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const junk = [null, -1, 0, 1.5, '', 'x', [], {}, true, { __proto__: 1 }, 1e9];
    for (let i = 0; i < 200; i++) {
      const data = copy() as unknown as Record<string, unknown>;
      let node: unknown = data;
      // Walk a random path, then replace what is there with junk.
      for (let depth = 0; depth < 4 && typeof node === 'object' && node !== null; depth++) {
        const keys = Object.keys(node);
        const key = keys[Math.floor(next() * keys.length)];
        if (key === undefined) break;
        const child: unknown = (node as Record<string, unknown>)[key];
        if (depth === 3 || typeof child !== 'object' || child === null || next() < 0.3) {
          (node as Record<string, unknown>)[key] = junk[Math.floor(next() * junk.length)];
          break;
        }
        node = child;
      }
      expect(() => recipeDataProblems(data, shipped())).not.toThrow();
    }
  });
});
