// The validation script of checklist item 18 (`pnpm foods:check` runs this file): NU-01 on the
// shipped dataset, read from disk inside the test so a broken file fails with every problem listed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foods } from '../copy/health';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import { NUTRITION_SOURCES } from '../nutrition/confidence';
import type { Allergen } from '../storage/allergens';
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

type Food = Record<string, unknown>;
/** A copy of a shipped food. */
const food = (id: string): Food => ({
  ...structuredClone((catalogueFile as FoodCatalogue).foods.find((f) => f.id === id)),
});

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
    // Nothing can approve a source at run time.
    expect(Object.isFrozen(APPROVED_NUTRIENT_SOURCES)).toBe(true);
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
    expect(rules(without('seed:hummus'))).toContain('foods["seed:hummus"] required-food');
    expect(rules(without('seed:kahawai'))).toContain('foods["seed:kahawai"] required-food');
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

  it.each<[string, string, Food, string]>([
    [
      'wraps regrouped as a grain without wheat',
      'wraps',
      { group: 'grain', allergens: [] },
      'allergens inherent-allergen',
    ],
    [
      'kahawai regrouped as red meat without fish',
      'kahawai',
      { group: 'red-meat', allergens: [] },
      'allergens inherent-allergen',
    ],
    [
      'sausages regrouped as red meat and marked complete',
      'sausages',
      { group: 'red-meat', allergensComplete: true },
      'allergensComplete allergens-complete',
    ],
    [
      'canned salmon moved to Meat and fish and marked complete',
      'canned-salmon',
      { aisle: 'Meat and fish', allergensComplete: true },
      'allergensComplete allergens-complete',
    ],
    [
      'olives moved to Produce and marked complete',
      'olives',
      { aisle: 'Produce', allergensComplete: true },
      'allergensComplete allergens-complete',
    ],
    [
      'curry paste without its shrimp paste',
      'curry-paste',
      { allergens: ['fish'] },
      'allergens inherent-allergen',
    ],
    [
      'a new food, Brazil nuts, as complete fresh fruit with no allergen',
      'brazil-nuts',
      { ...food('seed:apple'), id: 'seed:brazil-nuts', name: 'Brazil nuts', aliases: [] },
      'allergensComplete allergens-complete',
    ],
  ])('CR11 CR13 C43 HS-24: the shipped checks refuse %s', (_name, slug, changes, expected) => {
    const copy = structuredClone(catalogueFile) as { foods: Food[] };
    let index = copy.foods.findIndex((f) => f['id'] === `seed:${slug}`);
    if (index === -1) index = copy.foods.push({ ...changes, substitutes: [] }) - 1;
    else Object.assign(copy.foods[index] ?? {}, changes);
    expect(validateFoodCatalogue(copy).map((p) => `${p.path} ${p.rule}`)).toContain(
      `foods[${String(index)}].${expected}`,
    );
  });

  it('X1 HS-24: the ids item 20 uses (contract 1.1 and 1.2) ship uncooked, with their allergens and completeness', () => {
    const byId = new Map((catalogueFile as FoodCatalogue).foods.map((f) => [f.id, f]));
    const has = (slugs: string, allergens: Allergen[], complete: boolean) =>
      slugs.split(' ').map((slug) => ({ slug, allergens, complete }));
    const contract = [
      ...has('silverbeet spinach kale cos-lettuce salad-leaves bok-choy cabbage', [], true),
      ...has(
        'broccoli cauliflower courgette cucumber cherry-tomatoes capsicum green-beans ' +
          'spring-onion leek onion red-onion garlic ginger carrot mushrooms chilli',
        [],
        true,
      ),
      ...has('pumpkin potato avocado lemon parsley coriander', [], true),
      ...has('chicken-breast chicken-thigh beef-mince-lean', [], true),
      ...has('white-fish kahawai', ['fish'], true),
      ...has('eggs', ['egg'], true),
      ...has('milk trim-milk', ['milk'], true),
      ...has('greek-yoghurt feta', ['milk'], false),
      ...has('firm-tofu', ['soy'], false),
      ...has('tuna-in-water sardines canned-salmon', ['fish'], false),
      ...has('canned-tomatoes tomato-paste chickpeas kidney-beans olive-oil canola-oil', [], false),
      ...has('soy-sauce', ['soy', 'wheat'], false),
      ...has('brown-rice red-lentils frozen-peas frozen-berries', [], false),
      ...has('rolled-oats', ['oats'], false),
      ...has('almond-meal walnuts', ['tree-nut'], false),
      ...has(
        'sunflower-seeds pumpkin-seeds ground-cumin smoked-paprika ground-cinnamon ' +
          'dried-oregano black-pepper curry-powder',
        [],
        false,
      ),
    ];
    expect(contract).toHaveLength(65);
    for (const { slug, allergens, complete } of contract) {
      const seed = byId.get(`seed:${slug}`);
      expect(seed?.basis, slug).toMatch(/^(raw|as-sold)$/);
      expect(seed?.allergens, slug).toEqual(expect.arrayContaining(allergens));
      expect(seed?.allergensComplete, slug).toBe(complete);
    }
    expect(byId.get('seed:beef-mince-lean')).toMatchObject({
      name: 'Lean beef mince',
      group: 'red-meat',
    });
    for (const slug of 'fish-sauce salt liquid-stock coconut-oil coconut-cream bacon chicken-breast-cooked'.split(
      ' ',
    ))
      expect(byId.has(`seed:${slug}`), slug).toBe(true);
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
