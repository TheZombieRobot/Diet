/**
 * Units of floating-point error (multiples of Number.EPSILON, relative) within which a value counts
 * as exactly half-way. Literal ties such as 1.005 need about 1; the exhaustive standard-drinks grid
 * (every 0.1 mL and 0.1% ABV) needs at most 1. Above about 2, values with 15 significant digits
 * stop rounding correctly, so 2 leaves a margin on both sides.
 */
const TIE_TOLERANCE_EPSILONS = 2;

/**
 * Rounds half away from zero to `decimals` places.
 *
 * Binary floating point stores 1.005 as 1.00499999..., so plain `Math.round(x * 100) / 100` gives
 * 1.00. A value within a couple of units of floating-point error of a half-way point is treated as
 * exactly half-way, which matches the arithmetic a person would do by hand. The tolerance is used
 * only to decide ties: any other value rounds to its nearest neighbour, unchanged by it. Once the
 * tolerance would reach a quarter of the last place (|value| × 10^decimals above about 5.6e14), a
 * stored double no longer has the precision to tell a tie from its neighbours, so exact halves
 * round away from zero and nothing else is nudged. Values too large to carry any digit at
 * `decimals` places (|value| × 10^decimals of 2^52 or more) are returned unchanged. Never
 * returns -0.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`Cannot round ${value}`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
    throw new RangeError(`decimals must be an integer from 0 to 10, got ${decimals}`);
  }
  const factor = 10 ** decimals;
  const scaled = Math.abs(value) * factor;
  if (scaled >= 2 ** 52) return value;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;
  const tolerance = scaled * Number.EPSILON * TIE_TOLERANCE_EPSILONS;
  const tieWindow = tolerance < 0.25 ? tolerance : 0;
  const rounded = (0.5 - fraction <= tieWindow ? floor + 1 : floor) / factor;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/** Throws a RangeError unless `value` is a finite number within [min, max]. */
export function assertInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}, got ${value}`);
  }
}
