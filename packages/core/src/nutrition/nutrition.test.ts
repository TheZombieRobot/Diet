import { describe, expect, it } from 'vitest';
import {
  type Confidence,
  confidenceOf,
  type NutritionSource,
  recipeConfidence,
  weakestConfidence,
} from './confidence';
import { type CarbFigures, netCarbsG, netCarbsOf, toAvailableCarbsG } from './netCarbs';
import {
  kcalToKj,
  kjToKcal,
  MAX_SCALE_FACTOR,
  nutrientsForGrams,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
} from './nutrients';
import { myPortionNutrients, ownerMealNutrients } from './portion';

const PER_SERVE: Nutrients = {
  energyKj: 2500,
  proteinG: 45,
  fatG: 30,
  saturatedFatG: 6,
  carbsG: 8,
  sugarsG: 4,
  fibreG: 6,
  sodiumMg: 700,
};

const ZERO: Nutrients = {
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
};

describe('carbohydrate is stored on one basis: available (fibre excluded) (NU-03)', () => {
  it('converts a "total" figure (USDA-style, fibre included) by subtracting fibre', () => {
    expect(toAvailableCarbsG({ carbsG: 10, fibreG: 4, carbBasis: 'total' })).toBe(6);
  });

  it('never goes negative', () => {
    expect(toAvailableCarbsG({ carbsG: 3, fibreG: 5, carbBasis: 'total' })).toBe(0);
  });

  it('keeps an "available" figure (NZ labels and NZ database) as it is: fibre is never subtracted twice', () => {
    expect(toAvailableCarbsG({ carbsG: 10, fibreG: 4, carbBasis: 'available' })).toBe(10);
  });

  it('refuses an unknown basis instead of subtracting fibre', () => {
    const unknownBasis = { carbsG: 10, fibreG: 4, carbBasis: 'by-difference' };
    expect(() => toAvailableCarbsG(unknownBasis as unknown as CarbFigures)).toThrow(RangeError);
    expect(() => netCarbsG(unknownBasis as unknown as CarbFigures)).toThrow(RangeError);
  });

  it('rejects negative amounts', () => {
    expect(() => toAvailableCarbsG({ carbsG: -1, fibreG: 0, carbBasis: 'total' })).toThrow(
      RangeError,
    );
    expect(() => toAvailableCarbsG({ carbsG: 1, fibreG: -1, carbBasis: 'total' })).toThrow(
      RangeError,
    );
  });

  it('netCarbsG is the same conversion for raw figures', () => {
    for (const figures of [
      { carbsG: 10, fibreG: 4, carbBasis: 'total' },
      { carbsG: 3, fibreG: 5, carbBasis: 'total' },
      { carbsG: 10, fibreG: 4, carbBasis: 'available' },
    ] as const) {
      expect(netCarbsG(figures)).toBe(toAvailableCarbsG(figures));
    }
  });

  it('a recipe mixing an NZ database and a USDA ingredient has 7 g net carbs once both are normalised and summed', () => {
    // NZ Food Composition Database: carbohydrate is already available (fibre excluded).
    const nzRaw = { carbsG: 2, fibreG: 10, carbBasis: 'available' } as const;
    // USDA FoodData Central: carbohydrate by difference includes fibre.
    const usdaRaw = { carbsG: 8, fibreG: 3, carbBasis: 'total' } as const;
    const nz: Nutrients = { ...ZERO, carbsG: toAvailableCarbsG(nzRaw), fibreG: nzRaw.fibreG };
    const usda: Nutrients = {
      ...ZERO,
      carbsG: toAvailableCarbsG(usdaRaw),
      fibreG: usdaRaw.fibreG,
    };
    const recipe = sumNutrients([nz, usda]);
    expect(netCarbsOf(recipe)).toBe(7);
    // Summing the raw figures and subtracting fibre afterwards would have said 0 g.
    expect(Math.max(0, nzRaw.carbsG + usdaRaw.carbsG - (nzRaw.fibreG + usdaRaw.fibreG))).toBe(0);
  });

  it('netCarbsOf validates its input and is carbsG itself', () => {
    expect(netCarbsOf(PER_SERVE)).toBe(8);
    expect(() => netCarbsOf({ ...PER_SERVE, carbsG: -1 })).toThrow(RangeError);
  });
});

describe("the owner's portion never depends on household size (HS-23, FL-05)", () => {
  it('dinner for 3, one serve for me: my nutrition equals one serve', () => {
    expect(ownerMealNutrients({ perServe: PER_SERVE, myServes: 1, householdServes: 3 })).toEqual(
      PER_SERVE,
    );
  });

  it.each([1, 3])(
    'with my serves at %d, household serves of 1, 2, 3, 4 and 8 all give the same numbers',
    (myServes) => {
      const expected = myPortionNutrients({ perServe: PER_SERVE, myServes });
      for (const householdServes of [1, 2, 3, 4, 8]) {
        expect(ownerMealNutrients({ perServe: PER_SERVE, myServes, householdServes })).toEqual(
          expected,
        );
      }
    },
  );

  it('three serves from a dish cooked for one is allowed: household size never limits my serves', () => {
    expect(
      ownerMealNutrients({ perServe: PER_SERVE, myServes: 3, householdServes: 1 }).proteinG,
    ).toBe(135);
  });

  it('a serve and a half is 1.5 × per-serve', () => {
    const mine = myPortionNutrients({ perServe: PER_SERVE, myServes: 1.5 });
    expect(mine.proteinG).toBe(67.5);
    expect(mine.energyKj).toBe(3750);
  });

  it('rejects a negative or huge portion, and a household outside 1 to 50 serves', () => {
    expect(() => myPortionNutrients({ perServe: PER_SERVE, myServes: -1 })).toThrow(RangeError);
    expect(() => myPortionNutrients({ perServe: PER_SERVE, myServes: 11 })).toThrow(RangeError);
    for (const householdServes of [0, 0.5, 51, Number.NaN]) {
      expect(() =>
        ownerMealNutrients({ perServe: PER_SERVE, myServes: 1, householdServes }),
      ).toThrow(RangeError);
    }
  });
});

describe('nutrient arithmetic', () => {
  it('scales and sums every one of the eight fields', () => {
    const doubled = scaleNutrients(PER_SERVE, 2);
    expect(sumNutrients([PER_SERVE, PER_SERVE])).toEqual(doubled);
    expect(Object.keys(doubled)).toHaveLength(8);
  });

  it('a label per 100 g with 150 g logged is 1.5 × the label (FL-01)', () => {
    const per100g: Nutrients = { ...PER_SERVE, energyKj: 1000, proteinG: 20 };
    const logged = nutrientsForGrams(per100g, 150);
    expect(logged.energyKj).toBe(1500);
    expect(logged.proteinG).toBe(30);
    expect(nutrientsForGrams(per100g, 0)).toEqual(ZERO);
  });

  it('refuses a gram weight passed as a multiplier', () => {
    expect(MAX_SCALE_FACTOR).toBe(50);
    expect(() => scaleNutrients(PER_SERVE, 150)).toThrow(RangeError);
    expect(scaleNutrients(PER_SERVE, 50).proteinG).toBe(2250);
    expect(() => nutrientsForGrams(PER_SERVE, 5001)).toThrow(RangeError);
    expect(() => nutrientsForGrams(PER_SERVE, -1)).toThrow(RangeError);
  });

  it('converts kJ and kcal with 4.184', () => {
    expect(kcalToKj(94)).toBeCloseTo(393.296, 6);
    expect(kjToKcal(5000)).toBeCloseTo(1195.03, 2);
  });

  it('rejects negative nutrient values', () => {
    expect(() => scaleNutrients({ ...PER_SERVE, proteinG: -1 }, 1)).toThrow(RangeError);
  });
});

describe('confidence badges (DATA_MODEL.md; FL-01, FL-02)', () => {
  it('maps sources to badges; a single label item logged directly stays "label" (FL-01)', () => {
    expect(confidenceOf('label')).toBe('label');
    expect(confidenceOf('nz-fcdb')).toBe('database');
    expect(confidenceOf('usda')).toBe('database');
    expect(confidenceOf('estimate')).toBe('estimate');
  });

  it("a recipe is 'estimate' if any ingredient is estimated, else 'database' (FL-02)", () => {
    expect(recipeConfidence(['nz-fcdb', 'estimate', 'label'])).toBe('estimate');
    expect(recipeConfidence(['nz-fcdb', 'usda', 'label'])).toBe('database');
  });

  it("a computed recipe is never 'label', even when every ingredient is (FL-02)", () => {
    expect(recipeConfidence(['label'])).toBe('database');
    expect(recipeConfidence(['label', 'label'])).toBe('database');
  });

  it('an empty recipe is only an estimate', () => {
    expect(recipeConfidence([])).toBe('estimate');
    expect(weakestConfidence([])).toBe('estimate');
  });

  it('does not depend on ingredient order', () => {
    const sources: NutritionSource[] = ['label', 'usda', 'nz-fcdb', 'estimate'];
    const permutations = (items: NutritionSource[]): NutritionSource[][] =>
      items.length <= 1
        ? [items]
        : items.flatMap((item, i) =>
            permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
              item,
              ...rest,
            ]),
          );
    for (const subset of [sources, sources.slice(0, 3), ['label', 'usda'] as NutritionSource[]]) {
      const results = new Set(permutations(subset).map(recipeConfidence));
      expect(results.size).toBe(1);
    }
  });

  it('refuses an unknown source or badge wherever it appears in the list', () => {
    const unknownSource = 'guess' as unknown as NutritionSource;
    expect(() => confidenceOf(unknownSource)).toThrow(RangeError);
    expect(() => recipeConfidence([unknownSource, 'label'])).toThrow(RangeError);
    expect(() => recipeConfidence(['label', unknownSource])).toThrow(RangeError);
    for (const unknownBadge of ['toString', 'verified', undefined]) {
      const badge = unknownBadge as unknown as Confidence;
      expect(() => weakestConfidence([badge, 'label'])).toThrow(RangeError);
      expect(() => weakestConfidence(['label', badge])).toThrow(RangeError);
    }
  });
});
