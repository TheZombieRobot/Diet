/**
 * Readiness answers and the gate input (storage spec section 13; HEALTH_SAFETY section 1; C41,
 * C06, C07, C24, C54, C58, C102; D29, D30).
 *
 * One stored row per answered question or confirmation. No row, or a row answered under an older
 * wording, means unanswered, and unanswered counts as gated (C41). Rewording a question raises its
 * number in READINESS_WORDING, which is a schema change (section 9.2), and re-asks only that
 * question. Import and migrations reopen readiness only through these functions; they write
 * nothing (C41, RD-08).
 */
import { minimumAgeFromBirthYear } from '../energy/age';
import { type LocalDate, parseLocalDate } from '../util/time';
import type { YesNo } from './primitives';
import type { ReadinessRecord } from './records';

export const READINESS_QUESTION_IDS = Object.freeze([
  'q1',
  'q2',
  'q3',
  'q4',
  'q5',
  'q6',
  'q7',
] as const);
export type ReadinessQuestionId = (typeof READINESS_QUESTION_IDS)[number];

/** The two confirmation toggles: "my prescriber has agreed" (Q3) and "I have discussed exercise with a GP" (Q6). */
export const READINESS_CONFIRMATION_IDS = Object.freeze([
  'prescriberAgreed',
  'gpExerciseDiscussed',
] as const);
export type ReadinessConfirmationId = (typeof READINESS_CONFIRMATION_IDS)[number];

export const READINESS_IDS = Object.freeze([
  ...READINESS_QUESTION_IDS,
  ...READINESS_CONFIRMATION_IDS,
] as const);
export type ReadinessId = (typeof READINESS_IDS)[number];

/**
 * Wording version 1 of every question and confirmation. Frozen with schema version 1. Q7's v1
 * wording is "Do you drink alcohol most days, or heavily at weekends?" (DECISIONS C58 row); the
 * text itself lives in health.ts at item 13.
 */
export const READINESS_WORDING_V1: Readonly<Record<ReadinessId, number>> = Object.freeze({
  q1: 1,
  q2: 1,
  q3: 1,
  q4: 1,
  q5: 1,
  q6: 1,
  q7: 1,
  prescriberAgreed: 1,
  gpExerciseDiscussed: 1,
});

/** The current wording versions (part of the spec fingerprint). */
export const READINESS_WORDING: Readonly<Record<ReadinessId, number>> = READINESS_WORDING_V1;

/** The question each confirmation belongs to (D29). */
export const CONFIRMATION_QUESTION: Readonly<Record<ReadinessConfirmationId, ReadinessQuestionId>> =
  Object.freeze({ prescriberAgreed: 'q3', gpExerciseDiscussed: 'q6' });

export interface ReadinessInput {
  /** null = no row, or a row answered under an older wording. null is treated as 'yes' (gated). */
  readonly answers: Readonly<Record<ReadinessQuestionId, YesNo | null>>;
  /** true only under the confirmation rule (D29; see readinessInputFromRows). */
  readonly confirmations: Readonly<Record<ReadinessConfirmationId, boolean>>;
  /**
   * minimumAgeFromBirthYear(profile.birthYear, today); 0 when the stored year is after today's
   * year (which gates as under 18); null when no birth year is stored (C24).
   */
  readonly minimumAgeYears: number | null;
}

type ReadinessRow = Pick<
  ReadinessRecord,
  'questionId' | 'answer' | 'wordingVersion' | 'answeredAt'
>;

/**
 * The gate input from the stored rows (section 13.2).
 *
 * Confirmation rule (D29): a confirmation counts only when its row says 'yes' under the current
 * wording, its question has a row under the current wording, and the confirmation was answered at
 * or after that question's answer. Re-answering Q3 or Q6 (for example after starting insulin)
 * therefore needs a fresh confirmation; this read-time rule also covers imported data.
 */
export function readinessInputFromRows(
  rows: readonly ReadinessRow[],
  birthYear: number | null,
  today: LocalDate,
  wording: Readonly<Record<ReadinessId, number>> = READINESS_WORDING,
): ReadinessInput {
  const current = new Map<ReadinessId, ReadinessRow>();
  for (const row of rows) {
    if (!Object.hasOwn(wording, row.questionId) || row.wordingVersion !== wording[row.questionId])
      continue;
    const previous = current.get(row.questionId);
    if (previous === undefined || previous.answeredAt < row.answeredAt)
      current.set(row.questionId, row);
  }
  const answers = Object.fromEntries(
    READINESS_QUESTION_IDS.map((q) => [q, current.get(q)?.answer ?? null]),
  ) as Record<ReadinessQuestionId, YesNo | null>;
  const confirmations = Object.fromEntries(
    READINESS_CONFIRMATION_IDS.map((c) => {
      const confirmation = current.get(c);
      const question = current.get(CONFIRMATION_QUESTION[c]);
      const counts =
        confirmation?.answer === 'yes' &&
        question !== undefined &&
        confirmation.answeredAt >= question.answeredAt;
      return [c, counts];
    }),
  ) as Record<ReadinessConfirmationId, boolean>;
  let minimumAgeYears: number | null = null;
  if (birthYear !== null) {
    const year = new Date(parseLocalDate(today)).getUTCFullYear();
    minimumAgeYears = birthYear > year ? 0 : minimumAgeFromBirthYear(birthYear, today);
  }
  return { answers, confirmations, minimumAgeYears };
}

/** Questions with no current answer, in order (drives "resume onboarding" and the after-import prompt; C41, RD-08). */
export function missingReadinessAnswers(input: ReadinessInput): ReadinessQuestionId[] {
  return READINESS_QUESTION_IDS.filter((q) => input.answers[q] === null);
}

/**
 * The answers that switch the keto carb ceiling off entirely: Q1 (or a birth year that could be
 * under 18), Q2 and Q5. D30 as changed by the orchestrator on 19 Oct 2026: question 5
 * (eating-disorder history or low weight) switches the keto carb ceiling off entirely, like
 * questions 1 and 2, in addition to its existing rules (no Kickstart, no deficit, no fasting, no
 * projection band, no goal setting; DECISIONS C06/C07/C41 row). Meals are still planned, with no
 * carb ceiling. The stored diet mode, ceilings and Kickstart opt-in are kept but ignored while
 * gated (RD-06: no data lost). Item 13's readinessGates reads this list.
 */
export const KETO_CEILING_CLOSED_BY = Object.freeze([
  'q1',
  'q2',
  'q5',
] as const satisfies readonly ReadinessQuestionId[]);

/**
 * Outputs of the single gate function `readinessGates(input)` (section 13.3; C54), built and
 * tested at item 13 and fixed here so items 13–15, 21, 22 and 28 agree. gated(q) is
 * `answers[q] !== 'no'`, so an unanswered question counts as yes (C41). "Q3 open" below means
 * gated(q3) and not prescriberAgreed.
 */
export interface ReadinessGates {
  /** gated(q1), or minimumAgeYears < 18 (HS section 1; C24 point 3). */
  readonly under18: boolean;
  /** under18, gated(q2), gated(q5) or Q3 open (HS-03 as reworded per C54; C07). */
  readonly fastingGated: boolean;
  /** not (under18, gated(q2) or gated(q5)) and not Q3 open (DECISIONS C06/C07/C41 row). */
  readonly kickstartAvailable: boolean;
  /** Kickstart and Steady deficits: not (under18, gated(q2) or gated(q5)). Otherwise plan at the estimate, never below the floor. */
  readonly deficitAllowed: boolean;
  /**
   * Any keto carb ceiling: not (under18, gated(q2) or gated(q5)); see KETO_CEILING_CLOSED_BY
   * (HS section 1; D30 as changed: Q5 switches the keto ceiling off entirely). When false there is
   * no carb ceiling and meals are still planned.
   */
  readonly ketoCeilingAvailable: boolean;
  /** Ceilings below 50 g and the 20 g Kickstart ceiling: ketoCeilingAvailable and not Q3 open (DECISIONS C06 row). */
  readonly carbCeilingBelow50Allowed: boolean;
  /** deficitAllowed (and, at use, an active carb ceiling) (DECISIONS; C27). */
  readonly projectionBandAvailable: boolean;
  /** not (under18 or gated(q5)) (HS section 1: Q5, and "planner only" for Q1). */
  readonly goalSettingAvailable: boolean;
  /** not under18 (DECISIONS C06/C07/C41 row). */
  readonly energyEstimateAvailable: boolean;
  /** not under18 (HS section 1). */
  readonly alcoholLoggingAvailable: boolean;
  /** not gated(q6), or gpExerciseDiscussed (HS section 1; RD-05). */
  readonly exercisePlansAvailable: boolean;
  /** gated(q4) (C41, C102). */
  readonly pharmacistReminder: boolean;
  /** gated(q4) (C102). */
  readonly bloodPressureSaltWording: boolean;
  /** gated(q7) (C58; AL-09). */
  readonly alcoholHelpCardFromDayOne: boolean;
  /** Plain-language reason ids for each closed gate (RD-01 to RD-05), defined at item 13. */
  readonly reasons: readonly string[];
}
