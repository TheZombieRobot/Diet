/**
 * Safety and range constants (storage spec section 4.3; DOC_REVIEW C50). They are never stored:
 * stored values are bounded by them, and every consumer in core still computes with
 * max(FLOOR_KJ, stored) and min(cap, stored), so no stored value can lower a safety constant
 * (C50, C108). Re-exported from the core index; the targets engine (item 21) imports the same
 * constants. Each is part of the spec fingerprint (VALIDATOR_CONSTANTS, section 9.2), so changing
 * one needs a new schema version.
 */
import { MAX_PLANNED_FAST_HOURS } from '../fasting/eatingWindow';

/** The planner never plans below this (HS-10, HS-25, C50, C108). */
export const FLOOR_KJ = 5000;
/** The owner's optional floor can only go up, to at most this (C108). */
export const MAX_RAISED_FLOOR_KJ = 20000;
/** Kickstart deficit cap, % below the estimate (HS-25, C61). */
export const KICKSTART_MAX_DEFICIT_PCT = 30;
/** Steady deficit range (DECISIONS C55/C61/C65 row; C45). */
export const STEADY_DEFICIT_PCT = Object.freeze({ min: 15, max: 20, default: 15 });
/** Net carbs during Kickstart (DECISIONS Kickstart row; C45). */
export const KICKSTART_NET_CARBS_G = 20;
/** The owner's own keto ceiling (HEALTH_SAFETY section 4). */
export const NET_CARB_CEILING_G = Object.freeze({ min: 20, max: 50, default: 30 });
/** The moderate low-carb ceiling (C70). Balanced mode has no ceiling. */
export const MODERATE_NET_CARB_CEILING_G = Object.freeze({ min: 50, max: 130, default: 100 });
/** The stored fibre-guide override; null means the NRV default by sex (item 21; C70). */
export const FIBRE_GUIDE_G = Object.freeze({ min: 10, max: 70 });
/** The stored water-target override; null means the sex-based default (item 21; C70). */
export const WATER_TARGET_ML = Object.freeze({ min: 1000, max: 6000 });
export const KICKSTART_DAYS = 21;
export const KICKSTART_EXTENSION_DAYS = 7;
/** Extensions across all Kickstart periods (DECISIONS C08 row). */
export const KICKSTART_MAX_EXTENSIONS = 3;
/** Kickstart days across all periods: "six weeks in all" (DECISIONS C08 row; D27). */
export const KICKSTART_MAX_TOTAL_DAYS = 42;
/** The extension is offered and checked only in the last 3 local days (C59; D28). */
export const KICKSTART_OFFER_DAYS = 3;
/** Saturated-fat budget, % of the day's planned energy (HEALTH_SAFETY section 4; C71). */
export const SAT_FAT_BUDGET_PCT = Object.freeze({ min: 5, max: 10, default: 10 });
/** Rapid-loss card threshold in whole grams a week (C46; D26). It can only be made more sensitive. */
export const RAPID_LOSS_THRESHOLD_G_PER_WEEK = Object.freeze({
  min: 750,
  max: 1000,
  step: 50,
  default: 1000,
});
/** Consecutive weeks for the rapid-loss card (C46; D26). */
export const RAPID_LOSS_WEEKS = Object.freeze({
  values: Object.freeze([2, 3] as const),
  default: 3 as const,
});
/** Drinks before the cut-over count toward the previous evening (C21; D7). */
export const DRINKING_DAY_CUTOVER_MINUTES = Object.freeze({
  min: 0,
  max: 360,
  step: 30,
  default: 300,
});
/** The longest fast the app plans (HEALTH_SAFETY section 3; C30). */
export const MAX_PLANNED_FAST_MINUTES = MAX_PLANNED_FAST_HOURS * 60;
/** A relayed grocery list expires after 15 minutes (DECISIONS relay row; C52). */
export const RELAY_TTL_MS = 900_000;
/** Fixed for ever, so a later rise of the export figure never locks out an older backup (C99). */
export const PBKDF2_IMPORT_MIN_ITERATIONS = 600_000;
/** OWASP 2023 figure (C99). May rise in a later version. */
export const PBKDF2_EXPORT_ITERATIONS = 600_000;
/** Keeps a doctored file from hanging the phone. May rise, never fall. */
export const PBKDF2_MAX_ITERATIONS = 10_000_000;
/** 50 MiB (section 10.6). */
export const MAX_BACKUP_FILE_BYTES = 52_428_800;

/** Per-100 g limits for a single food (ingredients and override nutrition; section 4.3). */
export const NUTRIENT_LIMITS_PER_100G = Object.freeze({
  energyKj: 3800,
  proteinG: 100,
  fatG: 100,
  saturatedFatG: 100,
  carbsG: 100,
  sugarsG: 100,
  fibreG: 100,
  sodiumMg: 40000,
});

/** Per-item limits (a recipe serve or a logged entry; section 4.3). */
export const NUTRIENT_LIMITS_PER_ITEM = Object.freeze({
  energyKj: 50000,
  proteinG: 1000,
  fatG: 1000,
  saturatedFatG: 1000,
  carbsG: 2000,
  sugarsG: 2000,
  fibreG: 500,
  sodiumMg: 100000,
});
