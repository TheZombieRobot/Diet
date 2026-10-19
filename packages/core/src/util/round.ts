/**
 * Rounds half away from zero to `decimals` places.
 *
 * Binary floating point stores 1.005 as 1.00499999..., so plain `Math.round(x * 100) / 100` gives
 * 1.00. Values within a few units of floating-point error of a half-way point are treated as
 * exactly half-way, which matches the arithmetic a person would do by hand.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`Cannot round ${value}`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
    throw new RangeError(`decimals must be an integer from 0 to 10, got ${decimals}`);
  }
  const factor = 10 ** decimals;
  const scaled = Math.abs(value) * factor;
  const nudge = scaled * Number.EPSILON * 8;
  const rounded = Math.round(scaled + nudge) / factor;
  return value < 0 ? -rounded : rounded;
}

/** Throws a RangeError unless `value` is a finite number within [min, max]. */
export function assertInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}, got ${value}`);
  }
}
