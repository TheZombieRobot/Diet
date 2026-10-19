import { describe, expect, it } from 'vitest';
import { confidenceOf, recipeConfidence, weakestConfidence } from './confidence';
import { netCarbsG } from './netCarbs';
import { kcalToKj, kjToKcal, scaleNutrients, sumNutrients, type Nutrients } from './nutrients';
import { myPortionNutrients } from './portion';

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

describe('net carbs (NU-03)', () => {
  it('subtracts fibre when the carbohydrate figure includes it (USDA-style "total")', () => {
    expect(netCarbsG({ carbsG: 10, fibreG: 4, carbBasis: 'total' })).toBe(6);
  });

  it('is never negative', () => {
    expect(netCarbsG({ carbsG: 3, fibreG: 5, carbBasis: 'total' })).toBe(0);
  });

  it('does not subtract fibre twice from NZ label or NZ database figures ("available")', () => {
    expect(netCarbsG({ carbsG: 10, fibreG: 4, carbBasis: 'available' })).toBe(10);
  });

  it('rejects negative amounts', () => {
    expect(() => netCarbsG({ carbsG: -1, fibreG: 0, carbBasis: 'total' })).toThrow(RangeError);
    expect(() => netCarbsG({ carbsG: 1, fibreG: -1, carbBasis: 'total' })).toThrow(RangeError);
  });
});

describe("the owner's portion never depends on household size (HS-23, FL-05)", () => {
  it('dinner for 3, one serve for me: my nutrition equals one serve', () => {
    expect(myPortionNutrients({ perServe: PER_SERVE, myServes: 1, householdServes: 3 })).toEqual(
      PER_SERVE,
    );
  });

  it('changing the household from 3 to 4 (or 8) leaves my numbers unchanged', () => {
    const three = myPortionNutrients({ perServe: PER_SERVE, myServes: 1, householdServes: 3 });
    const four = myPortionNutrients({ perServe: PER_SERVE, myServes: 1, householdServes: 4 });
    const eight = myPortionNutrients({ perServe: PER_SERVE, myServes: 1, householdServes: 8 });
    expect(four).toEqual(three);
    expect(eight).toEqual(three);
  });

  it('a serve and a half is 1.5 × per-serve', () => {
    const mine = myPortionNutrients({ perServe: PER_SERVE, myServes: 1.5, householdServes: 4 });
    expect(mine.proteinG).toBe(67.5);
    expect(mine.energyKj).toBe(3750);
  });

  it('rejects eating more than the household cooks, or a negative portion', () => {
    expect(() =>
      myPortionNutrients({ perServe: PER_SERVE, myServes: 2, householdServes: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      myPortionNutrients({ perServe: PER_SERVE, myServes: -1, householdServes: 3 }),
    ).toThrow(RangeError);
  });
});

describe('nutrient arithmetic', () => {
  it('scales and sums every one of the eight fields', () => {
    const doubled = scaleNutrients(PER_SERVE, 2);
    expect(sumNutrients([PER_SERVE, PER_SERVE])).toEqual(doubled);
    expect(Object.keys(doubled)).toHaveLength(8);
  });

  it('converts kJ and kcal with 4.184', () => {
    expect(kcalToKj(94)).toBeCloseTo(393.296, 6);
    expect(kjToKcal(5000)).toBeCloseTo(1195.03, 2);
  });

  it('rejects negative nutrient values', () => {
    expect(() => scaleNutrients({ ...PER_SERVE, proteinG: -1 }, 1)).toThrow(RangeError);
  });
});

describe('confidence badges (DATA_MODEL.md; FL-02)', () => {
  it('maps sources to badges', () => {
    expect(confidenceOf('label')).toBe('label');
    expect(confidenceOf('nz-fcdb')).toBe('database');
    expect(confidenceOf('usda')).toBe('database');
    expect(confidenceOf('estimate')).toBe('estimate');
  });

  it("a recipe is 'estimate' if any ingredient is estimated, else 'database'", () => {
    expect(recipeConfidence(['nz-fcdb', 'estimate', 'label'])).toBe('estimate');
    expect(recipeConfidence(['nz-fcdb', 'usda', 'label'])).toBe('database');
  });

  it("an all-label recipe is 'label'; an empty one is only an estimate", () => {
    expect(recipeConfidence(['label', 'label'])).toBe('label');
    expect(weakestConfidence([])).toBe('estimate');
  });
});
