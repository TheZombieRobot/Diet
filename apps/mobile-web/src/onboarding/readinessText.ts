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

/**
 * A hidden feature's reasons in words (item 15 design 1.1 item 2): the stated ones as
 * featureOffText, then the unanswered ones as questions still to answer, so a question nobody
 * answered is never put to the person as a fact (C41).
 */
export function featureOffReasonsText(
  feature: GatedFeature,
  stated: readonly ReadinessReasonId[],
  unanswered: readonly ReadinessReasonId[],
): string {
  const lines = stated.length === 0 ? [] : [featureOffText(feature, stated)];
  if (unanswered.length > 0) {
    const template =
      unanswered.length === 1
        ? readiness.featureOffUnansweredOne
        : readiness.featureOffUnansweredMany;
    lines.push(
      fillTemplate(template, {
        feature: readiness.featureNames[feature],
        reasons: joinList(
          unanswered.map((r) => readiness.reasonPhrases[r]),
          readiness.listComma,
          readiness.listAnd,
        ),
      }),
    );
  }
  return lines.join(' ');
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
