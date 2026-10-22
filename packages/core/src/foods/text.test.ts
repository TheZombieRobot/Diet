import { describe, expect, it } from 'vitest';
import { packsText, seasonRuns, seasonText } from './text';

describe('seasons and packs as words (item 18 design 3.5)', () => {
  it('F12 NU-07: season runs wrap the year and read as month ranges', () => {
    expect(seasonText([9, 10, 11, 12, 1, 2, 3])).toBe('September to March');
    expect(seasonText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('All year');
    expect(seasonText([4, 5, 6, 10, 11])).toBe('April to June and October to November');
    expect(seasonText([7])).toBe('July');
    expect(seasonText([])).toBeNull();
    expect(seasonRuns([1, 2, 6, 7, 11, 12])).toEqual([
      { from: 6, to: 7 },
      { from: 11, to: 2 },
    ]);
    expect(() => seasonRuns([13])).toThrow(RangeError);
  });

  it('F12 C69 C110 GL-03: typical pack sizes with count and container words', () => {
    const bunch = { one: 'bunch', many: 'bunches' };
    expect(packsText({ unit: 'each', sizes: [1], container: null }, true, bunch)).toBe(
      'Sold by the bunch',
    );
    expect(
      packsText({ unit: 'each', sizes: [6, 12], container: null }, false, {
        one: 'egg',
        many: 'eggs',
      }),
    ).toBe('Packs of 6 or 12 eggs');
    const bag = { one: 'bag', many: 'bags' };
    expect(packsText({ unit: 'g', sizes: [500, 1000], container: bag }, true, null)).toBe(
      '500 g or 1 kg bags, also sold loose',
    );
    expect(
      packsText(
        { unit: 'ml', sizes: [1000, 2000], container: { one: 'bottle', many: 'bottles' } },
        false,
        null,
      ),
    ).toBe('1 L or 2 L bottles');
    expect(
      packsText({ unit: 'g', sizes: [400], container: { one: 'can', many: 'cans' } }, false, null),
    ).toBe('400 g cans');
    expect(packsText({ unit: 'g', sizes: [1500], container: null }, false, null)).toBe('1.5 kg');
    expect(() => packsText({ unit: 'each', sizes: [1], container: null }, false, null)).toThrow(
      RangeError,
    );
  });
});
