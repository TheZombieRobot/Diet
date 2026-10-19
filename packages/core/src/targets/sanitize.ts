/**
 * Stored figures brought into range before use (C50, C108; item 21 design section 3.2). A stored
 * value is never trusted: a backup, an older version or a bypass could hold anything the validator
 * lets through, so every consumer clamps it here, and a value that is not a finite number takes
 * the safe fallback. Built early at item 14 (the subset its deficit functions need); item 21 adds
 * the rest of this file.
 */
import {
  FLOOR_KJ,
  KICKSTART_MAX_DEFICIT_PCT,
  MAX_RAISED_FLOOR_KJ,
  NET_CARB_CEILING_G,
  STEADY_DEFICIT_PCT,
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
