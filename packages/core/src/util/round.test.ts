import { describe, expect, it } from 'vitest';
import { assertInRange, roundTo } from './round';

describe('roundTo', () => {
  it.each([
    [1.005, 2, 1.01], // stored as 1.00499999…; plain Math.round gives 1.00
    [2.675, 2, 2.68],
    [0.03945, 2, 0.04],
    [1.30185, 2, 1.3],
    [1.0049, 2, 1],
    [-1.005, 2, -1.01],
    [0, 2, 0],
    [12.5, 0, 13],
  ])('roundTo(%d, %d) = %d', (value, decimals, expected) => {
    expect(roundTo(value, decimals)).toBe(expected);
  });

  it('rejects non-finite values and bad decimal counts', () => {
    expect(() => roundTo(Number.NaN, 2)).toThrow(RangeError);
    expect(() => roundTo(1, -1)).toThrow(RangeError);
    expect(() => roundTo(1, 1.5)).toThrow(RangeError);
  });
});

describe('assertInRange', () => {
  it('accepts the bounds and rejects outside them or NaN', () => {
    expect(() => {
      assertInRange('x', 0, 0, 1);
    }).not.toThrow();
    expect(() => {
      assertInRange('x', 1, 0, 1);
    }).not.toThrow();
    expect(() => {
      assertInRange('x', 1.0001, 0, 1);
    }).toThrow(/x must be between 0 and 1/);
    expect(() => {
      assertInRange('x', Number.NaN, 0, 1);
    }).toThrow(RangeError);
  });
});
