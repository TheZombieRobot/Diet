/**
 * The electrolyte card's lines and the numbers the targets copy states (item 21 design section
 * 3.11; C72, C102; T22). The card itself is item 22's.
 */
import { DEFAULT_PROTEIN_RANGE_G, PROTEIN_LIMITS_G } from '../energy/baseTargets';
import {
  FIBRE_GUIDE_G,
  FLOOR_KJ,
  KICKSTART_MAX_DEFICIT_PCT,
  KICKSTART_NET_CARBS_G,
  MAX_RAISED_FLOOR_KJ,
  MODERATE_NET_CARB_CEILING_G,
  NET_CARB_CEILING_G,
  SAT_FAT_BUDGET_PCT,
  STEADY_DEFICIT_PCT,
  WATER_TARGET_ML,
} from '../storage/limits';
import type { ReadinessGates } from '../storage/readiness';
import { ESTIMATE_LIMITS, ESTIMATE_WEIGHT_STALE_DAYS } from './constants';

/**
 * The electrolyte card's lines, in order. The blood-pressure line (item 13's
 * readiness.bloodPressure.electrolyte) is included whenever gates.bloodPressureSaltWording: answer
 * 4 "yes" or unanswered (C102, C41).
 */
export function electrolyteCopyKeys(
  gates: Pick<ReadinessGates, 'bloodPressureSaltWording'>,
): readonly ('body' | 'bloodPressure')[] {
  return gates.bloodPressureSaltWording ? ['body', 'bloodPressure'] : ['body'];
}

/** The numbers the targets copy states, from the constants, for the copy test (C-2). */
export const TARGET_COPY_FACTS = Object.freeze({
  floorKj: FLOOR_KJ,
  maxFloorKj: MAX_RAISED_FLOOR_KJ,
  kickstartMaxPct: KICKSTART_MAX_DEFICIT_PCT,
  steady: STEADY_DEFICIT_PCT,
  keto: NET_CARB_CEILING_G,
  moderate: MODERATE_NET_CARB_CEILING_G,
  kickstartCarbsG: KICKSTART_NET_CARBS_G,
  protein: Object.freeze({ limits: PROTEIN_LIMITS_G, defaults: DEFAULT_PROTEIN_RANGE_G }),
  satFat: SAT_FAT_BUDGET_PCT,
  fibre: FIBRE_GUIDE_G,
  water: WATER_TARGET_ML,
  staleWeightDays: ESTIMATE_WEIGHT_STALE_DAYS,
  estimateLimits: ESTIMATE_LIMITS,
});
