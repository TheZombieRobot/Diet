import { describe, expect, it } from 'vitest';
import type { UserAllergen } from '../storage/allergens';
import { ingredientResolver, type IngredientView } from '../storage/overrides';
import {
  allergenRowPart,
  allergenSummary,
  allergenSummaryText,
  allowedSwaps,
  conflictText,
  isGlutenFreeSwap,
  swapDecision,
} from './allergens';
import { seedViews } from './dataset';

const resolve = ingredientResolver(seedViews(), [], []);
const food = (id: string): IngredientView => {
  const view = resolve(`seed:${id}`);
  if (view === null) throw new Error(`${id} is not shipped`);
  return view;
};
const profile = (allergens: UserAllergen[], glutenFreeHousehold = false) => ({
  allergens,
  glutenFreeHousehold,
  dislikeIngredientIds: [] as string[],
  dislikeTerms: [] as string[],
});
const swapNames = (id: string, p: ReturnType<typeof profile>) =>
  allowedSwaps(food(id), resolve, p).swaps.map(
    (s) => `${s.view.name}${s.checkLabel ? ' (label)' : ''}`,
  );

describe('swaps and allergens (item 18 design 3.4)', () => {
  it('F16 FD-04 C107 FL-07 HS-24: a swap never carries a listed allergen; gluten-free swaps only for a gluten-free household', () => {
    expect(swapNames('tahini', profile(['peanut']))).toEqual([]);
    expect(swapNames('chicken-breast', profile(['fish']))).toEqual(['Chicken thigh']);
    expect(swapNames('prawns', profile(['fish']))).toEqual([]);
    expect(swapNames('plain-flour', profile(['tree-nut']))).toEqual([]);
    expect(swapNames('fish-sauce', profile(['soy']))).toEqual([]);
    for (const id of ['mayonnaise', 'cream', 'sour-cream'])
      expect(swapNames(id, profile(['milk']))).not.toContain('Greek yoghurt, plain (label)');
    expect(allowedSwaps(food('pasta'), resolve, profile([]))).toEqual({ swaps: [], hidden: 2 });
    expect(swapNames('pasta', profile(['gluten']))).toEqual([]);
    expect(swapNames('pasta', profile([], true))).toEqual(['White rice (label)', 'Quinoa (label)']);
    expect(swapNames('tuna-in-water', profile([]))).toEqual([
      'Tuna in oil (label)',
      'Pink salmon (canned) (label)',
    ]);
    expect(swapDecision(food('tahini'), food('peanut-butter'), profile(['peanut']))).toEqual({
      offered: false,
      reason: 'allergen',
    });
    expect(swapDecision(food('pasta'), food('white-rice'), profile(['gluten']))).toEqual({
      offered: false,
      reason: 'gluten-free',
    });
    expect(swapDecision(food('butter'), food('olive-oil'), profile([]))).toEqual({
      offered: true,
      checkLabel: true,
    });
    // The known lists decide, complete or not: soy sauce (brand-dependent) still carries wheat.
    expect(isGlutenFreeSwap(food('pasta'), food('soy-sauce'))).toBe(false);
    expect(isGlutenFreeSwap(food('pasta'), food('white-rice'))).toBe(true);
    // Red and green curry pastes usually hold shrimp paste: never a swap for a crustacea listing.
    expect(swapNames('curry-powder', profile([]))).toEqual(['Curry paste (label)']);
    expect(swapNames('curry-powder', profile(['crustacea']))).toEqual([]);
    expect(isGlutenFreeSwap(food('plain-flour'), food('almond-meal'))).toBe(true);
    expect(conflictText(['gluten'], ['wheat'])).toBe('wheat (gluten)');
    expect(conflictText(['wheat'], ['wheat'])).toBe('wheat');
    expect(conflictText(['gluten', 'fish'], ['fish', 'oats'])).toBe('fish and oats (gluten)');
  });

  it('C43 dislikes: a food the owner does not want suggested is never a swap, and is counted as hidden', () => {
    const dislikes = (ids: string[], terms: string[]) => ({
      ...profile([]),
      dislikeIngredientIds: ids,
      dislikeTerms: terms,
    });
    expect(swapNames('silverbeet', profile([]))).toEqual(['Spinach', 'Kale']);
    expect(allowedSwaps(food('silverbeet'), resolve, dislikes([], ['kale']))).toMatchObject({
      swaps: [{ view: { name: 'Spinach' } }],
      hidden: 1,
    });
    expect(swapNames('silverbeet', dislikes(['seed:spinach'], []))).toEqual(['Kale']);
  });

  it('F12 C43 owner request: complete, single-food, brand-dependent and contained allergens read differently', () => {
    const text = (id: string) => allergenSummaryText(allergenSummary(food(id)));
    const row = (id: string) => allergenRowPart(allergenSummary(food(id)));
    expect(text('silverbeet')).toBe('None of the 15 allergens the app tracks.');
    expect(row('silverbeet')).toBeNull();
    expect(text('olive-oil')).toMatch(
      /^None of the 15 allergens the app tracks is in it by nature/,
    );
    expect(row('olive-oil')).toBe('Check the label for allergens');
    expect(text('white-fish')).toBe('Contains fish.');
    expect(text('firm-tofu')).toBe(
      'Contains soy. Other allergens depend on the brand: check the label.',
    );
    expect(row('firm-tofu')).toBe('Contains soy · Check the label for allergens');
    expect(text('soy-sauce')).toBe(
      'Contains soy and wheat. Other allergens depend on the brand: check the label.',
    );
    expect(text('canned-tomatoes')).toBe('Allergens depend on the brand: check the label.');
  });
});
