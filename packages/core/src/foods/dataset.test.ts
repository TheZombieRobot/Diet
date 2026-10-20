// The validation script of checklist item 18 (`pnpm foods:check` runs this file): NU-01 on the
// shipped dataset, read from disk inside the test so a broken file fails with every problem listed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foods } from '../copy/health';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import { NUTRITION_SOURCES } from '../nutrition/confidence';
import { PRE_DATASET_CATALOGUE } from './names';
import { APPROVED_NUTRIENT_SOURCES } from './approval';
import { foodData, loadFoodData, seedViews } from './dataset';
import { exampleAttribution, exampleRelease } from './testData';
import type { FoodCatalogue } from './types';
import { validateFoodCatalogue, validateNutrientRelease } from './validate';
import { allSeedViews } from './view';

const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../data', name), 'utf8'));
const catalogueFile = read('ingredients.json');
const releaseFile = read('ingredient-nutrients.json');

describe('NU-01: the shipped ingredient dataset (validation script)', () => {
  it('NU-01 HS-37 R12: the catalogue and the release pass every rule; while nothing is approved every figure is not known', () => {
    expect(validateFoodCatalogue(catalogueFile)).toEqual([]);
    const catalogue = catalogueFile as FoodCatalogue;
    expect(
      validateNutrientRelease(releaseFile, catalogue, APPROVED_NUTRIENT_SOURCES, foods.attribution),
    ).toEqual([]);

    const data = foodData();
    if (data.status !== 'ok') throw new Error('the shipped catalogue did not load');
    expect(data.releaseStatus).toBe('ok');
    const views = allSeedViews(data);
    expect(views).toHaveLength(catalogue.foods.length);
    for (const view of views) {
      // Every figure is either listed as unknown (and 0, D35's convention) or has a source-tagged value.
      for (const key of NUTRIENT_KEYS) {
        expect(typeof view.nutrientsPer100g[key], `${view.id} ${key}`).toBe('number');
        const row = data.release.foods[view.id];
        if (view.unknownNutrients.includes(key)) expect(view.nutrientsPer100g[key]).toBe(0);
        else expect(row?.values[key]).toMatchObject({ source: row?.source });
      }
      expect(view.carbBasisAsEntered).toMatch(/^(available|total)$/);
      if (view.source === 'not-loaded') expect(view.sourceCitation).toBeNull();
      else {
        expect(APPROVED_NUTRIENT_SOURCES).toContain(view.source);
        expect(view.sourceCitation).not.toBeNull();
      }
    }
    if (APPROVED_NUTRIENT_SOURCES.length === 0) {
      expect(releaseFile).toEqual({ version: 1, sources: [], foods: {} });
      for (const view of views) {
        expect(view.source).toBe('not-loaded');
        expect(view.unknownNutrients).toEqual([...NUTRIENT_KEYS]);
      }
    }
    expect(Object.keys(foods.attribution).sort()).toEqual([...APPROVED_NUTRIENT_SOURCES].sort());
    expect(
      APPROVED_NUTRIENT_SOURCES.every((s) => (NUTRITION_SOURCES as readonly string[]).includes(s)),
    ).toBe(true);
  });

  it('CR21–CR26 storage section 6, owner request, G13: the shipped checks fail on a broken copy', () => {
    const catalogue = catalogueFile as FoodCatalogue;
    const without = (...ids: string[]) => ({
      ...catalogue,
      foods: catalogue.foods.filter((f) => !ids.includes(f.id)),
    });
    const rules = (raw: unknown) => validateFoodCatalogue(raw).map((p) => `${p.path} ${p.rule}`);
    expect(rules(without('seed:silverbeet'))).toContain('foods["seed:silverbeet"] required-food');
    expect(rules(without('seed:silken-tofu'))).toContain('foods["seed:silken-tofu"] required-food');
    expect(rules(without('seed:chilli-flakes'))).toContain(
      'foods["seed:chilli-flakes"] required-food',
    );
    const greens = catalogue.foods.filter((f) => f.group === 'leafy-green');
    const sevenGreens = without(...greens.slice(7).map((f) => f.id));
    expect(rules(sevenGreens)).toContain('foods leafy-greens');
    const sized = (n: number) => ({
      ...catalogue,
      foods: Array.from({ length: n }, (_, i) => catalogue.foods[i % catalogue.foods.length]),
    });
    expect(rules(sized(139))).toContain('foods count');
    expect(rules(sized(181))).toContain('foods count');
    const reserved = {
      ...catalogue,
      foods: catalogue.foods.map((f) =>
        f.id === 'seed:kale' ? { ...f, id: 'seed:example-x' } : f,
      ),
    };
    expect(rules(reserved)).toContain(
      `foods[${String(catalogue.foods.findIndex((f) => f.id === 'seed:kale'))}].id reserved-id`,
    );
    // Item 19's pre-dataset link still resolves.
    for (const entry of PRE_DATASET_CATALOGUE.entries)
      expect(catalogue.foods.map((f) => f.id)).toContain(entry.id);
  });

  it('N17 HS-37: a release that breaks a rule is not used at all; a broken catalogue is an error', () => {
    const catalogue = catalogueFile as FoodCatalogue;
    // A release from an unapproved source: every figure stays not known.
    const bad = loadFoodData(catalogue, exampleRelease('usda'), [], exampleAttribution);
    if (bad.status !== 'ok') throw new Error('the catalogue should load');
    expect(bad.releaseStatus).toBe('unreadable');
    expect(allSeedViews(bad).every((v) => v.source === 'not-loaded')).toBe(true);
    expect(loadFoodData({ version: 1 }, releaseFile, [], {})).toEqual({ status: 'error' });
    expect(foodData()).toBe(foodData());
    expect(Object.isFrozen(foodData())).toBe(true);
    expect(seedViews()).toBe(seedViews());
  });
});
