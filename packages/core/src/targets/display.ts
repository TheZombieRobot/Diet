/**
 * What a readiness answer does to how the figures are shown (HEALTH_SAFETY section 1; C41; item
 * 21 design section 3.10; T25, T26). Item 22's planner views use the same flags.
 */
import { type GateInput, isGated } from '../readiness/gates';
import {
  missingReadinessAnswers,
  type ReadinessGates,
  type ReadinessQuestionId,
} from '../storage/readiness';

export interface TargetDisplay {
  /**
   * Intake as plain numbers, with no "of" target, no bars and no colour state (T25): under 18 (by
   * answer or birth year), answer 5 "yes" or unanswered, or a current weight below BMI 18.5, which
   * applies answer 5's settings (HS-35).
   */
  readonly plainFigures: boolean;
  /** Answer 2 "yes" or unanswered: energy shown plain, with the pregnancy note (T26). */
  readonly pregnancyNote: boolean;
  /** The questions with no current answer, for the "some questions have no answer" notice. */
  readonly missingAnswers: readonly ReadinessQuestionId[];
  /** Why there is no energy estimate, for the wording; null when there is one (T32). */
  readonly estimateGate: 'unanswered' | 'under-18-answer' | 'under-18-birth-year' | null;
}

export function targetDisplay(input: GateInput, gates: ReadinessGates): TargetDisplay {
  const { q1 } = input.answers;
  return {
    plainFigures:
      gates.under18 || isGated(input.answers.q5) || (input.lowWeight as unknown) !== false,
    pregnancyNote: isGated(input.answers.q2),
    missingAnswers: missingReadinessAnswers(input),
    estimateGate: gates.energyEstimateAvailable
      ? null
      : q1 === null
        ? 'unanswered'
        : isGated(q1)
          ? 'under-18-answer'
          : 'under-18-birth-year',
  };
}
