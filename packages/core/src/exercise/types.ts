/**
 * The exercise dataset's shape (checklist item 26; item 26 design section 2.2). Every field is
 * always present, and an absent value is null, as in stored records (storage spec section 2.1).
 * The data itself is packages/core/data/exercises.json, checked by validate.ts.
 */
import type { move } from '../copy/health';
import type { SeedId } from '../storage/primitives';
import type { SessionMovement, WeeklyPatternDay } from '../storage/records';

/** The stored variant enum (storage spec section 4.9). */
export type VariantKey = SessionMovement['variant'];
/** Display order of the variant switch. */
export const VARIANT_KEYS = Object.freeze([
  'easier',
  'standard',
  'harder',
  'band',
  'dumbbell',
] as const satisfies readonly VariantKey[]);
export type Equipment = 'band' | 'dumbbell';
export type ExerciseGroup = 'warm-up' | 'mobility' | 'lower' | 'upper' | 'core' | 'beach';
export type ExerciseUnit = 'reps' | 'seconds';
export type ExerciseTag = 'beach' | 'jog';
/** The safety wording an exercise links to: the keys of move.safety in health.ts. */
export type MoveSafetyKey = keyof typeof move.safety;
/** Progression and rounding unit: 1 rep, or seconds. */
export type ExerciseStep = 1 | 5 | 10 | 30 | 60;

export interface Variant {
  /** Text 1–40, shown on the variant switch. */
  readonly name: string;
  /** One sentence, Text 1–140: the set-up for this variant. */
  readonly how: string;
  /** Reps or seconds are per side. */
  readonly perSide: boolean;
}

export interface Exercise {
  /** 'seed:ex-<slug>'. Permanent: stored sessions refer to it (constants.ts). */
  readonly id: SeedId;
  /** Text 1–40. */
  readonly name: string;
  readonly group: ExerciseGroup;
  readonly unit: ExerciseUnit;
  readonly step: ExerciseStep;
  /** Needed by every variant (only the band pull-apart). */
  readonly requires: Equipment | null;
  readonly tags: readonly ExerciseTag[];
  /** The first is always 'stopRules' (EX-01 "stop-rule link"). */
  readonly safetyKeys: readonly MoveSafetyKey[];
  /** 2–3 form cues, each Text 1–90 ending in ".". */
  readonly cues: readonly string[];
  readonly variants: {
    readonly easier: Variant;
    readonly standard: Variant;
    readonly harder: Variant;
    readonly band: Variant | null;
    readonly dumbbell: Variant | null;
  };
}

export type TemplateKind = 'strength' | 'walk' | 'jog';
export type Block = 'warmUp' | 'main' | 'coolDown';
export const BLOCKS = Object.freeze(['warmUp', 'main', 'coolDown'] as const satisfies Block[]);

export interface TemplateSlot {
  readonly exerciseId: SeedId;
  /** Never harder, band or dumbbell: bodyweight is the default (DECISIONS). */
  readonly startVariant: 'easier' | 'standard';
  /** 1–10. */
  readonly sets: number;
  /** Reps or seconds per set (per side when the variant is per side). */
  readonly min: number;
  readonly max: number;
  /** Between sets; 0–180, a multiple of 15. */
  readonly restSeconds: number;
  /** The slot appears only when that equipment toggle is on. */
  readonly onlyWith: Equipment | null;
}

export interface SessionTemplate {
  /** 'seed:session-<slug>'. Permanent: stored sessions and weekly plans refer to it. */
  readonly id: SeedId;
  /** Text 1–30. */
  readonly name: string;
  /** Text 1–4, the week-strip chip. */
  readonly shortLabel: string;
  readonly kind: TemplateKind;
  readonly tags: readonly 'beach'[];
  /** Text 1–90. */
  readonly summary: string;
  readonly warmUp: readonly TemplateSlot[];
  readonly main: readonly TemplateSlot[];
  readonly coolDown: readonly TemplateSlot[];
}

export interface ExerciseData {
  readonly datasetVersion: 1;
  readonly exercises: readonly Exercise[];
  readonly templates: readonly SessionTemplate[];
  /** The stored shape, so a default and a stored week compare directly. */
  readonly defaultWeek: readonly WeeklyPatternDay[];
}

/** The two profile toggles (profile.equipmentBands, profile.equipmentDumbbells). */
export interface EquipmentToggles {
  readonly bands: boolean;
  readonly dumbbells: boolean;
}
