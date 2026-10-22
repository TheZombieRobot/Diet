import { listFoodsFixture, packSizesOverride } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import type { Need } from './aggregate';
import { choosePacks, needQuantity, packInfoOf, packSuggestion } from './packs';

const foods = listFoodsFixture();
const pack = (id: string, amount: number, unit: 'g' | 'each' = 'g', f = foods) => {
  const info = packInfoOf(id, f);
  if (info === null) throw new Error(id);
  return packSuggestion({ amount, unit }, info);
};
const need = (kind: Need['kind'], grams: number): Need => ({
  kind,
  ingredientId: 'seed:example',
  grams,
  sources: [],
});

describe('pack suggestions (LU2; GL-03, NN-04, C110, N11)', () => {
  it('NN-04: 500 g raw lean mince is bought as raw grams, "500 g pack"', () => {
    expect(needQuantity(need('grams', 500))).toEqual({ quantity: 500, unit: 'g' });
    expect(pack('seed:beef-mince-lean', 500)).toBe('500 g pack');
    expect(needQuantity(need('cooked', 380))).toEqual({ quantity: null, unit: null });
  });

  it('GL-03 and the design 2.4 examples, every text at most 60 characters', () => {
    const chicken = listFoodsFixture({
      overrides: [packSizesOverride('seed:chicken-thigh', [250, 500])],
    });
    const cases: [string | null, string][] = [
      [pack('seed:chicken-thigh', 430, 'g', chicken), '500 g pack'],
      [pack('seed:lemon', 300), '3 lemons'],
      [pack('seed:silverbeet', 200), '1 bunch'],
      [pack('seed:silverbeet', 600), '2 bunches'],
      [pack('seed:avocado', 400), '2 avocados'],
      [pack('seed:eggs', 8, 'each'), '1 pack of 12 eggs'],
      [pack('seed:eggs', 13, 'each'), '1 × 12 + 1 × 6 eggs'],
      [pack('seed:eggs', 12 * 2, 'each'), '2 packs of 12 eggs'],
      [pack('seed:olive-oil', 45), '500 mL bottle'],
      [pack('seed:coconut-cream', 450), '3 × 165 mL cans'],
      [pack('seed:salmon', 300), '500 g pack'],
      [pack('seed:chicken-thigh', 1600), '2 × 1 kg packs'],
      [pack('seed:chicken-thigh', 12_000), '12 × 1 kg packs'],
    ];
    for (const [actual, expected] of cases) {
      expect(actual).toBe(expected);
      expect(actual?.length ?? 0).toBeLessThanOrEqual(60);
    }
  });

  it('eggs come from the 50 g edible weight, never the 62 g as-bought weight', () => {
    expect(needQuantity(need('eggs', 400))).toEqual({ quantity: 8, unit: 'each' });
    expect(needQuantity(need('eggs', 10))).toEqual({ quantity: 1, unit: 'each' });
  });

  it('least surplus, then fewest packs, then larger packs; an owner who cleared grams per each gets none', () => {
    expect(choosePacks(5000, [2500, 5000])).toEqual([0, 1]);
    expect(choosePacks(7000, [3000, 5000])).toEqual([1, 1]);
    expect(choosePacks(0, [1])).toBeNull();
    const cleared = listFoodsFixture({
      overrides: [
        {
          ...packSizesOverride('seed:lemon', [100]),
          changes: [{ field: 'gramsPerEach', value: null }],
        },
      ],
    });
    expect(pack('seed:lemon', 300, 'g', cleared)).toBeNull();
  });
});
