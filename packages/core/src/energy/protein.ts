import { assertValidProteinRange, type ProteinRange } from './baseTargets';

/**
 * The day's protein target for a phase (C65): the top of the range during Kickstart ("protein at
 * the top of the range", HEALTH_SAFETY.md section 4), the bottom of it in Steady. 140 g and 120 g
 * with the default 120–140 g range.
 */
export function effectiveProteinTargetG(
  phase: 'kickstart' | 'steady',
  range: ProteinRange,
): number {
  assertValidProteinRange(range);
  return phase === 'kickstart' ? range.max : range.min;
}
