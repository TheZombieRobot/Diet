import { describe, expect, it } from 'vitest';
import { foods } from '../copy/health';
import { NUTRIENT_KEYS, type Nutrients } from '../nutrition/nutrients';
import type { NutrientKey } from '../storage/records';
import {
  averageShown,
  differenceShown,
  figureShown,
  figureText,
  foodBadge,
  footerForEntries,
  footerForViews,
  ingredientMissingLines,
  nutritionFooter,
  per100gRows,
  ratioShown,
  roundForDisplay,
  totalRows,
} from './figures';
import { exampleAttribution, seedViewFixture } from './testData';
import { entryConfidence } from './view';

const ALL = [...NUTRIENT_KEYS];
const zeros: Nutrients = {
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
};
const DATABASE_NAMES = /Food Composition Database|\bFCDB\b|\bUSDA\b|FoodData|New Zealand Food/;

describe('showing figures (HS-37; item 18 design 3.3)', () => {
  it('F8 HS-37 D35 N39 X2: unknown is never a digit, lower bounds round down, energy never rounds up', () => {
    expect(figureShown(12.3, false)).toEqual({ kind: 'value', value: 12.3 });
    expect(figureShown(12.3, true)).toEqual({ kind: 'at-least', value: 12.3 });
    expect(figureShown(0, true)).toEqual({ kind: 'not-known' });
    expect(figureShown(0, false)).toEqual({ kind: 'value', value: 0 });
    expect(() => figureShown(-1, false)).toThrow(RangeError);
    expect(() => figureShown(Number.NaN, true)).toThrow(RangeError);

    expect(roundForDisplay('proteinG', 9.96, true)).toBe(10);
    expect(roundForDisplay('proteinG', 9.96, false)).toBe(9.9);
    expect(roundForDisplay('proteinG', 18.96, true)).toBe(19);
    expect(roundForDisplay('proteinG', 17.6, false)).toBe(17);
    expect(roundForDisplay('fibreG', 2.3, true)).toBe(2.3);
    expect(roundForDisplay('fibreG', 2.3, false)).toBe(2.3);
    expect(roundForDisplay('energyKj', 1234.9, true)).toBe(1234);
    expect(roundForDisplay('energyKj', 1234.9, false)).toBe(1234);
    expect(figureText('energyKj', { kind: 'value', value: 4999.6 })).toBe('4,999 kJ');

    for (const key of NUTRIENT_KEYS) {
      expect(figureText(key, { kind: 'not-known' })).not.toMatch(/\d/);
      expect(figureText(key, figureShown(0.04, true))).toBe('not known'); // floors to 0
    }
    expect(figureText('proteinG', figureShown(17.6, true))).toBe('at least 17 g');
    expect(figureText('energyKj', figureShown(5000, false))).toBe('5,000 kJ');
    expect(figureText('sodiumMg', figureShown(1250, false))).toBe('1,250 mg');

    const rows = per100gRows(seedViewFixture());
    expect(rows.map((r) => r.text)).toEqual(ALL.map(() => 'not known'));
    expect(rows.every((r) => !r.known)).toBe(true);
    expect(rows.map((r) => r.label)).toEqual(ALL.map((k) => foods.nutrientNames[k]));
    expect(totalRows({ ...zeros, proteinG: 17.6 }, ['proteinG', 'fatG']).slice(1, 3)).toEqual([
      { key: 'proteinG', label: 'Protein', text: 'at least 17 g', known: false },
      { key: 'fatG', label: 'Fat', text: 'not known', known: false },
    ]);
  });

  it('F9 X4 X5 NU-09 C97: no badge without a number; missing-figure lines; a footer that names only what is shown', () => {
    expect(
      foodBadge({ confidence: 'estimate', nutrients: zeros, unknownNutrients: ALL }),
    ).toBeNull();
    const sevenUnknown = ALL.filter((k) => k !== 'fibreG');
    expect(
      foodBadge({ confidence: 'label', nutrients: zeros, unknownNutrients: sevenUnknown }),
    ).toBe('label');
    // 9 lines loaded and 1 not: every figure is "at least", so the badge stays.
    expect(
      foodBadge({
        confidence: 'estimate',
        nutrients: { ...zeros, energyKj: 900 },
        unknownNutrients: ALL,
      }),
    ).toBe('estimate');
    // Known parts that round down to 0 read "not known" eight times, so no badge either.
    const tiny: Nutrients = {
      energyKj: 0.6,
      proteinG: 0.04,
      fatG: 0.03,
      saturatedFatG: 0.01,
      carbsG: 0.02,
      sugarsG: 0.01,
      fibreG: 0.02,
      sodiumMg: 0.4,
    };
    expect(totalRows(tiny, ALL).map((r) => r.text)).toEqual(ALL.map(() => 'not known'));
    expect(
      foodBadge({ confidence: 'estimate', nutrients: tiny, unknownNutrients: ALL }),
    ).toBeNull();

    const lacking = (...keys: NutrientKey[]) => ({ unknownNutrients: keys });
    expect(ingredientMissingLines([lacking('carbsG'), lacking('carbsG'), lacking()])).toEqual([
      '2 ingredients have no carbohydrate figure yet, so the total is at least what is shown.',
    ]);
    expect(ingredientMissingLines([lacking(...ALL), lacking(...ALL)])).toEqual([
      foods.totals.noneLoaded,
    ]);
    // One line loaded and one not: a line per figure, never "none loaded".
    expect(ingredientMissingLines([lacking(...ALL), lacking()])).toHaveLength(8);
    expect(ingredientMissingLines([lacking(...ALL), lacking()])).not.toContain(
      foods.totals.noneLoaded,
    );

    const none = nutritionFooter(footerForViews([seedViewFixture()]));
    expect(none).toBe(foods.footer.noDatabase);
    expect(none).not.toMatch(DATABASE_NAMES);
    expect(none).not.toMatch(/food composition/i);
    const usda = seedViewFixture({ source: 'usda', unknownNutrients: [] });
    expect(footerForViews([usda])).toEqual({ sources: [], databaseShown: false });
    expect(nutritionFooter(footerForViews([usda], ['usda']), exampleAttribution)).toBe(
      'Database figures are averages from Example database. Label figures are as you typed them, and Estimates are approximate. Your plate will differ.',
    );
    // An approved source is named only when a figure on the screen comes from it.
    const label = seedViewFixture({ source: 'label', unknownNutrients: [] });
    expect(footerForViews([seedViewFixture(), label], ['usda'])).toEqual({
      sources: [],
      databaseShown: false,
    });
    expect(() => nutritionFooter({ sources: ['usda'], databaseShown: true }, {})).toThrow(
      RangeError,
    );
    expect(() =>
      nutritionFooter(
        { sources: ['usda'], databaseShown: true },
        { usda: { name: '', text: 'x' } },
      ),
    ).toThrow(RangeError);
    expect(() => nutritionFooter({ sources: [], databaseShown: true })).toThrow(RangeError);
    expect(footerForEntries([{ confidence: 'database' }], ['usda', 'nz-fcdb'])).toEqual({
      sources: ['usda', 'nz-fcdb'],
      databaseShown: true,
    });
    expect(footerForEntries([{ confidence: 'label' }], ['usda'])).toEqual({
      sources: [],
      databaseShown: false,
    });
  });

  it('C97 N43 HS-37: a Database log entry while no database is approved (a restored backup) is Estimate, with no database footer', () => {
    expect(entryConfidence({ confidence: 'database' }, [])).toBe('estimate');
    expect(entryConfidence({ confidence: 'database' })).toBe('estimate'); // nothing approved yet
    expect(entryConfidence({ confidence: 'database' }, ['usda'])).toBe('database');
    expect(entryConfidence({ confidence: 'label' }, [])).toBe('label');
    expect(footerForEntries([{ confidence: 'database' }])).toEqual({
      sources: [],
      databaseShown: false,
    });
  });

  it('F18 HS-37 C11 C100: differences and ratios of incomplete figures are not known; averages are "at least"', () => {
    const known = (value: number) => ({ value, complete: true });
    const partial = (value: number) => ({ value, complete: false });
    expect(differenceShown(known(9100), partial(7000))).toEqual({ kind: 'not-known' });
    expect(differenceShown(partial(9100), known(7000))).toEqual({ kind: 'not-known' });
    expect(differenceShown(known(9100), known(7000))).toEqual({ kind: 'value', value: 2100 });
    expect(ratioShown(partial(20), known(8000))).toEqual({ kind: 'not-known' });
    expect(ratioShown(known(20), partial(8000))).toEqual({ kind: 'not-known' });
    expect(ratioShown(known(20), known(0))).toEqual({ kind: 'not-known' });
    expect(ratioShown(known(20), known(8000))).toEqual({ kind: 'value', value: 0.0025 });
    expect(averageShown([])).toEqual({ shown: { kind: 'not-known' }, daysMissing: 0 });
    expect(averageShown([known(10), known(20)])).toEqual({
      shown: { kind: 'value', value: 15 },
      daysMissing: 0,
    });
    expect(() => differenceShown(known(Number.NaN), known(1))).toThrow(RangeError);

    // A fixture week: 6 days of catalogue-recipe entries with every figure unknown, 1 label day.
    const recipeDay = {
      energy: partial(0),
      satFat: partial(0),
      badge: foodBadge({ confidence: 'estimate', nutrients: zeros, unknownNutrients: ALL }),
    };
    const labelDay = {
      energy: known(8000),
      satFat: known(14),
      badge: foodBadge({
        confidence: 'label',
        nutrients: { ...zeros, energyKj: 8000, saturatedFatG: 14 },
        unknownNutrients: [],
      }),
    };
    const week = [...Array.from({ length: 6 }, () => recipeDay), labelDay];
    const satFatShare = ratioShown(
      { value: 14, complete: week.every((d) => d.satFat.complete) },
      { value: 8000, complete: week.every((d) => d.energy.complete) },
    );
    expect(satFatShare).toEqual({ kind: 'not-known' });
    const average = averageShown(week.map((d) => d.satFat));
    expect(average).toEqual({ shown: { kind: 'at-least', value: 2 }, daysMissing: 6 });
    expect(figureText('saturatedFatG', average.shown)).toBe('at least 2 g');
    expect(week.filter((d) => d.badge === null)).toHaveLength(6); // the "Not known" count of the mix
    expect(week.filter((d) => d.badge === 'label')).toHaveLength(1);
  });
});
