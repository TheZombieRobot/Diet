/**
 * Progression (HEALTH_SAFETY.md section 6: one step at a time, never more than about 10% week to
 * week; DOC_REVIEW C76; EX-03; item 26 design section 3.10).
 *
 * - The cap is per exercise, all its versions together ("per movement").
 * - Volume is the ticked sets only (storage spec 4.9; D39), in any session status; the planned
 *   reps and seconds are never read.
 * - This week counts every session. The baseline (last week, the last session, the last version,
 *   the top-of-range run) leaves out sessions whose check had any yes: those were lighter
 *   sessions (HS-29), so an honest yes never lowers later suggestions.
 * - A week with no baseline volume holds the level; two empty weeks restart the movement.
 * - The cap limits suggestions only. Logging is never blocked (C76).
 */
import type { Id, SeedId } from '../storage/primitives';
import type { SessionMovement, SessionRecord } from '../storage/records';
import { addDays, type LocalDate, weekStartOf } from '../util/time';
import { MOVE_LIMITS } from './constants';
import type { PlannedMovement } from './plan';
import { anyYes } from './preCheck';
import type { VariantKey } from './types';

export interface VolumeHistory {
  readonly lastWeek: { readonly volume: number; readonly weeksAgo: 1 | 2 } | null;
  /** At least 1 when not null. */
  readonly lastSessionVolume: number | null;
  /** The version in the latest baseline session of this exercise, in the window. */
  readonly lastVariant: VariantKey | null;
  readonly doneThisWeek: number;
  readonly recentAtTop: 0 | 1 | 2;
  /** A baseline session of this exercise before the window, and none inside it. */
  readonly olderHistory: boolean;
}

export interface DoseInput {
  readonly mode: 'planned' | 'lighter';
  readonly sets: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The version this session will use. */
  readonly variant: VariantKey;
  /** nextVariantFor(exercise, variant). */
  readonly nextCandidate: VariantKey | null;
  readonly history: VolumeHistory;
  /** At least 1, from occurrencesLeft. */
  readonly remainingOccurrences: number;
}

export type DoseReason =
  | 'start'
  | 'restart'
  | 'progress'
  | 'hold'
  | 'capped'
  | 'top'
  | 'week-reached'
  | 'new-variant'
  | 'lighter';

export interface DoseSuggestion {
  /** Non-increasing, multiples of the step, each at most the top of the range; may be empty. */
  readonly perSet: readonly number[];
  readonly weeklyCap: number | null;
  readonly reason: DoseReason;
  /** Suggest trying this version next time. */
  readonly next: VariantKey | null;
}

const STEPS: readonly number[] = [1, 5, 10, 30, 60];

const setAmount = (set: { reps: number | null; seconds: number | null }): number =>
  set.reps ?? set.seconds ?? 0;

/** Ticked reps (or seconds) of one exercise in one session, over all its movements and versions. */
export function movementVolume(session: SessionRecord, exerciseId: SeedId): number {
  let total = 0;
  for (const m of session.movements) {
    if (m.exerciseId === exerciseId) for (const set of m.done) total += setAmount(set);
  }
  return total;
}

/** Session order for history: date, then completedAt (not finished first), then id. */
export function compareSessions(a: SessionRecord, b: SessionRecord): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ac = a.completedAt ?? '';
  const bc = b.completedAt ?? '';
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The history one suggestion needs. The window is this ISO week and the two before it, up to
 * today. Sessions after today and the row being planned (`excludeSessionId`) are left out.
 */
export function weeklyVolumes(
  sessions: readonly SessionRecord[],
  exerciseId: SeedId,
  today: LocalDate,
  opts: {
    readonly variant: VariantKey;
    readonly sets: number;
    readonly max: number;
    readonly excludeSessionId: Id | null;
  },
): VolumeHistory {
  const w0 = weekStartOf(today);
  const windowStart = addDays(w0, -7 * MOVE_LIMITS.historyWeeks);
  const rows = sessions
    .filter((s) => s.date <= today && s.id !== opts.excludeSessionId)
    .sort(compareSessions);
  const volumeOf = (list: readonly SessionRecord[]) =>
    list.reduce((total, s) => total + movementVolume(s, exerciseId), 0);

  const doneThisWeek = volumeOf(rows.filter((s) => s.date >= w0));
  const baseline = rows.filter((s) => !anyYes(s.preCheck));
  const weekVolume = (monday: LocalDate) =>
    volumeOf(baseline.filter((s) => s.date >= monday && s.date <= addDays(monday, 6)));
  const oneWeekAgo = weekVolume(addDays(w0, -7));
  const twoWeeksAgo = weekVolume(addDays(w0, -14));
  const lastWeek =
    oneWeekAgo > 0
      ? { volume: oneWeekAgo, weeksAgo: 1 as const }
      : twoWeeksAgo > 0
        ? { volume: twoWeeksAgo, weeksAgo: 2 as const }
        : null;

  // "A session of this exercise" has ticked volume for it; an unticked movement is not one.
  const ofExercise = baseline.filter((s) => movementVolume(s, exerciseId) > 0);
  const inWindow = ofExercise.filter((s) => s.date >= windowStart);
  const latest = inWindow.at(-1);
  const ticked = (s: SessionRecord): SessionMovement[] =>
    s.movements.filter((m) => m.exerciseId === exerciseId && m.done.length > 0);

  // The two latest sessions of this exercise, counted from the latest while each was finished
  // and at the top of the range: an unfinished or lower session in between breaks the run.
  const atTop = (s: SessionRecord) =>
    s.status === 'done' &&
    ticked(s).some(
      (m) =>
        m.variant === opts.variant &&
        m.done.length >= opts.sets &&
        m.done.every((set) => setAmount(set) >= opts.max),
    );
  let recentAtTop: 0 | 1 | 2 = 0;
  for (const s of inWindow.slice(-MOVE_LIMITS.topSessionsForNextVariant).reverse()) {
    if (!atTop(s)) break;
    recentAtTop = recentAtTop === 0 ? 1 : 2;
  }

  const lastSessionVolume = latest === undefined ? null : movementVolume(latest, exerciseId);
  return Object.freeze({
    lastWeek: lastWeek === null ? null : Object.freeze(lastWeek),
    lastSessionVolume,
    lastVariant: latest === undefined ? null : (ticked(latest).at(-1)?.variant ?? null),
    doneThisWeek,
    recentAtTop,
    olderHistory:
      lastWeek === null &&
      lastSessionVolume === null &&
      ofExercise.some((s) => s.date < windowStart),
  });
}

/**
 * The most to suggest after a total of `lastVolume`: floor(1.1 ×) in whole steps, and always at
 * least one step more (C76: "+1 rep (or +5 s) … when 10% rounds to zero"). Integer arithmetic, so
 * 24 gives 26 exactly. Throws a RangeError unless lastVolume is above 0 and the step is 1, 5, 10,
 * 30 or 60.
 */
export function weeklyCap(lastVolume: number, step: number): number {
  if (!Number.isFinite(lastVolume) || lastVolume <= 0 || !STEPS.includes(step)) {
    throw new RangeError(`weeklyCap needs a volume above 0 and a known step, got ${lastVolume}`);
  }
  const units = Math.floor(lastVolume / step);
  const capUnits = Math.max(Math.floor((units * MOVE_LIMITS.weeklyIncreaseTenths) / 10), units + 1);
  return capUnits * step;
}

/**
 * The per-set suggestion (item 26 design 3.10, steps 1–9), worked in whole steps. It may be below
 * the bottom of the range (C76 "2 → 3 sessions") and is never above the top of the range, this
 * week's remaining share of the weekly cap, or the cap against the last session. A lighter session
 * has one set fewer at the bottom of the range; a change of version starts at the bottom of the
 * range. Stored volumes of 0 or less are read as no history, so stored data never throws.
 */
export function suggestDose(input: DoseInput): DoseSuggestion {
  const { mode, min, max, step, variant, history, remainingOccurrences } = input;
  if (!Number.isInteger(remainingOccurrences) || remainingOccurrences < 1) {
    throw new RangeError(
      `remainingOccurrences must be a whole number from 1, got ${remainingOccurrences}`,
    );
  }
  const sets = mode === 'lighter' ? Math.max(1, input.sets - 1) : input.sets;
  const units = (x: number) => Math.floor(x / step);
  const lastSession =
    history.lastSessionVolume !== null && history.lastSessionVolume > 0
      ? history.lastSessionVolume
      : null;
  const lastWeek =
    history.lastWeek !== null && history.lastWeek.volume > 0 ? history.lastWeek : null;
  const sessionCapUnits =
    lastSession === null ? Number.POSITIVE_INFINITY : units(weeklyCap(lastSession, step));

  let budget: number;
  let cap: number | null = null;
  if (lastWeek === null) {
    budget = Math.min(sets * units(min), sessionCapUnits);
  } else {
    // One week ago: up to about 10% more. Two weeks ago (a week with no baseline volume between):
    // the same level, with no increase.
    const capUnits =
      lastWeek.weeksAgo === 1
        ? units(weeklyCap(lastWeek.volume, step))
        : Math.max(1, units(lastWeek.volume));
    cap = capUnits * step;
    const done = Math.ceil(Math.max(0, history.doneThisWeek) / step);
    budget = Math.floor(Math.max(0, capUnits - done) / remainingOccurrences);
    budget = Math.min(budget, sessionCapUnits, sets * units(max));
  }
  const newVariant = history.lastVariant !== null && history.lastVariant !== variant;
  if (newVariant || mode === 'lighter') budget = Math.min(budget, sets * units(min));

  const count = budget > 0 ? Math.min(sets, budget) : 0;
  const base = count > 0 ? Math.floor(budget / count) : 0;
  const perSet = Array.from(
    { length: count },
    (_, i) => (base + (i < budget - base * count ? 1 : 0)) * step,
  );

  let reason: DoseReason;
  if (budget === 0) reason = 'week-reached';
  else if (mode === 'lighter') reason = 'lighter';
  else if (newVariant) reason = 'new-variant';
  else if (lastWeek === null && history.olderHistory) reason = 'restart';
  else if (lastWeek?.weeksAgo === 2) reason = 'hold';
  else if (budget < sets * units(min)) reason = 'capped';
  else if (count === sets && perSet.every((v) => v === units(max) * step)) reason = 'top';
  else if (lastWeek === null) reason = 'start';
  else reason = 'progress';

  const next =
    mode === 'planned' && history.recentAtTop >= MOVE_LIMITS.topSessionsForNextVariant
      ? input.nextCandidate
      : null;
  return Object.freeze({ perSet: Object.freeze(perSet), weeklyCap: cap, reason, next });
}

/**
 * The stored movement for a planned one, or null when its plan is empty (the week's amount is
 * done; it is stored only if the owner logs a set). The stored reps or seconds is the smallest
 * per-set target, so `sets × reps` never implies more than the plan: [9, 9, 8] is stored as 3 × 8.
 */
export function toSessionMovement(m: PlannedMovement): SessionMovement | null {
  const last = m.perSet.at(-1);
  if (last === undefined) return null;
  return {
    exerciseId: m.exerciseId,
    variant: m.variant,
    sets: m.perSet.length,
    reps: m.unit === 'reps' ? last : null,
    seconds: m.unit === 'seconds' ? last : null,
    done: [],
  };
}
