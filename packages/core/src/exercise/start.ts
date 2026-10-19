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
import { isBeachTemplate } from './safety';
import {
  BLOCKS,
  type EquipmentToggles,
  type ExerciseData,
  type SessionTemplate,
  type TemplateKind,
} from './types';
import { slotAvailable } from './variants';
import { type ResolvedWeek, sessionHasWork, templatesOn } from './week';

export const START_PROBLEM_CODES = Object.freeze([
  'unknown-template',
  'jog-locked',
  'not-planned-today',
  'already-today',
  'back-to-back',
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
  /** A row for today being resumed; left out of every count. */
  readonly sessionId: Id | null;
}

const refused = (problem: StartProblem): StartGate => Object.freeze({ kind: 'refused', problem });

/**
 * Checks in order, the first match wins: (1) RD-05 → blocked; (2) an unknown template; (3) a jog
 * while jogging is not unlocked, whatever a stored row says; (4) not planned today (training on
 * another day means changing the weekly plan). Then, on the week actually done, counting only rows
 * with work and leaving out `sessionId`: (5) the same kind of session already done today; (6)
 * strength the day before or after; (7) 3 strength sessions already this ISO week; (8) work on 5
 * other days this ISO week. Otherwise ready, with the steps to show before Start.
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
  const strength = template.kind === 'strength';
  const kindOf = (row: SessionRecord): TemplateKind | undefined =>
    templateById(data, row.templateId)?.kind;
  const sameKind = (row: SessionRecord): boolean => {
    const kind = kindOf(row);
    return kind !== undefined && (kind === 'strength') === strength;
  };
  const work = input.sessions.filter((s) => s.id !== input.sessionId && sessionHasWork(s));

  if (work.some((r) => r.date === today && sameKind(r))) return refused('already-today');
  const neighbours = [addDays(today, -1), addDays(today, 1)];
  if (strength && work.some((r) => neighbours.includes(r.date) && kindOf(r) === 'strength')) {
    return refused('back-to-back');
  }
  const monday = weekStartOf(today);
  const sunday = addDays(monday, 6);
  const otherDaysThisWeek = work.filter(
    (r) => r.date >= monday && r.date <= sunday && r.date !== today,
  );
  if (
    strength &&
    otherDaysThisWeek.filter((r) => kindOf(r) === 'strength').length >=
      MOVE_LIMITS.strengthPerWeek.max
  ) {
    return refused('strength-count');
  }
  if (new Set(otherDaysThisWeek.map((r) => r.date)).size >= MOVE_LIMITS.activeDaysMax) {
    return refused('rest-days');
  }
  return Object.freeze({
    kind: 'ready',
    steps: Object.freeze(beforeStartSteps(data, template, input.equipment)),
  });
}

/** Stop signs always first, then the beach prompts, the pain-free note, and the check last. */
export function beforeStartSteps(
  data: ExerciseData,
  template: SessionTemplate,
  equipment: EquipmentToggles,
): BeforeStartStep[] {
  const steps: BeforeStartStep[] = ['stopRules'];
  if (isBeachTemplate(data, template)) steps.push('beachPrompts');
  const painFreeOnly = BLOCKS.some((block) =>
    template[block].some(
      (slot) =>
        slotAvailable(data, slot, equipment) &&
        exerciseById(data, slot.exerciseId)?.safetyKeys.includes('painFreeOnly') === true,
    ),
  );
  if (painFreeOnly) steps.push('painFreeOnly');
  steps.push('preCheck');
  return steps;
}

/**
 * 'no-pre-check' when a row with work has no pre-session check. Item 27 calls it before every
 * sessions write, so nothing is logged as done without the check (HS section 6 "every session").
 * A rested row may have none: the owner chose rest without the check.
 */
export function sessionWriteProblem(row: SessionRecord): 'no-pre-check' | null {
  return sessionHasWork(row) && row.preCheck === null ? 'no-pre-check' : null;
}
