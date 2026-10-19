import type { EatingWindow } from '../fasting/eatingWindow';
import { assertInRange } from '../util/round';
import { estimatedDailyEnergy, type EnergyEstimate, type EnergyInputs } from './energyEstimate';

/** Protein target range in g/day: default 120–140, adjustable within 80–200 (PLAN.md section 7). */
export const DEFAULT_PROTEIN_RANGE_G = { min: 120, max: 140 } as const;
export const PROTEIN_LIMITS_G = { min: 80, max: 200 } as const;

export interface ProteinRange {
  min: number;
  max: number;
}

export function assertValidProteinRange(range: ProteinRange): void {
  assertInRange('protein min', range.min, PROTEIN_LIMITS_G.min, PROTEIN_LIMITS_G.max);
  assertInRange('protein max', range.max, range.min, PROTEIN_LIMITS_G.max);
}

export interface BaseTargetsInput extends EnergyInputs {
  proteinRangeG: ProteinRange;
  /**
   * Present because the stored profile carries it. It is deliberately ignored: fasting never
   * removes nutritional needs, so the eating window never changes protein or energy targets
   * (HEALTH_SAFETY.md section 4; HS-22).
   */
  eatingWindow?: EatingWindow | undefined;
}

export interface BaseTargets {
  energyEstimate: EnergyEstimate;
  proteinRangeG: ProteinRange;
}

/**
 * Targets before any phase deficit is applied. The Kickstart and Steady deficits, the energy floor
 * and diet modes are added by the targets engine (checklist item 21).
 */
export function baseTargets(input: BaseTargetsInput): BaseTargets {
  assertValidProteinRange(input.proteinRangeG);
  return {
    energyEstimate: estimatedDailyEnergy(input),
    proteinRangeG: { min: input.proteinRangeG.min, max: input.proteinRangeG.max },
  };
}
