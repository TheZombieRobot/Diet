import { describe, expect, it } from 'vitest';
import { seedViews } from '../foods/dataset';
import { seedViewFixture } from '../foods/testData';
import { allergenWarning, expandUserAllergens } from './allergens';
import {
  effectiveAllergens,
  effectiveIngredient,
  foodAllergenFacts,
  ingredientResolver,
  recipeAllergens,
  viewOfOwnIngredient,
} from './overrides';
import type { IngredientChange, IngredientOverrideRecord, IngredientRecord } from './records';

const T = '2000-01-01T00:00:00.000Z';
const nutrients = {
  energyKj: 100,
  proteinG: 1,
  fatG: 1,
  saturatedFatG: 0,
  carbsG: 1,
  sugarsG: 1,
  fibreG: 1,
  sodiumMg: 1,
};

function seed(id: string, patch: Partial<IngredientRecord> = {}): IngredientRecord {
  return {
    id,
    name: 'Example seed food',
    aliases: [],
    aisle: 'Produce',
    packSizesG: [200],
    packSizeSource: 'typical',
    packSizeEnteredAt: null,
    nutrientsPer100g: nutrients,
    unknownNutrients: [],
    carbBasisAsEntered: 'available',
    nutrientBasis: 'raw',
    cookedYield: null,
    yieldCitation: null,
    source: 'nz-fcdb',
    sourceCitation: 'Example database entry',
    allergens: ['milk'],
    gardenFlag: false,
    seasonMonths: [],
    substitutes: [],
    gramsPerEach: null,
    servingSizeG: null,
    createdAt: T,
    updatedAt: T,
    ...patch,
  };
}

/** A seed as every reader sees it (item 18): its list, when known, is complete. */
const seedView = (id: string, patch: Partial<IngredientRecord> = {}) =>
  viewOfOwnIngredient(seed(id, patch));

const override = (seedId: string, changes: IngredientChange[]): IngredientOverrideRecord => ({
  seedId,
  changes,
  createdAt: T,
  updatedAt: T,
});

describe('seed corrections merged at read time (section 4.7; D2; section 16 test 9)', () => {
  it('applies each change kind over the current seed', () => {
    const changed = effectiveIngredient(
      seedView('seed:example-food'),
      override('seed:example-food', [
        { field: 'name', value: 'Corrected name' },
        { field: 'aliases', value: ['Alias'] },
        { field: 'aisle', value: 'Chilled' },
        { field: 'packSizes', value: { packSizesG: [250, 500], enteredAt: T } },
        {
          field: 'nutrition',
          value: {
            nutrientsPer100g: { ...nutrients, fibreG: 0 },
            unknownNutrients: ['fibreG'],
            carbBasisAsEntered: 'total',
            nutrientBasis: 'as-sold',
            source: 'label',
            sourceCitation: null,
          },
        },
        { field: 'addAllergens', value: ['egg'] },
        { field: 'substitutes', value: ['seed:other-food'] },
        { field: 'gramsPerEach', value: 50 },
        { field: 'servingSizeG', value: 30 },
        { field: 'seasonMonths', value: [1, 2] },
        { field: 'gardenFlag', value: true },
      ]),
    );
    expect(changed).toMatchObject({
      name: 'Corrected name',
      aliases: ['Alias'],
      aisle: 'Chilled',
      packSizesG: [250, 500],
      packSizeSource: 'owner',
      packSizeEnteredAt: T,
      unknownNutrients: ['fibreG'],
      carbBasisAsEntered: 'total',
      nutrientBasis: 'as-sold',
      source: 'label',
      sourceCitation: null,
      allergensIfComplete: ['milk', 'egg'],
      allergensAtLeast: ['milk', 'egg'],
      substitutes: ['seed:other-food'],
      gramsPerEach: 50,
      servingSizeG: 30,
      seasonMonths: [1, 2],
      gardenFlag: true,
    });
    expect(effectiveIngredient(seedView('seed:example-food'), null)).toEqual(
      seedView('seed:example-food'),
    );
    expect(() =>
      effectiveIngredient(seedView('seed:example-food'), override('seed:other-food', [])),
    ).toThrow(RangeError);
  });

  it('C43: a seed that gains tree-nut in a later dataset still warns, though the override changed only its pack size', () => {
    const correction = override('seed:example-food', [
      { field: 'packSizes', value: { packSizesG: [300], enteredAt: T } },
    ]);
    const updatedSeed = seedView('seed:example-food', {
      allergens: ['milk', 'tree-nut'],
      name: 'Fixed in a later dataset',
    });
    const effective = effectiveIngredient(updatedSeed, correction);
    expect(effective.allergensIfComplete).toEqual(['milk', 'tree-nut']);
    expect(effective.name).toBe('Fixed in a later dataset');
    expect(allergenWarning(['tree-nut'], foodAllergenFacts(effective))).toEqual({
      conflicts: ['tree-nut'],
      unknown: false,
      warn: true,
    });
  });

  it('allergens can only be added: the union of seed and override, and null on either side is unknown', () => {
    expect(effectiveAllergens(['milk'], ['egg', 'milk'])).toEqual(['milk', 'egg']);
    expect(effectiveAllergens(['milk'], null)).toBeNull();
    expect(effectiveAllergens(null, ['egg'])).toBeNull();
    const unknown = effectiveIngredient(
      seedView('seed:example-food'),
      override('seed:example-food', [{ field: 'addAllergens', value: null }]),
    );
    expect(unknown.allergensIfComplete).toBeNull();
    // What it is known to contain stays known, so a listed milk allergy still conflicts.
    expect(unknown.allergensAtLeast).toEqual(['milk']);
    expect(allergenWarning(['peanut'], { allergens: [], allergensUnknown: true }).warn).toBe(true);
    expect(allergenWarning([], { allergens: [], allergensUnknown: true }).warn).toBe(false);
  });

  it('an override whose seed is no longer in the dataset is kept but ignored', () => {
    const resolve = ingredientResolver(
      [seedView('seed:kept')],
      [override('seed:removed', [{ field: 'name', value: 'Orphan' }])],
      [],
    );
    expect(resolve('seed:removed')).toBeNull();
    expect(resolve('seed:kept')?.name).toBe('Example seed food');
  });

  it('recipe allergens: the stored list plus every line’s current allergens; an unresolved line makes them unknown', () => {
    const own = seed('00000000-0000-4000-8000-000000000001', { allergens: ['sesame'] });
    const resolve = ingredientResolver(
      [seedView('seed:example-food', { allergens: ['milk', 'tree-nut'] })],
      [],
      [own],
    );
    const lines = [
      { ingredientId: 'seed:example-food', rawG: 100, cookedG: null, displayAs: null },
      { ingredientId: own.id, rawG: 10, cookedG: null, displayAs: null },
    ];
    expect(recipeAllergens({ allergens: ['egg'], lines }, resolve)).toEqual({
      allergens: ['tree-nut', 'milk', 'egg', 'sesame'],
      allergensUnknown: false,
    });
    const withMissing = [
      ...lines,
      { ingredientId: 'seed:deleted-food', rawG: 5, cookedG: null, displayAs: null },
    ];
    expect(recipeAllergens({ allergens: [], lines: withMissing }, resolve).allergensUnknown).toBe(
      true,
    );
    const unknownLine = ingredientResolver(
      [seedView('seed:example-food', { allergens: null })],
      [],
      [],
    );
    expect(
      recipeAllergens({ allergens: [], lines: lines.slice(0, 1) }, unknownLine).allergensUnknown,
    ).toBe(true);
  });
});

describe('seed views: allergens never lost, figures only from a source (item 18 F10; HS-24, C43, C107)', () => {
  const shipped = (id: string) => {
    const view = seedViews().find((v) => v.id === id);
    if (view === undefined) throw new Error(`${id} is not shipped`);
    return view;
  };

  it('an added allergen on a brand-dependent seed joins what it is known to contain; the list stays not complete', () => {
    const tuna = effectiveIngredient(
      shipped('seed:tuna-in-water'),
      override('seed:tuna-in-water', [{ field: 'addAllergens', value: ['sesame'] }]),
    );
    expect(tuna.allergensIfComplete).toBeNull();
    expect(tuna.allergensAtLeast).toEqual(['fish', 'sesame']);
  });

  it('an owner nutrition correction gives a not-loaded seed figures with their own source', () => {
    // A synthetic seed: no made-up figure is ever attached to a real food.
    const notLoaded = seedViewFixture();
    const corrected = effectiveIngredient(
      notLoaded,
      override(notLoaded.id, [
        {
          field: 'nutrition',
          value: {
            nutrientsPer100g: nutrients,
            unknownNutrients: ['fibreG'],
            carbBasisAsEntered: 'available',
            nutrientBasis: 'raw',
            source: 'label',
            sourceCitation: null,
          },
        },
      ]),
    );
    expect(notLoaded.source).toBe('not-loaded');
    expect(corrected).toMatchObject({ source: 'label', unknownNutrients: ['fibreG'] });
    expect(corrected.nutrientsPer100g).toEqual(nutrients);
  });

  it('a recipe line on a brand-dependent fish food reports fish and unknown; peanut butter conflicts for a peanut-listing owner', () => {
    const resolve = ingredientResolver(seedViews(), [], []);
    const line = { ingredientId: 'seed:tuna-in-water', rawG: 95, cookedG: null, displayAs: null };
    expect(recipeAllergens({ allergens: [], lines: [line] }, resolve)).toEqual({
      allergens: ['fish'],
      allergensUnknown: true,
    });
    const peanutButter = foodAllergenFacts(shipped('seed:peanut-butter'));
    expect(peanutButter).toEqual({ allergens: ['peanut'], allergensUnknown: true });
    expect(allergenWarning(['peanut'], peanutButter).conflicts).toEqual(['peanut']);
  });
});

describe('allergens (C43; D34)', () => {
  it("'gluten' blocks wheat, barley, oats and rye; 'wheat' blocks wheat only", () => {
    expect(expandUserAllergens(['gluten'])).toEqual(['wheat', 'barley', 'oats', 'rye']);
    expect(expandUserAllergens(['wheat'])).toEqual(['wheat']);
    expect(expandUserAllergens(['rye', 'gluten', 'peanut'])).toEqual([
      'peanut',
      'wheat',
      'barley',
      'oats',
      'rye',
    ]);
  });
});
