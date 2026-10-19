/**
 * Session length estimate (HEALTH_SAFETY.md section 6: sessions of about 20–35 minutes). The
 * validator's `duration` rule recomputes it from the data, and the Move screens show it in whole
 * minutes (Math.round(seconds / 60)).
 */
import { MOVE_LIMITS } from './constants';
import { exerciseById } from './lookup';
import { slotAvailable } from './variants';
import { BLOCKS, type EquipmentToggles, type ExerciseData, type SessionTemplate } from './types';

/**
 * Seconds for a template over its available slots: per slot, sets × seconds per set × sides plus
 * the rest between sets; plus 30 s between movements. A rep counts 4 s. 'start' uses each slot's
 * start variant and the bottom of its range; 'top' uses the top of the range and counts both sides
 * whenever any version of the exercise is per side, so the longest version counts.
 */
export function estimateSeconds(
  data: ExerciseData,
  template: SessionTemplate,
  which: 'start' | 'top',
  equipment: EquipmentToggles,
): number {
  let total = 0;
  let slots = 0;
  for (const block of BLOCKS) {
    for (const slot of template[block]) {
      const exercise = exerciseById(data, slot.exerciseId);
      if (exercise === undefined || !slotAvailable(data, slot, equipment)) continue;
      const perSide =
        which === 'start'
          ? exercise.variants[slot.startVariant].perSide
          : Object.values(exercise.variants).some((v) => v?.perSide === true);
      const amount = which === 'start' ? slot.min : slot.max;
      const perSet = exercise.unit === 'reps' ? amount * MOVE_LIMITS.secondsPerRep : amount;
      total += slot.sets * perSet * (perSide ? 2 : 1) + (slot.sets - 1) * slot.restSeconds;
      slots += 1;
    }
  }
  return total + Math.max(0, slots - 1) * MOVE_LIMITS.transitionSeconds;
}
