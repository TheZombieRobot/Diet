/**
 * The protein figures (C65; HS-22, HS-25; item 21 design section 3.3). The only inputs are which
 * set of figures applies and the stored range: there is no window, deficit, floor or energy input,
 * so protein never trades against energy and never changes with the eating window.
 */
import type { ProteinRange } from '../energy/baseTargets';
import { safeProteinRange } from './sanitize';

/**
 * Which set of figures applies today. Not the weight phase: a Kickstart can be running while the
 * figures are Steady (paused or suspended; dayTargets).
 */
export type TargetFigures = 'kickstart' | 'steady';

export interface ProteinTargets {
  /** The stored range brought into 80–200 g (safeProteinRange). */
  readonly rangeG: ProteinRange;
  /** What a meal is checked against: the top of the range with Kickstart figures, else the bottom. */
  readonly checkTargetG: number;
  readonly basis: 'range-top' | 'range-bottom';
}

/**
 * The protein check target (C65; DECISIONS): the top of the range with Kickstart figures ("protein
 * at the top of the range", HEALTH_SAFETY section 4), the bottom of it otherwise. 140 g and 120 g
 * with the default range; an edited 90–110 g range gives 110 g and 90 g. The range is brought into
 * its limits first, so a stored value never throws here.
 */
export function effectiveProteinTarget(figures: TargetFigures, range: ProteinRange): number {
  const safe = safeProteinRange(range);
  return figures === 'kickstart' ? safe.max : safe.min;
}

/** The range in use and the check target (the planner aims inside the range; item 22). */
export function proteinTargets(figures: TargetFigures, stored: ProteinRange): ProteinTargets {
  return {
    rangeG: safeProteinRange(stored),
    checkTargetG: effectiveProteinTarget(figures, stored),
    basis: figures === 'kickstart' ? 'range-top' : 'range-bottom',
  };
}
