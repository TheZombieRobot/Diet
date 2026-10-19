/**
 * Dataset lookups by id. Stored sessions and weekly plans hold soft references (storage spec
 * section 5), so an unknown id gives undefined and never throws. One Map per data object, built
 * on first use.
 */
import type { Exercise, ExerciseData, SessionTemplate } from './types';

interface Index {
  readonly exercises: ReadonlyMap<string, Exercise>;
  readonly templates: ReadonlyMap<string, SessionTemplate>;
}

const indexes = new WeakMap<ExerciseData, Index>();

function indexOf(data: ExerciseData): Index {
  let index = indexes.get(data);
  if (index === undefined) {
    index = {
      exercises: new Map(data.exercises.map((e) => [e.id, e])),
      templates: new Map(data.templates.map((t) => [t.id, t])),
    };
    indexes.set(data, index);
  }
  return index;
}

export function exerciseById(data: ExerciseData, id: string): Exercise | undefined {
  return indexOf(data).exercises.get(id);
}

export function templateById(data: ExerciseData, id: string): SessionTemplate | undefined {
  return indexOf(data).templates.get(id);
}
