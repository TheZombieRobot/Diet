/**
 * Stored figures brought into range before use (C50, C108; item 21 design section 3.2; T8). A
 * stored value is never trusted: a backup, an older version or a bypass could hold anything the
 * validator lets through, so every consumer clamps it here, toward the safe side, and a value that
 * is not a finite number takes the safe fallback. Nothing here throws on a stored value. Forms and
 * import still refuse such values rather than clamping them (C50).
 */
import {
  ACTIVITY_FACTORS,
  type ActivityLevel,
  DEFAULT_ACTIVITY_LEVEL,
} from '../energy/energyEstimate';
import {
  DEFAULT_PROTEIN_RANGE_G,
  PROTEIN_LIMITS_G,
  type ProteinRange,
} from '../energy/baseTargets';
import {
  FIBRE_GUIDE_G,
  FLOOR_KJ,
  KICKSTART_MAX_DEFICIT_PCT,
  MAX_RAISED_FLOOR_KJ,
  MODERATE_NET_CARB_CEILING_G,
  NET_CARB_CEILING_G,
  SAT_FAT_BUDGET_PCT,
  STEADY_DEFICIT_PCT,
  WATER_TARGET_ML,
} from '../storage/limits';

/** `x` within [min, max]; `fallback` when x is not a finite number. */
export function clampNumber<F>(x: number, min: number, max: number, fallback: F): number | F {
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback;
}

/** The energy floor: 5,000 kJ, or the owner's raised floor up to 20,000 (C50, C108). */
export function safeFloorKj(stored: number): number {
  return clampNumber(stored, FLOOR_KJ, MAX_RAISED_FLOOR_KJ, FLOOR_KJ);
}

/** The Kickstart deficit, 0–30%; a value that is not a number gives the smallest deficit, 0. */
export function safeKickstartDeficitPct(stored: number): number {
  return clampNumber(stored, 0, KICKSTART_MAX_DEFICIT_PCT, 0);
}

/** The Steady deficit, 15–20% (WT-08); a value that is not a number gives the default, 15. */
export function safeSteadyDeficitPct(stored: number): number {
  return clampNumber(
    stored,
    STEADY_DEFICIT_PCT.min,
    STEADY_DEFICIT_PCT.max,
    STEADY_DEFICIT_PCT.default,
  );
}

/** The owner's own keto net-carb ceiling, 20–50 g; a value that is not a number gives 30 (C61). */
export function safeKetoCeilingG(stored: number): number {
  return clampNumber(
    stored,
    NET_CARB_CEILING_G.min,
    NET_CARB_CEILING_G.max,
    NET_CARB_CEILING_G.default,
  );
}

/** The moderate low-carb ceiling, 50–130 g; a value that is not a number gives 100 (C70). */
export function safeModerateCeilingG(stored: number): number {
  return clampNumber(
    stored,
    MODERATE_NET_CARB_CEILING_G.min,
    MODERATE_NET_CARB_CEILING_G.max,
    MODERATE_NET_CARB_CEILING_G.default,
  );
}

/** The saturated-fat budget, 5–10% of the day's planned energy; otherwise 10 (C71). */
export function safeSatFatPct(stored: number): number {
  return clampNumber(
    stored,
    SAT_FAT_BUDGET_PCT.min,
    SAT_FAT_BUDGET_PCT.max,
    SAT_FAT_BUDGET_PCT.default,
  );
}

/**
 * The protein range within 80–200 g, with the top never below the bottom (a minimum above the
 * maximum gives max = min); a value that is not a number gives the default 120 or 140 (C65).
 */
export function safeProteinRange(range: ProteinRange): ProteinRange {
  const min = clampNumber(
    range.min,
    PROTEIN_LIMITS_G.min,
    PROTEIN_LIMITS_G.max,
    DEFAULT_PROTEIN_RANGE_G.min,
  );
  const max = clampNumber(
    range.max,
    min,
    PROTEIN_LIMITS_G.max,
    Math.max(min, DEFAULT_PROTEIN_RANGE_G.max),
  );
  return { min, max };
}

/** The owner's fibre guide, 10–70 g; null (and a value that is not a number) means the NRV default. */
export function safeFibreOverrideG(stored: number | null): number | null {
  return stored === null ? null : clampNumber(stored, FIBRE_GUIDE_G.min, FIBRE_GUIDE_G.max, null);
}

/** The owner's water guide, 1,000–6,000 mL; null (and a value that is not a number) means the default. */
export function safeWaterOverrideMl(stored: number | null): number | null {
  return stored === null
    ? null
    : clampNumber(stored, WATER_TARGET_ML.min, WATER_TARGET_ML.max, null);
}

/** The stored activity level when it is one of ACTIVITY_FACTORS; otherwise the documented default. */
export function safeActivityLevel(stored: string): ActivityLevel {
  return Object.hasOwn(ACTIVITY_FACTORS, stored)
    ? (stored as ActivityLevel)
    : DEFAULT_ACTIVITY_LEVEL;
}
