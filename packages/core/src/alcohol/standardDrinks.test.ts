import { describe, expect, it } from 'vitest';
import {
  alcoholGrams,
  type Beverage,
  countedKcalPerServe,
  drinkEnergy,
  standardDrinks,
  totalDrinkEnergy,
  totalStandardDrinks,
} from './standardDrinks';

/** The default preset (HEALTH_SAFETY.md section 5): 330 mL, 5%, 94 kcal from the label. */
const PRESET: Beverage = {
  volumeMl: 330,
  abvPercent: 5,
  label: { volumeMl: 330, abvPercent: 5, kcal: 94 },
};

describe('standard drinks (HS-04, AL-01)', () => {
  // TEST_PLAN.md AL-01, ±0.05 required; the values below are also exact to 2 decimals.
  it.each([
    { volumeMl: 330, abvPercent: 5, expected: 1.3 },
    { volumeMl: 440, abvPercent: 5, expected: 1.74 },
    { volumeMl: 150, abvPercent: 13, expected: 1.54 },
    { volumeMl: 30, abvPercent: 40, expected: 0.95 },
    { volumeMl: 500, abvPercent: 4.5, expected: 1.78 },
    { volumeMl: 250, abvPercent: 7, expected: 1.38 },
    { volumeMl: 750, abvPercent: 13.5, expected: 7.99 },
    { volumeMl: 568, abvPercent: 4, expected: 1.79 },
    { volumeMl: 100, abvPercent: 0.5, expected: 0.04 },
    { volumeMl: 1000, abvPercent: 0, expected: 0 },
  ])(
    '$volumeMl mL at $abvPercent percent ABV is $expected standard drinks',
    ({ volumeMl, abvPercent, expected }) => {
      const result = standardDrinks({ volumeMl, abvPercent });
      expect(result.source).toBe('calculated');
      expect(Math.abs(result.value - expected)).toBeLessThanOrEqual(0.05);
      expect(result.value).toBe(expected);
      expect(result.exact).toBeCloseTo(alcoholGrams(volumeMl, abvPercent) / 10, 12);
    },
  );

  it('is grams of alcohol divided by 10 (one NZ standard drink is 10 g), unrounded in exact', () => {
    expect(alcoholGrams(330, 5)).toBeCloseTo(13.0185, 10);
    const result = standardDrinks({ volumeMl: 330, abvPercent: 5 });
    expect(result).toEqual({
      value: 1.3,
      exact: result.exact,
      source: 'calculated',
      labelIgnored: false,
      labelDisagrees: false,
    });
    expect(result.exact).toBeCloseTo(1.30185, 12);
  });

  it('a label value read for this volume and ABV wins over the calculation (AL-02)', () => {
    const label = { volumeMl: 330, abvPercent: 5 };
    expect(standardDrinks({ ...label, label: { ...label, standardDrinks: 1.3 } })).toEqual({
      value: 1.3,
      exact: 1.3,
      source: 'label',
      labelIgnored: false,
      labelDisagrees: false,
    });
    expect(standardDrinks({ ...label, label: { ...label, standardDrinks: 1.4 } })).toMatchObject({
      value: 1.4,
      source: 'label',
      labelDisagrees: false,
    });
  });

  it('flags a label figure more than 0.1 or 10% away from the calculation, but still uses it', () => {
    const measure = { volumeMl: 330, abvPercent: 5 };
    for (const typed of [0, 0.13, 1.0, 13]) {
      expect(
        standardDrinks({ ...measure, label: { ...measure, standardDrinks: typed } }),
      ).toMatchObject({ exact: typed, source: 'label', labelDisagrees: true });
    }
    // 750 mL at 13.5% is 7.99: 10% (0.80) is the larger margin there.
    const bottle = { volumeMl: 750, abvPercent: 13.5 };
    expect(standardDrinks({ ...bottle, label: { ...bottle, standardDrinks: 7.5 } })).toMatchObject({
      labelDisagrees: false,
    });
    expect(standardDrinks({ ...bottle, label: { ...bottle, standardDrinks: 7.1 } })).toMatchObject({
      labelDisagrees: true,
    });
  });

  it('after the volume is edited (330 → 440 mL) the label figure no longer applies', () => {
    const edited: Beverage = {
      volumeMl: 440,
      abvPercent: 5,
      label: { volumeMl: 330, abvPercent: 5, standardDrinks: 1.3, kcal: 94 },
    };
    expect(standardDrinks(edited)).toEqual({
      value: 1.74,
      exact: alcoholGrams(440, 5) / 10,
      source: 'calculated',
      labelIgnored: true,
      labelDisagrees: false,
    });
    expect(drinkEnergy(edited)).toEqual({
      kcal: null,
      source: 'unknown',
      labelIgnored: true,
      labelImplausible: false,
    });
  });

  it('after the ABV is edited the label figure no longer applies', () => {
    const edited: Beverage = {
      volumeMl: 150,
      abvPercent: 13,
      label: { volumeMl: 150, abvPercent: 12.5, standardDrinks: 1.5 },
    };
    expect(standardDrinks(edited)).toMatchObject({
      value: 1.54,
      source: 'calculated',
      labelIgnored: true,
    });
  });

  it('treats a null label, or a null label figure (a cleared form field), as absent', () => {
    const measure = { volumeMl: 330, abvPercent: 5 };
    for (const beverage of [
      { ...measure, label: null },
      { ...measure, label: { ...measure, standardDrinks: null, kcal: null } },
      { ...measure, label: { ...measure, standardDrinks: undefined } },
    ]) {
      expect(standardDrinks(beverage)).toMatchObject({
        value: 1.3,
        source: 'calculated',
        labelIgnored: false,
      });
      expect(drinkEnergy(beverage)).toMatchObject({ kcal: null, source: 'unknown' });
    }
  });

  it('treats ABV as a percentage: 5 means 5%', () => {
    // If ABV were mistaken for a fraction (0.05) the result would be 100 times too small.
    expect(standardDrinks({ volumeMl: 330, abvPercent: 0.05 }).value).toBe(0.01);
    expect(standardDrinks({ volumeMl: 330, abvPercent: 5 }).value).toBe(1.3);
  });

  it.each([
    [{ volumeMl: -1, abvPercent: 5 }],
    [{ volumeMl: 330, abvPercent: 101 }],
    [{ volumeMl: 330, abvPercent: -0.1 }],
    [{ volumeMl: Number.NaN, abvPercent: 5 }],
    [{ volumeMl: 330, abvPercent: 5, label: { volumeMl: 330, abvPercent: 5, standardDrinks: -1 } }],
    [{ volumeMl: 330, abvPercent: 5, label: { volumeMl: -330, abvPercent: 5 } }],
  ])('rejects impossible input %j', (drink) => {
    expect(() => standardDrinks(drink)).toThrow(RangeError);
  });
});

describe('weekly totals sum unrounded figures and round once (HS-05, HS-06)', () => {
  const perDrink = (volumeMl: number, abvPercent: number) =>
    standardDrinks({ volumeMl, abvPercent });

  it.each([
    // [count, volumeMl, abvPercent, threshold]: the exact total reaches the threshold, while
    // adding up per-drink rounded figures would fall just under it.
    { count: 9, volumeMl: 100, abvPercent: 14.1, threshold: 10 },
    { count: 17, volumeMl: 30, abvPercent: 37.3, threshold: 15 },
    { count: 21, volumeMl: 121, abvPercent: 10, threshold: 20 },
    { count: 34, volumeMl: 30, abvPercent: 37.3, threshold: 30 },
  ])(
    '$count × $volumeMl mL at $abvPercent percent reaches $threshold',
    ({ count, volumeMl, abvPercent, threshold }) => {
      const drink = perDrink(volumeMl, abvPercent);
      expect(drink.exact * count).toBeGreaterThanOrEqual(threshold);
      expect(drink.value * count).toBeLessThan(threshold);
      expect(totalStandardDrinks([{ exact: drink.exact, count }])).toBeGreaterThanOrEqual(
        threshold,
      );
    },
  );

  it('34 serves of 30 mL at 37.3% total 30.02, not 29.92', () => {
    const drink = perDrink(30, 37.3);
    expect(drink.value).toBe(0.88);
    expect(totalStandardDrinks([{ exact: drink.exact, count: 34 }])).toBe(30.02);
  });

  it('mixes label and calculated figures, and an empty week is 0', () => {
    const beer = standardDrinks({
      volumeMl: 330,
      abvPercent: 5,
      label: { volumeMl: 330, abvPercent: 5, standardDrinks: 1.3 },
    });
    const wine = perDrink(150, 13);
    expect(
      totalStandardDrinks([
        { exact: beer.exact, count: 4 },
        { exact: wine.exact, count: 2 },
      ]),
    ).toBe(8.28); // 5.2 + 3.0771
    expect(totalStandardDrinks([])).toBe(0);
  });

  it('rejects impossible entries', () => {
    expect(() => totalStandardDrinks([{ exact: -1, count: 1 }])).toThrow(RangeError);
    expect(() => totalStandardDrinks([{ exact: 1, count: Number.NaN }])).toThrow(RangeError);
  });
});

describe('drink energy comes only from the label (NN-01)', () => {
  it('the default preset shows its label value: 330 mL, 5%, 94 kcal, about 1.30', () => {
    expect(standardDrinks(PRESET).value).toBe(1.3);
    expect(drinkEnergy(PRESET)).toEqual({
      kcal: 94,
      source: 'label',
      labelIgnored: false,
      labelImplausible: false,
    });
  });

  it('another 330 mL, 5% drink with no label energy is unknown, never 94', () => {
    expect(drinkEnergy({ volumeMl: 330, abvPercent: 5 })).toEqual({
      kcal: null,
      source: 'unknown',
      labelIgnored: false,
      labelImplausible: false,
    });
    expect(
      drinkEnergy({ volumeMl: 330, abvPercent: 5, label: { volumeMl: 330, abvPercent: 5 } }),
    ).toMatchObject({ kcal: null, source: 'unknown' });
  });

  it('flags a label figure below the energy in the alcohol alone, but never replaces it', () => {
    // 13.0185 g of alcohol × 7 kcal × 0.9 = 82.0 kcal.
    for (const kcal of [0, 13, 80]) {
      expect(
        drinkEnergy({
          volumeMl: 330,
          abvPercent: 5,
          label: { volumeMl: 330, abvPercent: 5, kcal },
        }),
      ).toEqual({ kcal, source: 'label', labelIgnored: false, labelImplausible: true });
    }
    expect(
      drinkEnergy({
        volumeMl: 330,
        abvPercent: 5,
        label: { volumeMl: 330, abvPercent: 5, kcal: 83 },
      }),
    ).toMatchObject({ kcal: 83, labelImplausible: false });
    expect(
      drinkEnergy({
        volumeMl: 330,
        abvPercent: 0,
        label: { volumeMl: 330, abvPercent: 0, kcal: 0 },
      }),
    ).toMatchObject({ kcal: 0, labelImplausible: false });
  });

  it('rejects impossible energy values', () => {
    expect(() =>
      drinkEnergy({
        volumeMl: 330,
        abvPercent: 5,
        label: { volumeMl: 330, abvPercent: 5, kcal: -5 },
      }),
    ).toThrow(RangeError);
  });
});

describe("a day's drink energy counts unknowns instead of inferring them (NN-01)", () => {
  const can = { volumeMl: 330, abvPercent: 5 };

  it('adds known label energy and counts drinks with unknown energy', () => {
    expect(
      totalDrinkEnergy([
        { kcal: 94, count: 2, measure: can },
        { kcal: null, count: 1, measure: can },
        { kcal: undefined, count: 2, measure: can },
        { kcal: 120, count: 1, measure: can },
      ]),
    ).toEqual({ knownKcal: 308, unknownCount: 3 });
  });

  it('works from drinkEnergy results directly', () => {
    const edited: Beverage = { ...PRESET, volumeMl: 440 };
    expect(
      totalDrinkEnergy([
        { kcal: drinkEnergy(PRESET).kcal, count: 1, measure: PRESET },
        { kcal: drinkEnergy(edited).kcal, count: 1, measure: edited },
      ]),
    ).toEqual({ knownKcal: 94, unknownCount: 1 });
    expect(totalDrinkEnergy([])).toEqual({ knownKcal: 0, unknownCount: 0 });
  });

  it('HS-36, A40: a label energy below 90% of the alcohol alone is unknown, never a known 0; a 0% drink can be a known 0', () => {
    // 330 mL at 5% is 13.02 g of alcohol, 91.1 kcal; 90% of it is 82.02 kcal.
    expect(countedKcalPerServe(0, can)).toBeNull();
    expect(countedKcalPerServe(82, can)).toBeNull();
    expect(countedKcalPerServe(83, can)).toBe(83);
    expect(countedKcalPerServe(null, can)).toBeNull();
    expect(countedKcalPerServe(0, { volumeMl: 330, abvPercent: 0 })).toBe(0);
    expect(
      totalDrinkEnergy([
        { kcal: 0, count: 6, measure: can },
        { kcal: 0, count: 1, measure: { volumeMl: 330, abvPercent: 0 } },
      ]),
    ).toEqual({ knownKcal: 0, unknownCount: 6 });
  });

  it('rejects impossible entries', () => {
    expect(() => totalDrinkEnergy([{ kcal: -1, count: 1, measure: can }])).toThrow(RangeError);
    expect(() => totalDrinkEnergy([{ kcal: null, count: -1, measure: can }])).toThrow(RangeError);
  });
});
