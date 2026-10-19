/**
 * Which versions of a movement can be chosen (DECISIONS "Equipment default: bodyweight"; C112;
 * HEALTH_SAFETY.md section 6; HS-29). Bodyweight is the default: band and dumbbell versions need
 * their Settings toggle, and a lighter session offers only the easier version.
 */
import { exerciseById } from './lookup';
import {
  type EquipmentToggles,
  type Exercise,
  type ExerciseData,
  type TemplateSlot,
  type Variant,
  type VariantKey,
} from './types';

const toggleFor = (equipment: EquipmentToggles, needs: 'band' | 'dumbbell'): boolean =>
  needs === 'band' ? equipment.bands : equipment.dumbbells;

/**
 * The versions the variant switch offers, in VARIANT_KEYS order. This is the only source for the
 * switch. An exercise that needs equipment that is switched off offers nothing; a lighter session
 * offers only 'easier', so it can never be switched back up (HS-29).
 */
export function sessionVariants(
  exercise: Exercise,
  equipment: EquipmentToggles,
  mode: 'planned' | 'lighter',
): VariantKey[] {
  if (exercise.requires !== null && !toggleFor(equipment, exercise.requires)) return [];
  if (mode === 'lighter') return ['easier'];
  const keys: VariantKey[] = ['easier', 'standard', 'harder'];
  if (equipment.bands && exercise.variants.band !== null) keys.push('band');
  if (equipment.dumbbells && exercise.variants.dumbbell !== null) keys.push('dumbbell');
  return keys;
}

/** False when the slot needs a toggle that is off, or its exercise is unknown or unavailable. */
export function slotAvailable(
  data: ExerciseData,
  slot: TemplateSlot,
  equipment: EquipmentToggles,
): boolean {
  if (slot.onlyWith !== null && !toggleFor(equipment, slot.onlyWith)) return false;
  const exercise = exerciseById(data, slot.exerciseId);
  return exercise !== undefined && sessionVariants(exercise, equipment, 'planned').length > 0;
}

/**
 * The next version to suggest after the top of the range: easier → standard → harder, and nothing
 * after harder or an equipment version. Never for a pain-free-only movement (the hip hinge is
 * never nudged up; HS section 6 "light hinge … only if pain-free").
 */
export function nextVariantFor(exercise: Exercise, key: VariantKey): VariantKey | null {
  if (exercise.safetyKeys.includes('painFreeOnly')) return null;
  if (key === 'easier') return 'standard';
  if (key === 'standard') return 'harder';
  return null;
}

/** The variant object, or null when the exercise has no such version. */
export function variantOf(exercise: Exercise, key: VariantKey): Variant | null {
  return exercise.variants[key];
}

/**
 * The form cues to show with a version: its own when it has them (the dumbbell shoulder press is
 * not a pike push-up), otherwise the exercise's. The movement row always shows these, never
 * exercise.cues directly.
 */
export function cuesFor(exercise: Exercise, key: VariantKey): readonly string[] {
  return exercise.variants[key]?.cues ?? exercise.cues;
}
