import { describe, expect, it } from 'vitest';
import { alcoholGrams, drinkEnergy, standardDrinks } from './standardDrinks';

describe('standard drinks (HS-04, AL-01)', () => {
  // TEST_PLAN.md AL-01, ±0.05 required; the values below are also exact to 2 decimals.
  it.each([
    [330, 5, 1.3],
    [440, 5, 1.74],
    [150, 13, 1.54],
    [30, 40, 0.95],
    [500, 4.5, 1.78],
    [250, 7, 1.38],
    [750, 13.5, 7.99],
    [568, 4, 1.79],
    [100, 0.5, 0.04],
    [1000, 0, 0],
  ])('%d mL at %d%% is %d standard drinks', (volumeMl, abvPercent, expected) => {
    const result = standardDrinks({ volumeMl, abvPercent });
    expect(result.source).toBe('calculated');
    expect(Math.abs(result.value - expected)).toBeLessThanOrEqual(0.05);
    expect(result.value).toBe(expected);
  });

  it('is grams of alcohol divided by 10 (one NZ standard drink is 10 g)', () => {
    expect(alcoholGrams(330, 5)).toBeCloseTo(13.0185, 10);
  });

  it('a label value wins over the calculation (AL-02)', () => {
    expect(standardDrinks({ volumeMl: 330, abvPercent: 5, labelStandardDrinks: 1.4 })).toEqual({
      value: 1.4,
      source: 'label',
    });
    expect(standardDrinks({ volumeMl: 330, abvPercent: 5, labelStandardDrinks: 1.3 })).toEqual({
      value: 1.3,
      source: 'label',
    });
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
    [{ volumeMl: 330, abvPercent: 5, labelStandardDrinks: -1 }],
  ])('rejects impossible input %j', (drink) => {
    expect(() => standardDrinks(drink)).toThrow(RangeError);
  });
});

describe('drink energy comes only from the label (NN-01)', () => {
  it('the default preset shows its label value: 330 mL, 5%, 94 kcal, about 1.30', () => {
    const preset = { volumeMl: 330, abvPercent: 5, labelKcal: 94 };
    expect(standardDrinks(preset).value).toBe(1.3);
    expect(drinkEnergy(preset)).toEqual({ kcal: 94, source: 'label' });
  });

  it('another drink with the same volume and strength but no label energy is unknown', () => {
    expect(drinkEnergy({})).toEqual({ kcal: null, source: 'unknown' });
    expect(drinkEnergy({ labelKcal: undefined })).toEqual({ kcal: null, source: 'unknown' });
  });

  it('rejects impossible energy values', () => {
    expect(() => drinkEnergy({ labelKcal: -5 })).toThrow(RangeError);
  });
});
