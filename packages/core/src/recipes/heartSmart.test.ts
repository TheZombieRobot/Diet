import { describe, expect, it } from 'vitest';
import { foodData } from '../foods/dataset';
import { heartRoleOf } from '../foods/heart';
import type { Nutrients } from '../nutrition/nutrients';
import type { NutrientKey } from '../storage/records';
import { recipeData } from './dataset';
import { FLAG_REASONS, type LineKind, lineKindOf } from './foodKind';
import {
  cholesterolScore,
  eggsPerServe,
  favouredKeys,
  heartSmart,
  heartSmartInput,
} from './heartSmart';
import { recipeNutrition } from './nutrition';
import { exampleOwnFood, fixtureFoods, nu04Fixtures, SYNTHETIC_PER_100G } from './testData';
import type { SeedRecipe } from './types';

const foods = fixtureFoods();
const kind = (id: string): LineKind => lineKindOf(id, foods);
const recipe = (id: string): SeedRecipe => {
  const result = recipeData();
  const found =
    result.status === 'ok'
      ? result.data.recipes.find((r) => r.id === `seed:recipe-${id}`)
      : undefined;
  if (found === undefined) throw new Error(id);
  return found;
};

const perServe = (fatG: number, saturatedFatG: number): Nutrients => ({
  ...SYNTHETIC_PER_100G,
  fatG,
  saturatedFatG,
});
const heart = (
  fatG: number,
  satG: number,
  options: {
    readonly unknown?: readonly NutrientKey[];
    readonly myServes?: number;
    readonly budget?: number | null;
    readonly cheesePerServe?: number;
    readonly lines?: readonly { kind: LineKind; rawGPerServe: number }[];
  } = {},
) =>
  heartSmart({
    perServe: perServe(fatG, satG),
    unknownNutrients: options.unknown ?? [],
    myServes: options.myServes ?? 1,
    lines: options.lines ?? [
      { kind: kind('seed:chicken-breast'), rawGPerServe: 100 },
      ...(options.cheesePerServe === undefined
        ? []
        : [{ kind: kind('seed:feta'), rawGPerServe: options.cheesePerServe }]),
    ],
    satFatBudgetG: options.budget ?? null,
  });

describe('heart-smart and the saturated-fat flag (item 20)', () => {
  it('U6 NU-04: the avocado salad is heart-smart; the bacon and cream carbonara is flagged for four reasons', () => {
    const { own, avocadoSalad, carbonara } = nu04Fixtures();
    const ownFoods = fixtureFoods({ own });
    const of = (r: typeof avocadoSalad) =>
      heartSmart(heartSmartInput(recipeNutrition(r, ownFoods), r.serves, r.lines));
    expect(of(avocadoSalad)).toEqual({ kind: 'heart-smart', capG: 8 });
    expect(of(carbonara)).toEqual({
      kind: 'flagged',
      reasons: ['butter-cream', 'processed-meat', 'cheese-over-40g', 'saturated-fat-high'],
      capG: 8,
    });
  });

  it('U6 NU-04 C70: the boundaries compare strictly (P38)', () => {
    expect(heart(8, 2).kind).toBe('heart-smart');
    expect(heart(8, 2.01).kind).toBe('neither');
    expect(heart(40, 8).kind).toBe('heart-smart');
    expect(heart(40, 8.01)).toEqual({ kind: 'flagged', reasons: ['saturated-fat-high'], capG: 8 });
    expect(heart(40, 4, { budget: 12 }).kind).toBe('heart-smart');
    expect(heart(40, 4.01, { budget: 12 }).kind).toBe('flagged');
    expect(heart(40, 4.3, { budget: 13 }).kind).toBe('heart-smart');
    expect(heart(40, 4.4, { budget: 13 }).kind).toBe('flagged');
    expect(heart(8, 1, { cheesePerServe: 40 }).kind).toBe('heart-smart');
    expect(heart(8, 1, { cheesePerServe: 40.5 }).kind).toBe('flagged');
    expect(heart(8, 0.5, { cheesePerServe: 20, myServes: 2 }).kind).toBe('heart-smart');
    expect(heart(8, 0.5, { cheesePerServe: 20.5, myServes: 2 }).kind).toBe('flagged');
    expect(heart(8, 0.5, { cheesePerServe: 20, myServes: 3 }).kind).toBe('flagged');
    // A budget that is not a positive number uses the 24 g reference; a larger one is capped by it.
    for (const budget of [0, -1, Number.NaN, 30]) expect(heart(8, 1, { budget }).capG).toBe(8);
  });

  it('U7 HS-39: a figure any ingredient lacks never makes a recipe heart-smart; a lower bound over the cap flags', () => {
    expect(heart(8, 1, { unknown: ['fatG'] }).kind).toBe('unknown');
    expect(heart(8, 1, { unknown: ['saturatedFatG'] }).kind).toBe('unknown');
    expect(heart(40, 9, { unknown: ['saturatedFatG'] }).kind).toBe('flagged');
    const unresolved = lineKindOf('seed:not-in-the-app', foods);
    expect(heart(8, 1, { lines: [{ kind: unresolved, rawGPerServe: 100 }] }).kind).toBe('unknown');
    // Shipped: nothing is loaded, so no seed recipe is heart-smart.
    const shipped = fixtureFoods({ notLoaded: 'all' });
    const result = recipeData();
    for (const r of result.status === 'ok' ? result.data.recipes : []) {
      const h = heartSmart(heartSmartInput(recipeNutrition(r, shipped), r.serves, r.lines));
      expect(h.kind, r.id).toBe('unknown');
    }
  });

  it('U18 NU-04: the cholesterol-conscious score, favoured kinds and eggs (P10, P33, P37)', () => {
    const smart = { kind: 'heart-smart', capG: 8 } as const;
    const keys = (count: number) =>
      (['olive-oil', 'avocado', 'leafy-green', 'poultry', 'egg'] as const).slice(0, count);
    expect(cholesterolScore(smart, keys(3))).toBe(5);
    expect(cholesterolScore(smart, keys(5))).toBe(5);
    expect(cholesterolScore({ kind: 'unknown', capG: 8 }, keys(2))).toBe(1);
    expect(cholesterolScore({ kind: 'neither', capG: 8 }, [])).toBe(0);
    expect(
      cholesterolScore(
        { kind: 'flagged', reasons: ['butter-cream', 'fatty-cut'], capG: 8 },
        keys(1),
      ),
    ).toBe(-5);
    const legume = (rawG: number) => {
      const lines = [{ ingredientId: 'seed:chickpeas', rawG, cookedG: rawG, displayAs: null }];
      return favouredKeys(recipeNutrition({ serves: 1, lines }, foods), 1, lines);
    };
    expect(legume(60)).toEqual(['legume']);
    expect(legume(60.5)).toEqual([]);
    const fishSalad = recipe('tuna-egg-green-bean-salad');
    const fish = favouredKeys(recipeNutrition(fishSalad, foods), fishSalad.serves, fishSalad.lines);
    expect(fish).toEqual(expect.arrayContaining(['olive-oil', 'egg', 'leafy-green']));
    expect(fish).not.toContain('lean-fish');
    const eggs = (id: string) => {
      const r = recipe(id);
      return eggsPerServe(
        r.lines,
        r.lines.map((l) => kind(l.ingredientId)),
        r.serves,
      );
    };
    expect(eggs('silverbeet-feta-frittata')).toBe(2);
    expect(eggs('salmon-silverbeet-patties')).toBe(0.5);
    expect(eggs('snack-silverbeet-egg-muffins')).toBeCloseTo(4 / 3, 9);
    expect(eggs('chicken-egg-cauliflower-fried-rice')).toBe(0.75);
    const result = recipeData();
    const week = result.status === 'ok' ? result.data.ketoFirstWeek : { dinners: [], snacks: [] };
    const total = [...week.dinners, ...week.snacks].reduce(
      (sum, id) => sum + eggs(id.replace('seed:recipe-', '')),
      0,
    );
    expect(total).toBeCloseTo(5.83, 2);
    expect(total).toBeLessThanOrEqual(6);
  });
});

describe('food kinds (item 20)', () => {
  it('U9: every catalogue food that flags has a reason, and every favoured one a key', () => {
    const data = foodData();
    if (data.status !== 'ok') throw new Error('The catalogue did not load');
    for (const food of data.catalogue.foods) {
      const k = kind(food.id);
      const role = heartRoleOf(food);
      expect(k.role, food.id).toEqual(role);
      if (role.kind === 'flag') expect(FLAG_REASONS, food.id).toContain(k.flag);
      if (role.kind === 'favour') expect(k.favour, food.id).not.toBeNull();
    }
    expect(kind('seed:feta').flag).toBe('cheese-over-40g');
    expect(kind('seed:beef-mince').flag).toBe('fatty-cut');
    expect(kind('seed:firm-tofu')).toMatchObject({ role: { kind: 'neutral' }, proteinFood: true });
    expect(kind('seed:tuna-in-water').role.kind).toBe('neutral');
    expect(kind('seed:sardines').favour).toBe('oily-fish');
    expect(kind('seed:not-in-the-app').origin).toBe('unresolved');
  });

  it('U9: the owner’s own foods flag by whole-word keywords, never clear', () => {
    const own = (name: string) => {
      const food = exampleOwnFood('00000000-0000-4000-8000-0000000000c1', name, SYNTHETIC_PER_100G);
      return lineKindOf(food.id, fixtureFoods({ own: [food] })).flag;
    };
    expect(own('Peanut butter')).toBeNull();
    expect(own('Cashew nut butter')).toBeNull();
    expect(own('Cream cheese')).toBe('butter-cream');
    expect(own('Example streaky bacon')).toBe('processed-meat');
    expect(own('Pork belly')).toBe('fatty-cut');
    expect(own('Coconut milk')).toBe('coconut-fat');
    expect(own('Haloumi')).toBe('cheese-over-40g');
    expect(own('Butternut')).toBeNull();
    expect(own('Hamburger buns')).toBeNull();
  });
});
