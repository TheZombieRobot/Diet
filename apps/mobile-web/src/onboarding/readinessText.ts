/** Readiness wording put together from health.ts (item 13 design sections 3.6, 3.7 and 3.13). */
import {
  fillTemplate,
  type GatedFeature,
  type GateInput,
  joinList,
  type ReadinessQuestionId,
  type ReadinessReasonId,
} from '@diet/core';
import { readiness } from '@diet/core/copy/health';

/** "Fasting is off because of what you told the app about diabetes medication." */
export function featureOffText(
  feature: GatedFeature,
  reasons: readonly ReadinessReasonId[],
): string {
  return fillTemplate(readiness.featureOff, {
    feature: readiness.featureNames[feature],
    reasons: joinList(
      reasons.map((r) => readiness.reasonPhrases[r]),
      readiness.listComma,
      readiness.listAnd,
    ),
  });
}

/** The consequence of a yes to one question, or the confirmed wording for 3 and 6 (D29). */
export function consequenceText(question: ReadinessQuestionId, input: GateInput): string {
  if (question === 'q3' && input.confirmations.prescriberAgreed) {
    return readiness.confirmed.prescriberAgreed;
  }
  if (question === 'q6' && input.confirmations.gpExerciseDiscussed) {
    return readiness.confirmed.gpExerciseDiscussed;
  }
  return readiness.ifYes[question];
}
