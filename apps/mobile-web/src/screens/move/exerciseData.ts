import { type ExerciseData, getExerciseData } from '@diet/core';

let parsed: ExerciseData | null | undefined;

/**
 * Item 26's dataset, or null when it cannot be read (never expected: CI checks it). Only Move
 * then shows move.dataError; nothing else in the app reads the dataset.
 */
export function exerciseDataOrNull(): ExerciseData | null {
  if (parsed === undefined) {
    try {
      parsed = getExerciseData();
    } catch {
      parsed = null;
    }
  }
  return parsed;
}
