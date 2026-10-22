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
  datasetVersion: number;
  recipes: {
    id: string;
    title: string;
    serves: number;
    timeMinutes: number;
    slots: string[];
    oneMealOk: boolean;
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
const line = (data: Mutable, id: string, j: number) => {
  const found = recipe(data, id).lines[j];
  if (found === undefined) throw new Error(`${id} line ${String(j)}`);
  return found;
};
const added = (ingredientId: string) => ({
  ingredientId,
  rawG: 5,
  cookedG: null,
  displayAs: 'a little',
  swaps: [],
  leftover: false,
});

/**
 * The shipped catalogue with every food given the same synthetic figures (never shipped), or with
 * `partly`, only the foods in `only` loaded and every other one not loaded.
 */
function withFigures(
  per100g: Nutrients,
  only: Readonly<Record<string, Nutrients>> = {},
  partly = false,
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
      foods: Object.fromEntries(
        base.catalogue.foods.filter((f) => !partly || f.id in only).map((f) => [f.id, row(f.id)]),
      ),
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
    // One seeded failure for each check inside a rule (item 20 review), not only for each rule.
    [
      'eggs',
      'three eggs a serve',
      (d) => {
        Object.assign(line(d, 'eggs-greens-tomatoes', 0), { rawG: 150, cookedG: 150 });
      },
      `${at('eggs-greens-tomatoes')}.lines`,
    ],
    [
      'cooked-weight',
      'a fish fillet that does not shrink',
      (d) => void (line(d, 'baked-kahawai-cabbage-slaw', 0).cookedG = 700),
      `${at('baked-kahawai-cabbage-slaw')}.lines[0].cookedG`,
    ],
    [
      'cooked-weight',
      'drained tuna that weighs more cooked',
      (d) => void (line(d, 'tuna-egg-green-bean-salad', 0).cookedG = 300),
      `${at('tuna-egg-green-bean-salad')}.lines[0].cookedG`,
    ],
    [
      'ingredient',
      'a swap to the line’s own food',
      (d) => void line(d, 'chicken-silverbeet-traybake', 0).swaps.push('seed:chicken-thigh'),
      `${at('chicken-silverbeet-traybake')}.lines[0].swaps`,
    ],
    [
      'ingredient',
      'the same swap twice',
      (d) => void (line(d, 'chicken-silverbeet-traybake', 1).swaps = ['seed:kale', 'seed:kale']),
      `${at('chicken-silverbeet-traybake')}.lines[1].swaps`,
    ],
    [
      'ingredient',
      'six swaps',
      (d) =>
        void (line(d, 'chicken-silverbeet-traybake', 1).swaps = [
          'seed:spinach',
          'seed:kale',
          'seed:cos-lettuce',
          'seed:salad-leaves',
          'seed:bok-choy',
          'seed:cabbage',
        ]),
      `${at('chicken-silverbeet-traybake')}.lines[1].swaps`,
    ],
    [
      'allergens-match',
      'allergens out of order',
      (d) => void (recipe(d, 'salmon-silverbeet-patties').allergens = ['egg', 'tree-nut', 'fish']),
      `${at('salmon-silverbeet-patties')}.allergens`,
    ],
    [
      'allergens-match',
      'an allergen that is not one of the fifteen',
      (d) => void recipe(d, 'salmon-silverbeet-patties').allergens.push('nuts'),
      `${at('salmon-silverbeet-patties')}.allergens`,
    ],
    [
      'text',
      'a title another recipe has',
      (d) =>
        void (recipe(d, 'chicken-kale-chickpeas').title = 'LEMON chicken and silverbeet traybake'),
      `${at('chicken-kale-chickpeas')}.title`,
    ],
    [
      'text',
      '13 steps',
      (d) => void (recipe(d, 'chicken-kale-chickpeas').method = Array<string>(13).fill('Stir.')),
      `${at('chicken-kale-chickpeas')}.method`,
    ],
    [
      'text',
      'an amount over 40 characters',
      (d) => void (line(d, 'chicken-kale-chickpeas', 0).displayAs = 'x'.repeat(41)),
      `${at('chicken-kale-chickpeas')}.lines[0].displayAs`,
    ],
    [
      'id',
      'a version-1 id gone',
      (d) => void (recipe(d, 'oats-yoghurt-berries').id = 'seed:recipe-oats-berries'),
      'recipes',
    ],
    [
      'id',
      'two recipes with one id',
      (d) =>
        void (recipe(d, 'chicken-avocado-green-salad').id = 'seed:recipe-oats-yoghurt-berries'),
      `${at('chicken-avocado-green-salad')}.id`,
    ],
    [
      'id',
      'an id without "recipe-"',
      (d) => void (recipe(d, 'oats-yoghurt-berries').id = 'seed:silverbeet-x'),
      `${at('oats-yoghurt-berries')}.id`,
    ],
    [
      'numbers',
      'a line of 0 g',
      (d) => void (line(d, 'silverbeet-feta-frittata', 1).rawG = 0),
      `${at('silverbeet-feta-frittata')}.lines[1].rawG`,
    ],
    [
      'numbers',
      'no time',
      (d) => void (recipe(d, 'silverbeet-feta-frittata').timeMinutes = 0),
      `${at('silverbeet-feta-frittata')}.timeMinutes`,
    ],
    ['shape', 'dataset version 2', (d) => void (d.datasetVersion = 2), 'datasetVersion'],
    [
      'shape',
      'a __proto__ key',
      (d) => {
        // An own "__proto__" key, as JSON.parse makes one (assignment would set the prototype).
        Object.defineProperty(line(d, 'chicken-kale-chickpeas', 0), '__proto__', {
          value: 1,
          enumerable: true,
        });
      },
      '',
    ],
    [
      'first-week',
      'a week dinner not written for keto',
      (d) => void (recipe(d, 'mince-tomato-silverbeet-skillet').carbStyle = 'moderate-low-carb'),
      'ketoFirstWeek.dinners[3]',
    ],
    [
      'first-week',
      'a week dinner that is not a dinner',
      (d) => void (recipe(d, 'silverbeet-feta-frittata').slots = ['breakfast', 'lunch']),
      'ketoFirstWeek.dinners[2]',
    ],
    [
      'first-week',
      'a week dinner without silverbeet',
      (d) => void (line(d, 'fish-garlicky-silverbeet', 1).ingredientId = 'seed:cabbage'),
      'ketoFirstWeek.dinners[4]',
    ],
    [
      'first-week',
      'a dinner twice in the week',
      (d) => void (d.ketoFirstWeek.dinners[6] = d.ketoFirstWeek.dinners[0] ?? ''),
      'ketoFirstWeek.dinners',
    ],
    [
      'coverage',
      'a tofu dinner not written for keto',
      (d) => void (recipe(d, 'baked-tofu-spinach-avocado').carbStyle = 'moderate-low-carb'),
      'recipes',
    ],
    [
      'coverage',
      'no canned fish at dinner',
      (d) => {
        for (const id of [
          'salmon-silverbeet-patties',
          'sardine-avocado-cucumber-salad',
          'tuna-egg-green-bean-salad',
        ])
          recipe(d, id).slots = ['lunch'];
      },
      'recipes',
    ],
    [
      'coverage',
      'no lean mince',
      (d) => {
        for (const r of d.recipes)
          for (const l of r.lines)
            if (l.ingredientId === 'seed:beef-mince-lean') l.ingredientId = 'seed:chicken-thigh';
      },
      'recipes',
    ],
    [
      'coverage',
      'leafy greens in fewer than ten recipes',
      (d) => {
        // Silverbeet stays in the three dinners that are not keto, so only this clause fails.
        const keep = [
          'red-lentil-silverbeet-soup',
          'chicken-brown-rice-silverbeet-bowl',
          'fish-potato-silverbeet-traybake',
        ].map((id) => `seed:recipe-${id}`);
        const seeds = shipped().seedById;
        for (const r of d.recipes) {
          if (keep.includes(r.id)) continue;
          for (const l of r.lines)
            if (seeds.get(l.ingredientId)?.group === 'leafy-green')
              l.ingredientId = 'seed:broccoli';
        }
      },
      'recipes',
    ],
    [
      'coverage',
      'no moderate low-carb dinner',
      (d) => {
        for (const id of ['beef-bean-pumpkin-chilli', 'red-lentil-silverbeet-soup'])
          recipe(d, id).carbStyle = 'balanced';
      },
      'recipes',
    ],
    [
      'leftovers',
      'a leftover food its source does not have',
      (d) =>
        void (line(d, 'silverbeet-lemon-chicken-soup', 0).ingredientId = 'seed:chicken-breast'),
      `${at('silverbeet-lemon-chicken-soup')}.lines[0]`,
    ],
    [
      'leftovers',
      'a recipe that is its own leftover source',
      (d) => {
        const soup = recipe(d, 'silverbeet-lemon-chicken-soup');
        soup.usesLeftoversFrom = soup.id;
      },
      `${at('silverbeet-lemon-chicken-soup')}.usesLeftoversFrom`,
    ],
    [
      'salt',
      'a salt line',
      (d) => void recipe(d, 'fish-spinach-tomato-curry').lines.push(added('seed:salt')),
      `${at('fish-spinach-tomato-curry')}.lines[10].ingredientId`,
    ],
    [
      'salt',
      'soy sauce in a fifth recipe',
      (d) =>
        void recipe(d, 'garlic-chicken-courgette-broccoli').lines.push(added('seed:soy-sauce')),
      `${at('garlic-chicken-courgette-broccoli')}.lines[8].ingredientId`,
    ],
    [
      'cholesterol',
      'a curated swap to cream',
      (d) => void (line(d, 'oats-yoghurt-berries', 1).swaps = ['seed:cream']),
      `${at('oats-yoghurt-berries')}.lines[1].swaps[0]`,
    ],
    [
      'cholesterol',
      'a curated swap to 250 g of cheese a serve',
      (d) => void (line(d, 'oats-yoghurt-berries', 1).swaps = ['seed:feta']),
      `${at('oats-yoghurt-berries')}.lines[1].swaps[0]`,
    ],
  ];

  it.each(cases)('U3 NU-11: %s rule catches %s', (rule, _what, mutate, path) => {
    const data = copy();
    mutate(data);
    expect(recipeDataProblems(data, shipped())).toContainEqual({ path, rule });
  });

  it('U3 NU-11: every one of the 17 rules has a seeded failure', () => {
    expect(new Set(cases.map(([rule]) => rule))).toEqual(new Set(RECIPE_DATA_RULES));
  });

  it('U3 NU-11 C16: banned wording is caught in a title, a step and an amount', () => {
    const places: [string, (d: Mutable, text: string) => void][] = [
      [
        'title',
        (d, text) => void (recipe(d, 'chicken-silverbeet-traybake').title = `${text} dish`),
      ],
      [
        'method[0]',
        (d, text) => void (recipe(d, 'chicken-silverbeet-traybake').method[0] = `A ${text} dish.`),
      ],
      [
        'lines[0].displayAs',
        (d, text) => void (line(d, 'chicken-silverbeet-traybake', 0).displayAs = `${text} pieces`),
      ],
    ];
    for (const text of ['allergy-safe', 'gluten-free', 'heart', 'Keto', 'cheap', 'undercooked'])
      for (const [place, put] of places) {
        const data = copy();
        put(data, text);
        expect(recipeDataProblems(data, shipped()), `${text} in ${place}`).toContainEqual({
          path: `${at('chicken-silverbeet-traybake')}.${place}`,
          rule: 'wording',
        });
      }
  });

  it('U3 NU-11 C11: a line on a food whose name is an alcohol is refused', () => {
    const base = shipped();
    const oil = base.seedById.get('seed:canola-oil');
    if (oil === undefined) throw new Error('canola oil');
    const seedById = new Map(base.seedById);
    seedById.set(oil.id, { ...oil, name: 'Example rice wine' });
    expect(recipeDataProblems(raw, { ...base, seedById })).toContainEqual({
      path: `${at('tofu-mushroom-silverbeet-stir-fry')}.lines[6].ingredientId`,
      rule: 'ingredient',
    });
  });

  it('U3 NU-11 HS-39: a partly loaded release whose known part already breaks a limit is refused', () => {
    // Only silverbeet loaded, at 20 g of carbs per 100 g: at least 20 g a serve of a keto dinner.
    const carbs = withFigures(zero, { 'seed:silverbeet': { ...zero, carbsG: 20 } }, true);
    expect(recipeDataProblems(raw, carbs)).toContainEqual({
      path: `${at('chicken-silverbeet-traybake')}.carbStyle`,
      rule: 'style',
    });
    // Only chicken thigh loaded: at least 10 g of saturated fat a serve, over the 8 g cap.
    const thigh = { ...zero, fatG: 10, saturatedFatG: 5 };
    const fat = withFigures(zero, { 'seed:chicken-thigh': thigh }, true);
    expect(recipeDataProblems(raw, fat)).toContainEqual({
      path: `${at('chicken-silverbeet-traybake')}.lines`,
      rule: 'cholesterol',
    });
  });

  it('U1 food safety: fresh fish is checked for bones; leftovers go in the fridge and reheat hot', () => {
    const seeds = shipped().seedById;
    const data = raw as unknown as Mutable;
    for (const r of data.recipes) {
      const method = r.method.join(' ');
      const freshFish = r.lines.some((l) => {
        const food = seeds.get(l.ingredientId);
        return food?.aisle === 'Meat and fish' && food.group.endsWith('fish');
      });
      if (freshFish) expect(method, r.id).toMatch(/\bbones\b/);
      if (/next day|tomorrow/.test(method)) expect(method, r.id).toMatch(/\bfridge\b/);
    }
    expect(recipe(data, 'beef-bean-pumpkin-chilli').method.join(' ')).toMatch(/steaming hot/);
  });

  it('U1 P43: only the two soups are not one-meal dishes', () => {
    const data = raw as unknown as Mutable;
    expect(data.recipes.filter((r) => !r.oneMealOk).map((r) => r.id)).toEqual([
      'seed:recipe-silverbeet-lemon-chicken-soup',
      'seed:recipe-red-lentil-silverbeet-soup',
    ]);
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
