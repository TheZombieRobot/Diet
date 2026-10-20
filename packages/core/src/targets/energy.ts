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

// ---- Item 21 design 3.4.5, added early by item 18 (X8): the floor check for planned days ----

/** What wrote, or is about to write, the planned day. Only 'owner-meal' may go below the floor. */
export type PlanWriteKind =
  | 'owner-meal' // the owner adds, edits or removes one meal, picking the recipe or typing the entry themselves
  | 'auto-fill' // the planner fills one or more slots
  | 'copy' // copy a day or a week
  | 'template' // apply a saved template
  | 'repeat' // repeat a day
  | 'suggested-swap'; // accept a swap or suggestion the app offered

export type FloorCheck =
  | { readonly ok: true; readonly belowFloor: false; readonly floorKj: number }
  /** owner-meal: allowed, with targets.plannerFloor.manualBelow. */
  | { readonly ok: true; readonly belowFloor: true; readonly floorKj: number }
  /** Anything else: refused, with targets.plannerFloor.refused. */
  | { readonly ok: false; readonly reason: 'below-floor'; readonly floorKj: number };

/**
 * HS-10, NU-06, C108: a planned day below the owner's effective floor (5,000 kJ, or their raised
 * floor) is refused for every write the app makes; only the owner's own meal may go below it, with
 * a warning. The kind is closed and defaults to refusal, so no caller can label an app-made day
 * the owner's: an unknown kind at run time is refused.
 */
export function floorCheck(
  foodKj: number,
  storedFloorKj: number,
  kind: PlanWriteKind = 'auto-fill',
): FloorCheck {
  if (!Number.isFinite(foodKj) || foodKj < 0)
    throw new RangeError('foodKj must be a finite number of at least 0');
  const floorKj = safeFloorKj(storedFloorKj);
  if (foodKj >= floorKj) return { ok: true, belowFloor: false, floorKj };
  switch (kind) {
    case 'owner-meal':
      return { ok: true, belowFloor: true, floorKj };
    default:
      return { ok: false, reason: 'below-floor', floorKj };
  }
}
