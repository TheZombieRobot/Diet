import { effectiveProteinTarget } from '../targets/protein';
import { assertValidProteinRange, type ProteinRange } from './baseTargets';

/**
 * The day's protein target for a phase (C65): the top of the range during Kickstart ("protein at
 * the top of the range", HEALTH_SAFETY.md section 4), the bottom of it in Steady. 140 g and 120 g
 * with the default 120–140 g range. A range the form checked: an invalid one is refused. The rule
 * itself is the targets engine's effectiveProteinTarget (item 21), so there is one copy of it.
 */
export function effectiveProteinTargetG(
  phase: 'kickstart' | 'steady',
  range: ProteinRange,
): number {
  assertValidProteinRange(range);
  return effectiveProteinTarget(phase, range);
}
