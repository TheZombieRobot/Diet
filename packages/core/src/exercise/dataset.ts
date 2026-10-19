/**
 * The shipped exercise dataset (packages/core/data/exercises.json). The import puts it in the app
 * bundle, so Move works offline with no fetch. It is checked on first use and kept, deep-frozen;
 * a broken file cannot pass CI (dataset.test.ts), and if one ever shipped only Move would fail
 * (move.dataError): first run, the alcohol notice and the help numbers do not read it.
 */
// The import attribute lets Node load it too (the browser tests read core directly).
import raw from '../../data/exercises.json' with { type: 'json' };
import type { ExerciseData } from './types';
import { parseExerciseData } from './validate';

let parsed: ExerciseData | undefined;

/** The dataset. Throws ExerciseDataError if the shipped file is not valid (never expected). */
export function getExerciseData(): ExerciseData {
  parsed ??= parseExerciseData(raw);
  return parsed;
}
