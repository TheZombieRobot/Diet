// The recipes repository on real records (item 20 design 8.2, D1 to D8): FL-06, HS-24, C107,
// NU-10, D35. Real Dexie over fake-indexeddb. Every figure is synthetic: owner corrections with
// made-up figures make a copy storable, as no copy can be stored before food data is loaded.
import {
  NUTRIENT_KEYS,
  originAllergens,
  RECIPE_SNAPSHOT_ALL_UNKNOWN_STORABLE,
  type RecipeData,
  recipeAllergenView,
  recipeData,
  type RecipeRecord,
  type SeedRecipe,
  type UserAllergen,
  validateRow,
} from '@diet/core';
import { fixtureFoods, overrideFiguresFor } from '@diet/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageRuleError } from './errors';
import type { RecipeInput } from './repos/recipes';
import { replaceAll } from './snapshot';
import { backupSnapshot, onboardForTests, openTestDb, seedPlanDay, type TestDb } from './testKit';

let test: TestDb | undefined;
afterEach(() => {
  test?.db.shutDown();
  test = undefined;
});

const data = (): RecipeData => {
  const result = recipeData();
  if (result.status !== 'ok') throw new Error('The recipes did not load');
  return result.data;
};
const seed = (slug: string): SeedRecipe => {
  const found = data().recipes.find((r) => r.id === `seed:recipe-${slug}`);
  if (found === undefined) throw new Error(slug);
  return found;
};
/** A dataset line as a stored line (no swaps, no leftover mark). */
const stored = (l: SeedRecipe['lines'][number]) => ({
  ingredientId: l.ingredientId,
  rawG: l.rawG,
  cookedG: l.cookedG,
  displayAs: l.displayAs,
});
const lineIndex = (r: SeedRecipe, ingredientId: string) =>
  r.lines.findIndex((l) => l.ingredientId === ingredientId);

/** A finished setup with these allergens, and synthetic figures for these seeds. */
async function open(
  options: {
    readonly allergens?: UserAllergen[];
    readonly glutenFreeHousehold?: boolean;
    readonly figuresFor?: readonly string[];
  } = {},
): Promise<TestDb> {
  test = await openTestDb();
  await onboardForTests(test, {
    profile: {
      allergens: options.allergens ?? [],
      glutenFreeHousehold: options.glutenFreeHousehold ?? false,
    },
  });
  for (const { seedId, changes } of overrideFiguresFor([...new Set(options.figuresFor ?? [])]))
    await test.repos.ingredientOverrides.create({ seedId, changes });
  return test;
}
const idsOf = (r: SeedRecipe, ...more: string[]) => [
  ...r.lines.map((l) => l.ingredientId),
  ...more,
];
const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => 'written',
    (error: unknown) => (error instanceof StorageRuleError ? error.rule : String(error)),
  );

/** An owner recipe row's figures part, valid under version 1 (some figures unknown, not all). */
const snapshotOf = (lines: number) => ({
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
  unknownNutrients: ['fibreG' as const],
  confidence: 'estimate' as const,
  sourceMix: { label: 0, 'nz-fcdb': 0, usda: 0, estimate: lines },
});

describe('the recipes repository (item 20)', () => {
  it('D1 FL-06 HS-24: a swap saves one copy of a seed that keeps its allergens; later swaps update it', async () => {
    const frittata = seed('silverbeet-feta-frittata');
    const t = await open({ figuresFor: idsOf(frittata, 'seed:leek', 'seed:spinach') });
    const onion = lineIndex(frittata, 'seed:spring-onion');
    const first = await t.repos.recipes.swapLine({
      recipeId: frittata.id,
      lineIndex: onion,
      ingredientId: 'seed:leek',
    });
    expect(first.created).toBe(true);
    expect(first.record).toMatchObject({ derivedFromRecipeId: frittata.id, unknownNutrients: [] });
    expect(first.record.id).not.toBe(frittata.id);
    expect(first.record.lines[onion]).toEqual({
      ingredientId: 'seed:leek',
      rawG: 50,
      cookedG: null,
      displayAs: null,
    });
    expect(first.record.allergens).toEqual(expect.arrayContaining(['milk', 'egg']));
    expect(() => validateRow('recipes', first.record)).not.toThrow();
    // One copy per seed.
    expect(
      await refusal(
        t.repos.recipes.swapLine({
          recipeId: frittata.id,
          lineIndex: onion,
          ingredientId: 'seed:leek',
        }),
      ),
    ).toBe('recipe-copy-exists');
    expect(await t.repos.recipes.list()).toHaveLength(1);
    const greens = lineIndex(frittata, 'seed:silverbeet');
    const second = await t.repos.recipes.swapLine({
      recipeId: first.record.id,
      lineIndex: greens,
      ingredientId: 'seed:spinach',
    });
    expect(second.created).toBe(false);
    expect(second.record.allergens).toEqual(expect.arrayContaining(first.record.allergens));
  });

  it('D2 NU-10 HS-39: with one ingredient not loaded, no copy is stored', async () => {
    const frittata = seed('silverbeet-feta-frittata');
    const t = await open({
      figuresFor: idsOf(frittata, 'seed:leek').filter((id) => id !== 'seed:black-pepper'),
    });
    const onion = lineIndex(frittata, 'seed:spring-onion');
    expect(
      await refusal(
        t.repos.recipes.swapLine({
          recipeId: frittata.id,
          lineIndex: onion,
          ingredientId: 'seed:leek',
        }),
      ),
    ).toBe('recipe-figures-unknown');
    expect(await t.repos.recipes.list()).toEqual([]);
  });

  it('D3 HS-24 C107: a swap the owner is not offered is refused, whoever asks', async () => {
    const traybake = seed('chicken-silverbeet-traybake');
    const patties = seed('salmon-silverbeet-patties');
    const all = [...idsOf(traybake, 'seed:firm-tofu'), ...idsOf(patties, 'seed:tuna-in-water')];
    let t = await open({ allergens: ['soy'], figuresFor: all });
    expect(
      await refusal(
        t.repos.recipes.swapLine({
          recipeId: traybake.id,
          lineIndex: lineIndex(traybake, 'seed:chicken-thigh'),
          ingredientId: 'seed:firm-tofu',
        }),
      ),
    ).toBe('recipe-swap-not-allowed');
    t.db.shutDown();
    t = await open({ allergens: ['fish'], figuresFor: all });
    expect(
      await refusal(
        t.repos.recipes.swapLine({
          recipeId: patties.id,
          lineIndex: lineIndex(patties, 'seed:canned-salmon'),
          ingredientId: 'seed:tuna-in-water',
        }),
      ),
    ).toBe('recipe-swap-not-allowed');
    // A gluten-free swap (soy sauce to salt, offered through a correction) with the toggle off.
    t.db.shutDown();
    t = await open({ allergens: ['gluten'] });
    await t.repos.ingredientOverrides.create({
      seedId: 'seed:soy-sauce',
      changes: [{ field: 'substitutes', value: ['seed:salt'] }],
    });
    const cups = seed('ginger-beef-lettuce-cups');
    expect(
      await refusal(
        t.repos.recipes.swapLine({
          recipeId: cups.id,
          lineIndex: lineIndex(cups, 'seed:soy-sauce'),
          ingredientId: 'seed:salt',
        }),
      ),
    ).toBe('recipe-swap-not-allowed');
    expect(await t.repos.recipes.list()).toEqual([]);
  });

  it('D4 HS-24: a create, an update or a new correction never loses an allergen; an origin cannot change', async () => {
    const patties = seed('salmon-silverbeet-patties');
    const t = await open({ figuresFor: idsOf(patties) });
    const eggLine = { ingredientId: 'seed:eggs', rawG: 100, cookedG: 100, displayAs: null };
    const created = await t.repos.recipes.create({
      title: 'Example eggs',
      serves: 1,
      timeMinutes: null,
      lines: [eggLine],
      method: [],
      tags: [],
      allergens: ['lupin'],
      derivedFromRecipeId: null,
    });
    expect(created.allergens).toEqual(['egg', 'lupin']);
    // Lupin is only in the stored list: an update that empties the list keeps it.
    expect((await t.repos.recipes.update(created.id, { allergens: [] })).allergens).toEqual([
      'egg',
      'lupin',
    ]);
    // A copy of the patties without its almond meal still lists tree nuts.
    const lines = patties.lines.filter((l) => l.ingredientId !== 'seed:almond-meal').map(stored);
    const copy = await t.repos.recipes.create({
      title: 'Example patties',
      serves: 4,
      timeMinutes: 30,
      lines,
      method: [],
      tags: [],
      allergens: [],
      derivedFromRecipeId: patties.id,
    });
    expect(copy.allergens).toEqual(['tree-nut', 'egg', 'fish']);
    expect(await refusal(t.repos.recipes.update(copy.id, { derivedFromRecipeId: null }))).toBe(
      'recipe-origin-fixed',
    );
    // A correction adds sesame to eggs after the save: the next title-only update adds it.
    const eggs = await t.repos.ingredientOverrides.get('seed:eggs');
    await t.repos.ingredientOverrides.update('seed:eggs', {
      changes: [...(eggs?.changes ?? []), { field: 'addAllergens', value: ['sesame'] }],
    });
    expect(
      (await t.repos.recipes.update(created.id, { title: 'Example eggs, again' })).allergens,
    ).toEqual(['egg', 'sesame', 'lupin']);
  });

  it('D5 P17: a copy in the meal plan is not removed; removing twice is not an error', async () => {
    const t = await open({ figuresFor: ['seed:eggs'] });
    const row = await t.repos.recipes.create({
      title: 'Example',
      serves: 1,
      timeMinutes: null,
      lines: [{ ingredientId: 'seed:eggs', rawG: 100, cookedG: 100, displayAs: null }],
      method: [],
      tags: [],
      allergens: ['egg'],
      derivedFromRecipeId: null,
    });
    await seedPlanDay(t, {
      date: '2000-03-02',
      dietMode: 'keto',
      meals: [{ slot: 'dinner', recipeId: row.id, myServes: 1, householdServes: 1 }],
      eatingWindow: null,
    });
    expect(await refusal(t.repos.recipes.removeCopy(row.id))).toBe('recipe-in-plan');
    expect(await refusal(t.repos.recipes.remove(row.id))).toBe('recipe-in-plan');
    await t.repos.planDays.remove('2000-03-02');
    await t.repos.recipes.removeCopy(row.id);
    await t.repos.recipes.removeCopy(row.id);
    expect(await t.repos.recipes.list()).toEqual([]);
  });

  it('D6: one read holds own foods, corrections, copies, garden links, the profile’s allergens, hidden seeds and planned ids', async () => {
    const t = await open({ allergens: ['peanut'], figuresFor: ['seed:eggs'] });
    // Silverbeet is seeded with the database, and item 19 refuses a second row for one crop (G17).
    await t.repos.garden.create({
      ingredientId: 'seed:spinach',
      name: 'Spinach',
      amount: null,
      unit: null,
      gramsPerUnit: null,
      harvestReady: false,
      harvestedAt: null,
      perishabilityDays: null,
    });
    const rows = await t.repos.recipes.context();
    expect(rows.overrides.map((o) => o.seedId)).toEqual(['seed:eggs']);
    expect(rows.gardenIngredientIds).toEqual(
      expect.arrayContaining(['seed:silverbeet', 'seed:spinach']),
    );
    expect(rows.profile).toEqual({
      allergens: ['peanut'],
      dislikeIngredientIds: [],
      dislikeTerms: [],
      glutenFreeHousehold: false,
    });
    expect([rows.own, rows.recipes, rows.hiddenSeedIds, rows.plannedRecipeIds]).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });

  it('D7: RECIPE_SNAPSHOT_ALL_UNKNOWN_STORABLE says whether the schema stores a recipe with all eight unknown', () => {
    const row = {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Example',
      serves: 1,
      timeMinutes: null,
      lines: [{ ingredientId: 'seed:eggs', rawG: 100, cookedG: null, displayAs: null }],
      method: [],
      tags: [],
      allergens: ['egg'],
      derivedFromRecipeId: null,
      ...snapshotOf(1),
      unknownNutrients: [...NUTRIENT_KEYS],
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };
    const storable = (() => {
      try {
        validateRow('recipes', row);
        return true;
      } catch {
        return false;
      }
    })();
    expect(RECIPE_SNAPSHOT_ALL_UNKNOWN_STORABLE).toBe(storable);
  });

  it('D8 HS-24 HS-15: a restored copy keeps its rows as saved; the view and the next write keep its allergens', async () => {
    const patties = seed('salmon-silverbeet-patties');
    const t = await open({ figuresFor: idsOf(patties, 'seed:sunflower-seeds') });
    const almond = lineIndex(patties, 'seed:almond-meal');
    const lines = patties.lines
      .map(stored)
      .map((l, i) => (i === almond ? { ...l, ingredientId: 'seed:sunflower-seeds' } : l));
    const copy: RecipeRecord = {
      id: '00000000-0000-4000-8000-0000000000f1',
      title: 'Example patties',
      serves: 4,
      timeMinutes: 30,
      lines,
      method: [],
      tags: [],
      allergens: [],
      derivedFromRecipeId: patties.id,
      ...snapshotOf(lines.length),
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };
    const snapshot = await backupSnapshot(t.db);
    await replaceAll(t.db, { ...snapshot, recipes: [copy] });
    const restored = await t.repos.recipes.get(copy.id);
    expect(restored).toEqual(copy);
    const foods = fixtureFoods({ notLoaded: 'all' });
    const view = recipeAllergenView(
      copy,
      foods,
      originAllergens(copy.derivedFromRecipeId, data(), new Map(), foods),
    );
    expect(view.facts.allergens).toEqual(['tree-nut', 'egg', 'fish']);
    expect(
      (await t.repos.recipes.update(copy.id, { title: 'Example patties, again' })).allergens,
    ).toEqual(['tree-nut', 'egg', 'fish']);
  });

  it('D8b HS-24: a swap on a restored copy whose stored list is empty keeps its origin’s allergens', async () => {
    const patties = seed('salmon-silverbeet-patties');
    const t = await open({ figuresFor: idsOf(patties, 'seed:sunflower-seeds', 'seed:spinach') });
    const almond = lineIndex(patties, 'seed:almond-meal');
    const lines = patties.lines
      .map(stored)
      .map((l, i) => (i === almond ? { ...l, ingredientId: 'seed:sunflower-seeds' } : l));
    const copy: RecipeRecord = {
      id: '00000000-0000-4000-8000-0000000000f2',
      title: 'Example patties',
      serves: 4,
      timeMinutes: 30,
      lines,
      method: [],
      tags: [],
      allergens: [],
      derivedFromRecipeId: patties.id,
      ...snapshotOf(lines.length),
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };
    await replaceAll(t.db, { ...(await backupSnapshot(t.db)), recipes: [copy] });
    const { record, created } = await t.repos.recipes.swapLine({
      recipeId: copy.id,
      lineIndex: lineIndex(patties, 'seed:silverbeet'),
      ingredientId: 'seed:spinach',
    });
    expect(created).toBe(false);
    expect(record.allergens).toEqual(['tree-nut', 'egg', 'fish']);
  });

  it('D9 HS-39: create and update store the figures worked out from the lines, never the caller’s', async () => {
    const t = await open({ figuresFor: ['seed:eggs'] });
    const eggs = (rawG: number) => ({
      ingredientId: 'seed:eggs',
      rawG,
      cookedG: rawG,
      displayAs: null,
    });
    // A caller that claims figures anyway (plain JavaScript, or a cast) is ignored.
    const claimed = {
      title: 'Example eggs',
      serves: 1,
      timeMinutes: null,
      lines: [eggs(100)],
      method: [],
      tags: [],
      allergens: ['egg'],
      derivedFromRecipeId: null,
      nutritionPerServe: { ...snapshotOf(1).nutritionPerServe, energyKj: 2500, proteinG: 40 },
      unknownNutrients: [],
      confidence: 'database',
      sourceMix: { label: 0, 'nz-fcdb': 1, usda: 0, estimate: 0 },
    } as unknown as RecipeInput;
    const row = await t.repos.recipes.create(claimed);
    // 100 g of eggs at the synthetic 1,000 kJ and 10 g of protein per 100 g, from an estimate.
    expect(row).toMatchObject({
      nutritionPerServe: { energyKj: 1000, proteinG: 10 },
      unknownNutrients: [],
      confidence: 'estimate',
      sourceMix: { label: 0, 'nz-fcdb': 0, usda: 0, estimate: 1 },
    });
    // An update that changes the lines works them out again.
    const doubled = await t.repos.recipes.update(row.id, { lines: [eggs(200)] });
    expect(doubled.nutritionPerServe).toMatchObject({ energyKj: 2000, proteinG: 20 });
    // A line with no figures: nothing is stored, as the schema cannot hold all eight unknown.
    const before = await t.repos.recipes.list();
    const leek = { ingredientId: 'seed:leek', rawG: 50, cookedG: null, displayAs: null };
    expect(await refusal(t.repos.recipes.create({ ...claimed, lines: [leek] }))).toBe(
      'recipe-figures-unknown',
    );
    expect(await refusal(t.repos.recipes.update(row.id, { lines: [leek] }))).toBe(
      'recipe-figures-unknown',
    );
    expect(await t.repos.recipes.list()).toEqual(before);
  });
});
