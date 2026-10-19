/**
 * The BMI 18.5 floor (HEALTH_SAFETY.md section 2; HS-01 floor part; C04) and the low-weight check
 * that applies readiness answer 5's settings to a current weight below it (HS-35; item 13 E47).
 *
 * Both use one exact rule in whole tenths, so the goal floor and the low-weight check can never
 * disagree about the same number: the weight is rounded down and the height up to a tenth, then
 * compared in integer arithmetic. A form only accepts one decimal place, so rounding matters only
 * for a value from an imported file, which is then judged on the strict side. The floor figure
 * and the BMI itself are never shown to the owner.
 */
import { assertInRange } from '../util/round';

export const BMI_FLOOR = 18.5;

/** The profile's height range (storage spec section 4.4). */
const HEIGHT_CM = { min: 120, max: 230 } as const;

/** 18.5 × (cm / 100)², unrounded. RangeError outside 120–230 cm (the profile's range). */
export function bmiFloorKg(heightCm: number): number {
  assertInRange('heightCm', heightCm, HEIGHT_CM.min, HEIGHT_CM.max);
  const metres = heightCm / 100;
  return BMI_FLOOR * metres * metres;
}

/**
 * A value as a whole number of tenths: exact when it is already a tenth (64.1 → 641, despite the
 * binary error in 64.1 × 10); otherwise rounded down or up.
 */
export function toTenths(value: number, direction: 'down' | 'up'): number {
  const tenths = value * 10;
  const nearest = Math.round(tenths);
  if (Math.abs(tenths - nearest) < 1e-6) return nearest;
  return direction === 'down' ? Math.floor(tenths) : Math.ceil(tenths);
}

/** True when kg is at or above BMI 18.5 for heightCm, in exact integer arithmetic. */
export function meetsBmiFloor(kg: number, heightCm: number): boolean {
  assertInRange('heightCm', heightCm, HEIGHT_CM.min, HEIGHT_CM.max);
  const g = toTenths(kg, 'down');
  const h = toTenths(heightCm, 'up');
  // kg ≥ 18.5 × (cm / 100)²  ⇔  (g / 10) × 10⁴ ≥ 18.5 × (h / 10)²  ⇔  g × 10⁶ ≥ 185 × h².
  // Both sides stay safe integers: h ≤ 2300.
  return g * 1_000_000 >= 185 * h * h;
}

/**
 * True when both are known, the height is within 120–230 cm, and the weight is below BMI 18.5 for
 * it. A height outside the range is never stored (the profile form reports it as an error before
 * gates are computed from it), so it gives false rather than a guess.
 */
export function isLowWeight(weightKg: number | null, heightCm: number | null): boolean {
  if (weightKg === null || heightCm === null) return false;
  if (!(heightCm >= HEIGHT_CM.min && heightCm <= HEIGHT_CM.max)) return false;
  return !meetsBmiFloor(weightKg, heightCm);
}
