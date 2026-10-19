/**
 * The net-carb ceiling in effect (HEALTH_SAFETY section 4; C06, C45, C61, C70; D30 as overridden;
 * item 21 design section 3.5; T5, T6). The stored ceilings are kept whatever is shown (RD-06); this
 * decides which, if any, applies today.
 */
import { KICKSTART_NET_CARBS_G, NET_CARB_CEILING_G } from '../storage/limits';
import type { DietMode } from '../storage/records';
import type { TargetFigures } from './protein';
import { safeKetoCeilingG, safeModerateCeilingG } from './sanitize';

export type NetCarbCeiling =
  | {
      readonly kind: 'ceiling';
      readonly grams: number;
      readonly basis: 'kickstart' | 'keto' | 'keto-held-at-50' | 'moderate';
    }
  | { readonly kind: 'none'; readonly basis: 'balanced' | 'readiness' };

/**
 * First match: balanced mode has no ceiling; every ceiling is off while readiness closes the keto
 * ceiling (answers 1, 2 and 5, in any mode; T5); keto with Kickstart figures is 20 g; keto with
 * answer 3 and no prescriber confirmation is held at 50 g, including during a running Kickstart
 * (T6); keto otherwise is the owner's own ceiling (after Kickstart, and during a stop-sign pause);
 * moderate low-carb is its own ceiling, never below 50 g.
 */
export function effectiveNetCarbCeiling(input: {
  readonly dietMode: DietMode;
  readonly figures: TargetFigures;
  readonly ketoCeilingAvailable: boolean;
  readonly carbCeilingBelow50Allowed: boolean;
  readonly netCarbCeilingG: number;
  readonly moderateNetCarbCeilingG: number;
}): NetCarbCeiling {
  if (input.dietMode === 'balanced') return { kind: 'none', basis: 'balanced' };
  if (!input.ketoCeilingAvailable) return { kind: 'none', basis: 'readiness' };
  if (input.dietMode === 'keto') {
    if (!input.carbCeilingBelow50Allowed) {
      return { kind: 'ceiling', grams: NET_CARB_CEILING_G.max, basis: 'keto-held-at-50' };
    }
    if (input.figures === 'kickstart') {
      return { kind: 'ceiling', grams: KICKSTART_NET_CARBS_G, basis: 'kickstart' };
    }
    return { kind: 'ceiling', grams: safeKetoCeilingG(input.netCarbCeilingG), basis: 'keto' };
  }
  return {
    kind: 'ceiling',
    grams: safeModerateCeilingG(input.moderateNetCarbCeilingG),
    basis: 'moderate',
  };
}
