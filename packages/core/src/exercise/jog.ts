/**
 * Tolerated walks and the beach jog (HEALTH_SAFETY.md section 6: beach jogging only as a
 * progressive opt-in, no compulsory running; REQUIREMENTS 3C "opt-in if tolerated"; UX 4d;
 * DOC_REVIEW C51; item 26 design M17, M18). Jogging needs the owner's opt-in and four tolerated
 * walks, and pauses after a jog that was not tolerated until one more tolerated walk.
 */
import type { PreCheck, SessionRecord } from '../storage/records';
import type { LocalDate } from '../util/time';
import { MOVE_LIMITS } from './constants';
import { templateById } from './lookup';
import { anyYes } from './preCheck';
import { compareSessions, movementVolume } from './progression';
import type { ExerciseData, TemplateKind } from './types';

export const JOG_STATES = Object.freeze([
  'off-few',
  'off-ready',
  'on-few',
  'paused',
  'unlocked',
] as const);
export type JogState = (typeof JOG_STATES)[number];

/** A rating given and at most 3 of 5 (move.finish: 1 is very easy or no soreness). */
const ratedEasy = (rating: number | null): boolean =>
  rating !== null && rating <= MOVE_LIMITS.toleratedMaxRating;

const noPainNext = (check: PreCheck | null): boolean =>
  check !== null && check.painOrInjury === 'no' && check.backOrLegSymptoms === 'no';

/** Ticked seconds of the template's main movement, when the row's template is of this kind. */
function mainSeconds(data: ExerciseData, row: SessionRecord, kind: TemplateKind): number | null {
  const template = templateById(data, row.templateId);
  const slot = template?.main[0];
  if (template?.kind !== kind || slot === undefined) return null;
  return movementVolume(row, slot.exerciseId);
}

const mainSlotMin = (data: ExerciseData, row: SessionRecord): number =>
  templateById(data, row.templateId)?.main[0]?.min ?? Number.POSITIVE_INFINITY;

/** The first later-dated session's check (a session the same day is not "next"). */
function nextCheck(ordered: readonly SessionRecord[], row: SessionRecord): PreCheck | null {
  return ordered.find((s) => s.date > row.date && s.preCheck !== null)?.preCheck ?? null;
}

/**
 * C51 as tightened (M17): a done beach walk whose check was all no (so a lighter walk never
 * counts), with at least the walk slot's minimum ticked (15 minutes in the shipped data), effort
 * and soreness both rated 3 or less, and a next check with no pain and no back or leg symptoms.
 */
export function isToleratedWalk(
  data: ExerciseData,
  walk: SessionRecord,
  nextPreCheck: PreCheck | null,
): boolean {
  const seconds = mainSeconds(data, walk, 'walk');
  return (
    seconds !== null &&
    walk.status === 'done' &&
    walk.preCheck !== null &&
    !anyYes(walk.preCheck) &&
    seconds >= mainSlotMin(data, walk) &&
    ratedEasy(walk.exertion) &&
    ratedEasy(walk.soreness) &&
    noPainNext(nextPreCheck)
  );
}

const ordered = (sessions: readonly SessionRecord[], today: LocalDate): SessionRecord[] =>
  sessions.filter((s) => s.date <= today).sort(compareSessions);

const toleratedWalkDates = (data: ExerciseData, rows: readonly SessionRecord[]): LocalDate[] =>
  rows.filter((s) => isToleratedWalk(data, s, nextCheck(rows, s))).map((s) => s.date);

/** Dates with at least one tolerated walk, over all time up to today: at most one walk a day counts. */
export function toleratedWalkCount(
  data: ExerciseData,
  sessions: readonly SessionRecord[],
  today: LocalDate,
): number {
  return new Set(toleratedWalkDates(data, ordered(sessions, today))).size;
}

/**
 * Off: 'off-few' below four tolerated walks, 'off-ready' from four (jogging is never switched on
 * for the owner). On: 'on-few' below four; from four, 'paused' when the latest real jog was not
 * tolerated and no tolerated walk is dated after it, otherwise 'unlocked'. A real jog is a done
 * jog session after an all-no check with jog seconds ticked. It was not tolerated when effort or
 * soreness is above 3 or not rated, or the next check shows pain or back or leg symptoms; with no
 * later check yet it is judged on its ratings alone.
 */
export function jogStatus(
  data: ExerciseData,
  input: {
    readonly jogOptIn: boolean;
    readonly sessions: readonly SessionRecord[];
    readonly today: LocalDate;
  },
): { readonly state: JogState; readonly toleratedWalks: number } {
  const rows = ordered(input.sessions, input.today);
  const walkDates = toleratedWalkDates(data, rows);
  const toleratedWalks = new Set(walkDates).size;
  const enough = toleratedWalks >= MOVE_LIMITS.toleratedWalksForJog;
  const result = (state: JogState) => Object.freeze({ state, toleratedWalks });
  if (!input.jogOptIn) return result(enough ? 'off-ready' : 'off-few');
  if (!enough) return result('on-few');

  const lastJog = rows
    .filter(
      (s) =>
        s.status === 'done' &&
        s.preCheck !== null &&
        !anyYes(s.preCheck) &&
        (mainSeconds(data, s, 'jog') ?? 0) > 0,
    )
    .at(-1);
  if (lastJog === undefined) return result('unlocked');
  const next = nextCheck(rows, lastJog);
  const tolerated =
    ratedEasy(lastJog.exertion) &&
    ratedEasy(lastJog.soreness) &&
    (next === null || noPainNext(next));
  if (tolerated || walkDates.some((date) => date > lastJog.date)) return result('unlocked');
  return result('paused');
}
