/**
 * The session log's pure steps (item 27 design section 2.5): the rows a choice writes, the
 * session's mode, the version switch, ticks, and the finish. Every row these build still goes
 * through item 26's sessionWriteProblem before it is written (item 26 3.14 point 5).
 */
import {
  anyYes,
  type Exercise,
  type ExerciseData,
  type PlannedMovement,
  type SessionPlan,
  type SessionTemplate,
  sessionVariants,
  type SessionWriteProblem,
  sessionWriteProblem,
  toSessionMovement,
  type VariantKey,
} from '../exercise';
import type { SeedId } from '../storage/primitives';
import type { PreCheck, SessionMovement, SessionRecord } from '../storage/records';
import type { LocalDate } from '../util/time';

/** The storage validator's bounds for a session row (storage 4.9); a test pins them to it. */
export const SESSION_LIMITS = Object.freeze({
  maxSets: 20,
  maxMovements: 20,
  reps: Object.freeze({ min: 1, max: 500 }),
  seconds: Object.freeze({ min: 1, max: 3600 }),
  noteMax: 500,
  rating: Object.freeze({ min: 1, max: 5 }),
});

export type SessionDraft = Omit<SessionRecord, 'id' | 'completedAt' | 'timeZone'>;
export type RatingField = 'exertion' | 'soreness' | 'energy';
export const RATING_FIELDS = Object.freeze([
  'exertion',
  'soreness',
  'energy',
] as const satisfies readonly RatingField[]);

export interface FinishValues {
  readonly exertion: number | null;
  readonly soreness: number | null;
  readonly energy: number | null;
  readonly note: string;
}

/**
 * The row a planned or lighter choice writes. `plan` comes from item 26's planSession with this
 * check, so after any yes it is the lighter session whatever was asked (HS-29).
 */
export function startedSessionDraft(input: {
  readonly today: LocalDate;
  readonly templateId: SeedId;
  readonly preCheck: PreCheck;
  readonly plan: SessionPlan;
}): SessionDraft {
  return {
    date: input.today,
    templateId: input.templateId,
    status: 'planned',
    movements: input.plan.movements
      .map(toSessionMovement)
      .filter((m): m is SessionMovement => m !== null),
    preCheck: input.preCheck,
    exertion: null,
    soreness: null,
    energy: null,
    durationMinutes: null,
    note: null,
  };
}

/** A rest: from the check (with it), or "Rest instead" before any check (null). */
export function restedSessionDraft(input: {
  readonly today: LocalDate;
  readonly templateId: SeedId;
  readonly preCheck: PreCheck | null;
}): SessionDraft {
  return {
    date: input.today,
    templateId: input.templateId,
    status: 'rested',
    movements: [],
    preCheck: input.preCheck,
    exertion: null,
    soreness: null,
    energy: null,
    durationMinutes: null,
    note: null,
  };
}

/**
 * Lighter after any yes; while a Kickstart stop-sign answer in the last 336 hours or a fast past
 * 24 hours holds (ruling 9), also when it began during the session; after a lighter choice in this
 * screen; or whenever the stored row has the lighter shape (every stored main movement at the
 * easier version, and one with a set fewer than its slot), so a reload, a new tab or the app being
 * closed never turns a lighter session back into a planned one (HS-29; N6). A row with no main
 * movement stored (every one's amount for the week was reached at the start) cannot show which
 * was chosen, so it reads as lighter unless this screen chose the planned session. A false
 * positive only makes the session lighter.
 */
export function sessionMode(
  template: SessionTemplate | null,
  row: SessionRecord,
  chosen: 'planned' | 'lighter' | null,
  ruling9: { readonly stopSignOn: LocalDate | null; readonly fastOverCeiling: boolean },
): 'planned' | 'lighter' {
  if (anyYes(row.preCheck) || chosen === 'lighter') return 'lighter';
  if (ruling9.stopSignOn !== null || ruling9.fastOverCeiling) return 'lighter';
  if (template === null) return 'planned';
  const slots = new Map(template.main.map((slot) => [slot.exerciseId, slot]));
  const main = row.movements.filter((m) => slots.has(m.exerciseId));
  if (main.length === 0) return chosen === 'planned' ? 'planned' : 'lighter';
  const lighterShape =
    main.every((m) => m.variant === 'easier') &&
    main.some((m) => m.sets <= Math.max(1, (slots.get(m.exerciseId)?.sets ?? 1) - 1));
  return lighterShape ? 'lighter' : 'planned';
}

/**
 * The versions the switch offers: item 26's sessionVariants, and for a pain-free-only movement
 * (the hip hinge) only Easier and Standard (N32; HS section 6 "light hinge … only if pain-free").
 */
export function switchVariants(
  exercise: Exercise,
  equipment: Parameters<typeof sessionVariants>[1],
  mode: 'planned' | 'lighter',
): VariantKey[] {
  const offered = sessionVariants(exercise, equipment, mode);
  return exercise.safetyKeys.includes('painFreeOnly')
    ? offered.filter((v) => v === 'easier' || v === 'standard')
    : offered;
}

/** The stored version of each exercise, for planSession's overrides; the last one wins. */
export function storedVariants(row: SessionRecord): ReadonlyMap<SeedId, VariantKey> {
  return new Map(row.movements.map((m) => [m.exerciseId, m.variant]));
}

function assertAmount(unit: 'reps' | 'seconds', amount: number): void {
  const { min, max } = SESSION_LIMITS[unit];
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    throw new RangeError(`A ${unit} amount must be a whole number from ${min} to ${max}`);
  }
}

const unitOf = (m: Pick<SessionMovement, 'reps'>): 'reps' | 'seconds' =>
  m.reps === null ? 'seconds' : 'reps';

const setOf = (unit: 'reps' | 'seconds', amount: number) =>
  unit === 'reps' ? { reps: amount, seconds: null } : { reps: null, seconds: amount };

function movementAt(movements: readonly SessionMovement[], index: number): SessionMovement {
  const m = movements[index];
  if (m === undefined) throw new RangeError(`No movement at ${index}`);
  return m;
}

/** Ticks the next set of one movement with what was done; `sets` grows to fit an extra set. */
export function tickSet(
  movements: readonly SessionMovement[],
  index: number,
  amount: number,
): SessionMovement[] {
  const m = movementAt(movements, index);
  const unit = unitOf(m);
  assertAmount(unit, amount);
  if (m.done.length >= SESSION_LIMITS.maxSets) throw new RangeError('max-sets');
  const done = [...m.done, setOf(unit, amount)];
  const next = { ...m, sets: Math.max(m.sets, done.length), done };
  return movements.map((x, i) => (i === index ? next : x));
}

/** Removes the last ticked set; the number of sets stays. */
export function untickSet(movements: readonly SessionMovement[], index: number): SessionMovement[] {
  const m = movementAt(movements, index);
  if (m.done.length === 0) return [...movements];
  const next = { ...m, done: m.done.slice(0, -1) };
  return movements.map((x, i) => (i === index ? next : x));
}

/**
 * "Log a set anyway" (C76: the cap never blocks logging) for a movement not stored yet, in the
 * planned movement's version, which planSession makes the easier one in a lighter session (HS-29).
 */
export function appendMovement(
  movements: readonly SessionMovement[],
  movement: {
    readonly exerciseId: SeedId;
    readonly variant: VariantKey;
    readonly unit: 'reps' | 'seconds';
  },
  amount: number,
): SessionMovement[] {
  if (movements.length >= SESSION_LIMITS.maxMovements) throw new RangeError('max-movements');
  if (movements.some((m) => m.exerciseId === movement.exerciseId)) {
    throw new RangeError('already-stored');
  }
  assertAmount(movement.unit, amount);
  const set = setOf(movement.unit, amount);
  return [
    ...movements,
    {
      exerciseId: movement.exerciseId,
      variant: movement.variant,
      sets: 1,
      reps: set.reps,
      seconds: set.seconds,
      done: [set],
    },
  ];
}

/**
 * The first tick of a lighter session's movement stored at another version with nothing ticked
 * (layoutSession's `replace`): the planned movement takes its place, then its first set is ticked.
 */
export function tickAsPlanned(
  movements: readonly SessionMovement[],
  planned: PlannedMovement,
  amount: number,
): SessionMovement[] {
  assertAmount(planned.unit, amount);
  const set = setOf(planned.unit, amount);
  const next = toSessionMovement(planned) ?? {
    exerciseId: planned.exerciseId,
    variant: planned.variant,
    sets: 1,
    reps: set.reps,
    seconds: set.seconds,
    done: [],
  };
  const replaced = replaceMovement(movements, planned.exerciseId, next);
  return tickSet(
    replaced,
    replaced.findIndex((m) => m.exerciseId === planned.exerciseId),
    amount,
  );
}

/**
 * The version switch (N7): replaces the first stored movement of the exercise (null removes it),
 * or appends `next` when none is stored. A movement with a ticked set is never replaced.
 */
export function replaceMovement(
  movements: readonly SessionMovement[],
  exerciseId: SeedId,
  next: SessionMovement | null,
): SessionMovement[] {
  const index = movements.findIndex((m) => m.exerciseId === exerciseId);
  if (index < 0) return next === null ? [...movements] : [...movements, next];
  if (movementAt(movements, index).done.length > 0) throw new RangeError('ticked');
  return next === null
    ? movements.filter((_, i) => i !== index)
    : movements.map((m, i) => (i === index ? next : m));
}

function assertRating(value: number | null): void {
  const { min, max } = SESSION_LIMITS.rating;
  if (value !== null && (!Number.isInteger(value) || value < min || value > max)) {
    throw new RangeError(`A rating must be a whole number from ${min} to ${max}`);
  }
}

/** One rating, changed at once on a done row; a rating is changed, never cleared (N9). */
export function ratingPatch(field: RatingField, value: number): Partial<SessionRecord> {
  if ((value as unknown) === null) throw new RangeError('A rating is never cleared');
  assertRating(value);
  return { [field]: value };
}

/**
 * The finish: status done with the ratings and the trimmed note (empty → null). A row that item
 * 26's sessionWriteProblem would refuse as done (a done row with no check) is not finished.
 */
export function finishPatch(
  data: ExerciseData,
  row: SessionRecord,
  values: FinishValues,
):
  | { readonly ok: true; readonly patch: Partial<SessionRecord> }
  | { readonly ok: false; readonly problem: SessionWriteProblem } {
  for (const field of RATING_FIELDS) assertRating(values[field]);
  const note = values.note.trim();
  if (note.length > SESSION_LIMITS.noteMax) throw new RangeError('note-too-long');
  const problem = sessionWriteProblem(data, { ...row, status: 'done' });
  if (problem !== null) return { ok: false, problem };
  return {
    ok: true,
    patch: {
      status: 'done',
      exertion: values.exertion,
      soreness: values.soreness,
      energy: values.energy,
      note: note === '' ? null : note,
    },
  };
}
