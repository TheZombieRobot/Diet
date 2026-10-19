/**
 * The day's deficit and energy figure (HS-10, HS-25, C50, C61, C108; WT-06, WT-07, WT-08; item 21
 * design sections 3.4.3 and 3.4.4). Built early at item 14, the one copy: item 21 adds the weight
 * basis, the rough guide and the planner figures to this file.
 *
 * - The deficit is never above 30% and the Steady deficit always lies in 15–20%, whatever is stored.
 * - The Kickstart deficit applies only while Kickstart may run: keto mode and every Kickstart gate
 *   open (kickstartConditionsHold). A caller that passes Kickstart figures on time alone, with a
 *   gate closed, gets the Steady deficit (item 14 design section 3.8).
 * - The target never goes below the energy floor, and there is no protein input: protein is never
 *   traded for energy (WT-06).
 */
import type { DietMode } from '../storage/records';
import { KICKSTART_MAX_DEFICIT_PCT } from '../storage/limits';
import { assertInRange } from '../util/round';
import { kickstartConditionsHold, type PhaseGates } from '../weight/phase';
import {
  clampNumber,
  safeFloorKj,
  safeKickstartDeficitPct,
  safeSteadyDeficitPct,
} from './sanitize';

/** Why there is no rough guide to plan from (item 21 design section 3.4.2). */
export type EstimateUnavailable =
  | 'not-estimated'
  | 'missing-height'
  | 'missing-birth-year'
  | 'missing-weight'
  | 'age-out-of-range'
  | 'height-out-of-range'
  | 'weight-out-of-range';

export interface DeficitChoice {
  readonly pct: number;
  readonly basis: 'kickstart' | 'steady' | 'none-readiness' | 'none-stop-sign';
}

/**
 * The deficit for the day. First match: no deficit when readiness closes it (C06, C56, C61); none
 * while a stop-sign pauses Kickstart (item 21 T27); the stored Kickstart deficit, capped at 30%,
 * only with Kickstart figures while kickstartConditionsHold; otherwise the Steady deficit, 15–20%.
 */
export function effectiveDeficit(input: {
  readonly figures: 'kickstart' | 'steady';
  readonly dietMode: DietMode;
  readonly gates: PhaseGates;
  readonly stopSignPause: boolean;
  readonly kickstartDeficitPct: number;
  readonly steadyDeficitPct: number;
}): DeficitChoice {
  if (!input.gates.deficitAllowed) return { pct: 0, basis: 'none-readiness' };
  if (input.stopSignPause) return { pct: 0, basis: 'none-stop-sign' };
  if (input.figures === 'kickstart' && kickstartConditionsHold(input.dietMode, input.gates)) {
    return { pct: safeKickstartDeficitPct(input.kickstartDeficitPct), basis: 'kickstart' };
  }
  return { pct: safeSteadyDeficitPct(input.steadyDeficitPct), basis: 'steady' };
}

export type DayEnergy =
  | {
      readonly kind: 'target';
      readonly targetKj: number;
      readonly estimateKj: number;
      readonly deficit: DeficitChoice;
      readonly floorKj: number;
      readonly clampedToFloor: boolean;
      readonly estimateBelowFloor: boolean;
    }
  | {
      readonly kind: 'no-estimate';
      readonly reason: EstimateUnavailable;
      readonly floorKj: number;
    };

/**
 * The day's energy figure from the rough guide: the estimate less the deficit, rounded up to a
 * whole kJ so the real deficit is never more than its percentage, and never below the floor. The
 * percentage is capped at 30% again here, so a hand-built DeficitChoice cannot pass the cap.
 */
export function dayEnergyFor(
  estimateKj: number,
  deficit: DeficitChoice,
  storedFloorKj: number,
): DayEnergy {
  assertInRange('estimateKj', estimateKj, 1, 100_000);
  const floorKj = safeFloorKj(storedFloorKj);
  const pct = clampNumber(deficit.pct, 0, KICKSTART_MAX_DEFICIT_PCT, 0);
  const raw = Math.ceil((estimateKj * (100 - pct)) / 100);
  return {
    kind: 'target',
    targetKj: Math.max(floorKj, raw),
    estimateKj,
    deficit,
    floorKj,
    clampedToFloor: raw < floorKj,
    estimateBelowFloor: estimateKj < floorKj,
  };
}
