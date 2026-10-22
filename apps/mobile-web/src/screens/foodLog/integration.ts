/**
 * Where the food log meets other items (item 23 design 2.8). If a name another item built differs
 * from its design, only this file and its call sites change.
 *
 * - Item 27's heat water joins the day's water guide (cross-item ruling 12), and its electrolyte
 *   lines show under the heat line exactly as heatElectrolyteLines returns them: keto with the keto
 *   ceiling available only, with item 13's blood-pressure salt sentence (cross-item ruling 24).
 * - Item 28 has landed, so a drink-like label name points to the Drinks tab (an adult only; under
 *   18 the name is refused with no mention of it).
 */
import {
  type DietMode,
  getExerciseData,
  heatElectrolyteLines,
  heatWaterExtraMl,
  type LocalDate,
  type ProfileRecord,
  type ReadinessGates,
  type SessionRecord,
} from '@diet/core';

/** The extra water for activity in the heat on `date` (item 27), 0 with no such session. */
export function heatExtraMlFor(
  date: LocalDate,
  sessions: readonly SessionRecord[],
  profile: Pick<ProfileRecord, 'equipmentBands' | 'equipmentDumbbells'>,
): number {
  return heatWaterExtraMl(getExerciseData(), sessions, date, {
    bands: profile.equipmentBands,
    dumbbells: profile.equipmentDumbbells,
  });
}

/** Item 27's electrolyte lines for a hot day, under item 26's gating (keto, keto ceiling available). */
export function heatElectrolyteLinesFor(
  dietMode: DietMode,
  gates: Pick<ReadinessGates, 'ketoCeilingAvailable' | 'bloodPressureSaltWording'>,
): string[] {
  return heatElectrolyteLines({ dietMode, gates });
}
