import { describe, expect, it } from 'vitest';
import { assertInRange, roundTo } from './round';

/** Deterministic pseudo-random numbers in [0, 1), so a failure can be reproduced. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Exact decimal rounding, half away from zero, of the decimal `units / 10^sourceDecimals`. */
function exactRound(units: bigint, sourceDecimals: number, decimals: number): number {
  const negative = units < 0n;
  const magnitude = negative ? -units : units;
  let result: number;
  if (decimals >= sourceDecimals) {
    result = Number(magnitude) / 10 ** sourceDecimals;
  } else {
    const divisor = 10n ** BigInt(sourceDecimals - decimals);
    const quotient = magnitude / divisor;
    const remainder = magnitude % divisor;
    result = Number(2n * remainder >= divisor ? quotient + 1n : quotient) / 10 ** decimals;
  }
  return negative && result !== 0 ? -result : result;
}

describe('roundTo', () => {
  it.each([
    { value: 1.005, decimals: 2, expected: 1.01 }, // stored as 1.00499999…; plain Math.round gives 1.00
    { value: 2.675, decimals: 2, expected: 2.68 },
    { value: 0.03945, decimals: 2, expected: 0.04 },
    { value: 1.30185, decimals: 2, expected: 1.3 },
    { value: 1.0049, decimals: 2, expected: 1 },
    { value: -1.005, decimals: 2, expected: -1.01 },
    { value: 0, decimals: 2, expected: 0 },
    { value: 12.5, decimals: 0, expected: 13 },
    { value: 2 ** 51 + 0.5, decimals: 0, expected: 2 ** 51 + 1 },
  ])('roundTo($value, $decimals) = $expected', ({ value, decimals, expected }) => {
    expect(roundTo(value, decimals)).toBe(expected);
  });

  it('leaves values nowhere near a half-way point unchanged, however many decimals', () => {
    expect(roundTo(68686, 10)).toBe(68686);
    expect(roundTo(200000, 10)).toBe(200000);
    expect(roundTo(900000000.5, 6)).toBe(900000000.5);
  });

  it('returns values too large to carry another digit unchanged, never Infinity', () => {
    expect(roundTo(1e300, 10)).toBe(1e300);
    expect(roundTo(-1e300, 0)).toBe(-1e300);
    expect(roundTo(Number.MAX_VALUE, 2)).toBe(Number.MAX_VALUE);
  });

  it('never returns negative zero (it would display as "-0")', () => {
    expect(Object.is(roundTo(-0.001, 2), 0)).toBe(true);
    expect(Object.is(roundTo(-0.004, 2), 0)).toBe(true);
    expect(Object.is(roundTo(-0, 2), 0)).toBe(true);
    expect(roundTo(-0.005, 2)).toBe(-0.01);
  });

  it('matches exact decimal rounding for values with up to 6 decimals below 1e9, at 0 to 6 places', () => {
    const random = seededRandom(20261019);
    const mismatches: string[] = [];
    for (let i = 0; i < 20_000; i++) {
      const sourceDecimals = Math.floor(random() * 7);
      const sign = random() < 0.5 ? -1n : 1n;
      const units = BigInt(Math.floor(random() * 1e9 * 10 ** sourceDecimals)) * sign;
      const value = Number(units) / 10 ** sourceDecimals;
      const decimals = Math.floor(random() * 7);
      const expected = exactRound(units, sourceDecimals, decimals);
      if (!Object.is(roundTo(value, decimals), expected)) {
        mismatches.push(`roundTo(${value}, ${decimals}) should be ${expected}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('rounds every exact half-way decimal (up to 6 decimals, below 1e9) away from zero', () => {
    const random = seededRandom(17);
    const mismatches: string[] = [];
    for (let i = 0; i < 20_000; i++) {
      const sourceDecimals = 1 + Math.floor(random() * 6);
      const sign = random() < 0.5 ? -1n : 1n;
      const whole = BigInt(Math.floor(random() * 1e9 * 10 ** (sourceDecimals - 1)));
      const units = (whole * 10n + 5n) * sign;
      const value = Number(units) / 10 ** sourceDecimals;
      const expected = exactRound(units, sourceDecimals, sourceDecimals - 1);
      if (!Object.is(roundTo(value, sourceDecimals - 1), expected)) {
        mismatches.push(`roundTo(${value}, ${sourceDecimals - 1}) should be ${expected}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('rejects non-finite values and bad decimal counts', () => {
    expect(() => roundTo(Number.NaN, 2)).toThrow(RangeError);
    expect(() => roundTo(Number.POSITIVE_INFINITY, 2)).toThrow(RangeError);
    expect(() => roundTo(1, -1)).toThrow(RangeError);
    expect(() => roundTo(1, 1.5)).toThrow(RangeError);
    expect(() => roundTo(1, 11)).toThrow(RangeError);
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
