/**
 * The one start gate (item 26 design section 3.7; M29). Every way into a session goes through
 * sessionStartGate: the Move tab, the Today Movement card, the "Complete workout" quick action and
 * any link. It applies RD-05 (readiness answer 6), then the weekly rules to the week actually done
 * (EX-05; HEALTH_SAFETY.md section 6), and gives the fixed order of what is shown before Start:
 * stop signs first on every path (HS-28), then the beach prompts (HS-12), the pain-free note and
 * the pre-session check (HS-29).
 */
import type { Id } from '../storage/primitives';
import type { ReadinessGates } from '../storage/readiness';
import type { SessionRecord } from '../storage/records';
import { addDays, type LocalDate, weekStartOf } from '../util/time';
import { MOVE_LIMITS } from './constants';
import { exerciseById, templateById } from './lookup';
import { anyYes, painAnswered } from './preCheck';
import { isBeachTemplate } from './safety';
import {
  BLOCKS,
  type EquipmentToggles,
  type Exercise,
  type ExerciseData,
  type SessionTemplate,
  type TemplateKind,
} from './types';
import { slotAvailable } from './variants';
import { type ResolvedWeek, resumedRow, sessionHasWork, templatesOn } from './week';

export const START_PROBLEM_CODES = Object.freeze([
  'unknown-template',
  'jog-locked',
  'not-planned-today',
  'earlier-yes',
  'already-today',
  'back-to-back',
  'jog-limit',
  'jog-on-strength-day',
  'strength-count',
  'rest-days',
] as const);
export type StartProblem = (typeof START_PROBLEM_CODES)[number];

export type BeforeStartStep = 'stopRules' | 'beachPrompts' | 'painFreeOnly' | 'preCheck';

export type StartGate =
  /** RD-05: readiness answer 6 without the GP confirmation. Show readiness.featureOff only. */
  | { readonly kind: 'blocked' }
  | { readonly kind: 'refused'; readonly problem: StartProblem }
  | { readonly kind: 'ready'; readonly steps: readonly BeforeStartStep[] };

export interface StartInput {
  /** From readinessGates (readiness/gates.ts). */
  readonly gates: Pick<ReadinessGates, 'exercisePlansAvailable'>;
  readonly templateId: string;
  /** Sessions start only on the day. */
  readonly today: LocalDate;
  /** resolveWeeklyPattern for today's week, with the same jogUnlocked. */
  readonly week: ResolvedWeek;
  /** jogStatus(...).state === 'unlocked'. */
  readonly jogUnlocked: boolean;
  /** Every stored session row. */
  readonly sessions: readonly SessionRecord[];
  readonly equipment: EquipmentToggles;
  /**
   * A row being resumed; left out of every count only when it is dated today and holds this
   * template (resumedRow). Any other id is ignored, so the row it names still counts.
   */
  readonly sessionId: Id | null;
}

const refused = (problem: StartProblem): StartGate => Object.freeze({ kind: 'refused', problem });

/**
 * A row's kind for the weekly rules. A template the dataset no longer holds (a later dataset, an
 * import) is read cautiously: beach only when every ticked movement is a known beach exercise,
 * otherwise strength, so it still counts against strength on consecutive days.
 */
function rowKind(data: ExerciseData, row: SessionRecord): TemplateKind {
  const known = templateById(data, row.templateId)?.kind;
  if (known !== undefined) return known;
  const ticked = row.movements
    .filter((m) => m.done.length > 0)
    .map((m) => exerciseById(data, m.exerciseId));
  if (ticked.length === 0 || !ticked.every((e) => e?.tags.includes('beach') === true)) {
    return 'strength';
  }
  return ticked.some((e) => e?.tags.includes('jog') === true) ? 'jog' : 'walk';
}

/**
 * Checks in order, the first match wins: (1) RD-05 → blocked; (2) an unknown template; (3) a jog
 * while jogging is not unlocked, whatever a stored row says; (4) not planned today (training on
 * another day means changing the weekly plan); (5) another row today has a check with a yes, so
 * only that row (its lighter session) or rest is left for the day. Then, on the week actually
 * done, counting only rows with work and leaving out the resumed row: (6) the same kind of session
 * already done today; (7) strength the day before or after; (8) a jog the day before or after, or
 * jogs on 2 other days this ISO week; (9) a jog and strength on one day; (10) 3 strength sessions
 * already this ISO week; (11) work on 5 other days in any 7 days in a row that hold today (the
 * ISO week is one of them; cross-item ruling 11). Otherwise ready, with the steps to show before
 * Start.
 */
export function sessionStartGate(data: ExerciseData, input: StartInput): StartGate {
  // Compared as unknown: only exactly true opens exercise plans (C41).
  if ((input.gates.exercisePlansAvailable as unknown) !== true) {
    return Object.freeze({ kind: 'blocked' });
  }
  const template = templateById(data, input.templateId);
  if (template === undefined) return refused('unknown-template');
  if (template.kind === 'jog' && !input.jogUnlocked) return refused('jog-locked');
  if (!templatesOn(data, input.week, input.today).some((t) => t.id === template.id)) {
    return refused('not-planned-today');
  }

  const { today } = input;
  const resumed = resumedRow(input.sessions, input.sessionId, today, template.id);
  const others = input.sessions.filter((s) => s !== resumed);
  if (others.some((r) => r.date === today && anyYes(r.preCheck))) return refused('earlier-yes');

  const kind = template.kind;
  const strength = kind === 'strength';
  const work = others
    .filter(sessionHasWork)
    .map((row) => ({ date: row.date, kind: rowKind(data, row) }));
  const isStrength = (r: { kind: TemplateKind }) => r.kind === 'strength';
  const isJog = (r: { kind: TemplateKind }) => r.kind === 'jog';

  if (work.some((r) => r.date === today && isStrength(r) === strength)) {
    return refused('already-today');
  }
  const neighbours = [addDays(today, -1), addDays(today, 1)];
  if (strength && work.some((r) => neighbours.includes(r.date) && isStrength(r))) {
    return refused('back-to-back');
  }
  const monday = weekStartOf(today);
  const sunday = addDays(monday, 6);
  const otherDaysThisWeek = work.filter(
    (r) => r.date >= monday && r.date <= sunday && r.date !== today,
  );
  if (
    kind === 'jog' &&
    (work.some((r) => neighbours.includes(r.date) && isJog(r)) ||
      new Set(otherDaysThisWeek.filter(isJog).map((r) => r.date)).size >= MOVE_LIMITS.jogDaysMax)
  ) {
    return refused('jog-limit');
  }
  const todayHas = (has: (r: { kind: TemplateKind }) => boolean) =>
    work.some((r) => r.date === today && has(r));
  if ((kind === 'jog' && todayHas(isStrength)) || (strength && todayHas(isJog))) {
    return refused('jog-on-strength-day');
  }
  if (strength && otherDaysThisWeek.filter(isStrength).length >= MOVE_LIMITS.strengthPerWeek.max) {
    return refused('strength-count');
  }
  const activeDates = new Set(work.filter((r) => r.date !== today).map((r) => r.date));
  for (let start = addDays(today, -6); start <= today; start = addDays(start, 1)) {
    const end = addDays(start, 6);
    const active = [...activeDates].filter((date) => date >= start && date <= end).length;
    if (active >= MOVE_LIMITS.activeDaysMax) return refused('rest-days');
  }
  return Object.freeze({
    kind: 'ready',
    steps: Object.freeze(beforeStartSteps(data, template, input.equipment)),
  });
}

/**
 * The exercises in a session that run only if pain-free (the hip hinge), over its available
 * slots, each once. The before-start note names them (move.safety.painFreeOnly.inSession).
 */
export function painFreeOnlyExercises(
  data: ExerciseData,
  template: SessionTemplate,
  equipment: EquipmentToggles,
): Exercise[] {
  const found = new Map<string, Exercise>();
  for (const block of BLOCKS) {
    for (const slot of template[block]) {
      const exercise = exerciseById(data, slot.exerciseId);
      if (
        exercise !== undefined &&
        slotAvailable(data, slot, equipment) &&
        exercise.safetyKeys.includes('painFreeOnly')
      ) {
        found.set(exercise.id, exercise);
      }
    }
  }
  return [...found.values()];
}

/** Stop signs always first, then the beach prompts, the pain-free note, and the check last. */
export function beforeStartSteps(
  data: ExerciseData,
  template: SessionTemplate,
  equipment: EquipmentToggles,
): BeforeStartStep[] {
  const steps: BeforeStartStep[] = ['stopRules'];
  if (isBeachTemplate(data, template)) steps.push('beachPrompts');
  if (painFreeOnlyExercises(data, template, equipment).length > 0) steps.push('painFreeOnly');
  steps.push('preCheck');
  return steps;
}

export type SessionWriteProblem = 'no-pre-check' | 'lighter-only';

/**
 * Item 27 calls it before every sessions write; any problem refuses the write.
 * - 'no-pre-check': a row with work has no pre-session check, so nothing is logged as done
 *   without the check (HS section 6 "every session"). A rested row may have none: the owner chose
 *   rest without the check.
 * - 'lighter-only': the row's check has a yes, so it holds only the lighter session (HS-29): every
 *   main movement at the easier version and, after pain or back or leg symptoms, no pain-free-only
 *   movement. Warm-up and cool-down movements keep their own versions.
 */
export function sessionWriteProblem(
  data: ExerciseData,
  row: SessionRecord,
): SessionWriteProblem | null {
  if (sessionHasWork(row) && row.preCheck === null) return 'no-pre-check';
  if (row.preCheck === null || !anyYes(row.preCheck)) return null;
  const fixedOnly = new Set(
    data.templates.flatMap((t) => [...t.warmUp, ...t.coolDown].map((slot) => slot.exerciseId)),
  );
  const pain = painAnswered(row.preCheck);
  const allowed = row.movements.every(
    (m) =>
      fixedOnly.has(m.exerciseId) ||
      (m.variant === 'easier' &&
        !(pain && exerciseById(data, m.exerciseId)?.safetyKeys.includes('painFreeOnly') === true)),
  );
  return allowed ? null : 'lighter-only';
}
