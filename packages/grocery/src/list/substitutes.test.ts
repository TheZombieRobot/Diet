import {
  blockedAllergens,
  foodAllergenFacts,
  type GroceryItem,
  type IngredientOverrideRecord,
} from '@diet/core';
import { exampleOwnFood, listFoodsFixture, SYNTHETIC_PER_100G } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import {
  clearSubstituteHints,
  manualSubstituteHint,
  substituteFilterChanged,
  substituteHint,
} from './substitutes';
import type { ListFoods, SubstituteProfile } from './types';

const NONE: SubstituteProfile = {
  allergens: [],
  glutenFreeHousehold: false,
  dislikeIngredientIds: [],
  dislikeTerms: [],
};
const source = (ingredientId: string) => ({
  line: { ingredientId, rawG: 300, cookedG: null, displayAs: null },
  seedLines: null,
  recipeTitle: 'Example traybake',
});
const hint = (
  id: string,
  profile: Partial<SubstituteProfile>,
  foods: ListFoods = listFoodsFixture(),
) => substituteHint([source(id)], foods, { ...NONE, ...profile }, new Set());

describe('substitute hints (LU6; GL-09, C107, FL-07, HS-24, H24b)', () => {
  it('the first swap item 20 allows, under the household filters (J15)', () => {
    const NOODLES = '00000000-0000-4000-8000-000000000b01';
    const rice: IngredientOverrideRecord = {
      seedId: 'seed:white-rice',
      changes: [{ field: 'substitutes', value: [NOODLES] }],
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };
    const glutenFoods = listFoodsFixture({
      overrides: [rice],
      own: [exampleOwnFood(NOODLES, 'Example noodles', SYNTHETIC_PER_100G, ['wheat'])],
    });
    const cases: [string, Partial<SubstituteProfile>, string | null, ListFoods?][] = [
      ['seed:broccoli', {}, 'Cauliflower'],
      ['seed:broccoli', { dislikeIngredientIds: ['seed:cauliflower'] }, 'Frozen broccoli'],
      // H24b: a peanut-allergic owner is never hinted peanut butter.
      ['seed:tahini', { allergens: ['peanut'] }, null],
      ['seed:salmon', { allergens: ['fish'] }, null],
      // With an allergen listed, a brand-dependent candidate (a label check) is never hinted.
      ['seed:olive-oil', {}, 'Canola oil'],
      ['seed:olive-oil', { allergens: ['milk'] }, null],
      // FL-07: Gluten-free household on, no allergens: an own food known to hold wheat is not hinted.
      ['seed:white-rice', { glutenFreeHousehold: true }, null, glutenFoods],
      ['seed:white-rice', {}, 'Example noodles', glutenFoods],
    ];
    for (const [id, profile, expected, foods] of cases) {
      expect(hint(id, profile, foods), `${id} ${JSON.stringify(profile)}`).toBe(expected);
    }
  });

  it("no hint names a food known to carry the profile's shared blocked allergens", () => {
    const foods = listFoodsFixture();
    const ids = [...foods.seedById.keys()];
    const profiles: Partial<SubstituteProfile>[] = [
      { allergens: ['peanut', 'fish'] },
      { allergens: ['gluten'] },
      { glutenFreeHousehold: true },
    ];
    for (const profile of profiles) {
      const blocked = blockedAllergens({ ...NONE, ...profile }, 'shared');
      for (const id of ids) {
        const name = hint(id, profile, foods);
        if (name === null) continue;
        const view = [...foods.seedById.values()].find((s) => s.name === name);
        const facts = foodAllergenFacts(
          foods.resolve(view?.id ?? '') ?? { allergensIfComplete: [], allergensAtLeast: [] },
        );
        expect(
          facts.allergens.filter((a) => blocked.includes(a)),
          `${id} → ${name}`,
        ).toEqual([]);
      }
    }
  });

  it("J35: a manual line linked to a food gets that food's hint; an unlinked id none", () => {
    const foods = listFoodsFixture();
    expect(manualSubstituteHint('seed:broccoli', foods, NONE, new Set())).toBe('Cauliflower');
    expect(manualSubstituteHint('seed:example-gone', foods, NONE, new Set())).toBeNull();
  });
});

describe('hints never outlive their profile (LU11; J28, HS-24)', () => {
  it('a change to allergens, the gluten-free toggle or a dislike changes the filter; order and the store do not', () => {
    const base: SubstituteProfile = { ...NONE, allergens: ['soy', 'fish'], dislikeTerms: ['zz'] };
    expect(substituteFilterChanged(base, { ...base, allergens: ['fish', 'soy'] })).toBe(false);
    for (const after of [
      { ...base, allergens: ['soy'] },
      { ...base, allergens: ['soy', 'fish', 'egg'] },
      { ...base, glutenFreeHousehold: true },
      { ...base, dislikeIngredientIds: ['seed:kale'] },
      { ...base, dislikeTerms: ['zz', 'yy'] },
    ] as SubstituteProfile[]) {
      expect(substituteFilterChanged(base, after)).toBe(true);
    }
  });

  it('every hint is cleared, manual lines included; nothing to write when none had one', () => {
    const item = { substituteHint: 'Firm tofu', origin: 'manual' } as GroceryItem;
    expect(
      clearSubstituteHints([item, { ...item, origin: 'generated' }])?.map((i) => i.substituteHint),
    ).toEqual([null, null]);
    expect(clearSubstituteHints([{ ...item, substituteHint: null }])).toBeNull();
  });
});
