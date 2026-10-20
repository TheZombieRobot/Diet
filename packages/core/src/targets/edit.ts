/**
 * Form parsing for the Diet and targets screen (C50: refuse, never clamp; item 21 design section
 * 3.12; T18). The repository validators still refuse anything out of range at write time.
 */
import { PROTEIN_LIMITS_G } from '../energy/baseTargets';
import {
  FIBRE_GUIDE_G,
  FLOOR_KJ,
  MAX_RAISED_FLOOR_KJ,
  MODERATE_NET_CARB_CEILING_G,
  NET_CARB_CEILING_G,
  WATER_TARGET_ML,
} from '../storage/limits';

export type TargetField =
  | 'proteinMin'
  | 'proteinMax'
  | 'netCarbCeilingG'
  | 'moderateNetCarbCeilingG'
  | 'energyFloorKj'
  | 'fibreGuideG'
  | 'waterTargetMl';

export type TargetEditError =
  | { readonly kind: 'whole-number' }
  | { readonly kind: 'range'; readonly min: number; readonly max: number }
  | { readonly kind: 'floor-too-low' }
  | { readonly kind: 'floor-too-high' }
  | { readonly kind: 'min-above-max' };

export type TargetEdit =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly error: TargetEditError };

const RANGES: Readonly<Record<TargetField, { readonly min: number; readonly max: number }>> = {
  proteinMin: PROTEIN_LIMITS_G,
  proteinMax: PROTEIN_LIMITS_G,
  netCarbCeilingG: NET_CARB_CEILING_G,
  moderateNetCarbCeilingG: MODERATE_NET_CARB_CEILING_G,
  energyFloorKj: { min: FLOOR_KJ, max: MAX_RAISED_FLOOR_KJ },
  fibreGuideG: FIBRE_GUIDE_G,
  waterTargetMl: WATER_TARGET_ML,
};

/** The fields where an empty entry means "use the default" (stored as null). */
const OPTIONAL: ReadonlySet<TargetField> = new Set(['fibreGuideG', 'waterTargetMl']);

/** Plain digits, or digits grouped by thousands ("5,000"). */
const WHOLE = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;

/**
 * A field's text as a whole number inside its range, or why not. Decimals, signs, units and
 * exponents are refused; nothing is ever clamped.
 */
export function parseTargetEdit(field: TargetField, text: string): TargetEdit {
  const trimmed = text.trim();
  if (trimmed === '' && OPTIONAL.has(field)) return { ok: true, value: null };
  if (!WHOLE.test(trimmed)) return { ok: false, error: { kind: 'whole-number' } };
  const value = Number(trimmed.replaceAll(',', ''));
  const { min, max } = RANGES[field];
  if (field === 'energyFloorKj') {
    if (value < min) return { ok: false, error: { kind: 'floor-too-low' } };
    if (value > max) return { ok: false, error: { kind: 'floor-too-high' } };
  } else if (value < min || value > max) {
    return { ok: false, error: { kind: 'range', min, max } };
  }
  return { ok: true, value };
}

/** The protein pair: the lowest figure may not be above the highest. */
export function checkProteinPair(min: number, max: number): TargetEditError | null {
  return min > max ? { kind: 'min-above-max' } : null;
}
