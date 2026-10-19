import { fillTemplate, type GateInput, type ReadinessQuestionId, type YesNo } from '@diet/core';
import { onboarding, readiness } from '@diet/core/copy/health';
import { Button, Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { AnswerButtons } from '../forms/ReadinessList';
import { ConfirmationControl } from '../forms/ConfirmationControl';
import { consequenceText } from '../readinessText';

/**
 * One readiness question (UX 1c; HEALTH_SAFETY section 1; C41). There is no Next: an unanswered
 * question cannot be passed. "No" moves on; "Yes" stays and says what it switches off, with the
 * confirmation switch for questions 3 and 6, and Continue. Tap only, no swipe (E5).
 */
export function QuestionStep({
  frame,
  storage,
  question,
  position,
  count,
  showIntro,
  input,
  showingYes,
  onAnswered,
  onContinue,
  onBack,
}: {
  readonly frame: FlowFrame;
  readonly storage: AppStorage;
  readonly question: ReadinessQuestionId;
  readonly position: number;
  readonly count: number;
  /** Question 1 of a setup: the intro paragraph above it. */
  readonly showIntro: boolean;
  readonly input: GateInput;
  readonly showingYes: boolean;
  readonly onAnswered: (answer: YesNo) => void;
  readonly onContinue: () => void;
  readonly onBack: (() => void) | null;
}): ReactElement {
  const answer = input.answers[question];
  const yesShown = showingYes && answer === 'yes';
  return (
    <FlowStepFrame
      frame={frame}
      heading={readiness.questions[question]}
      eyebrow={
        <>
          {showIntro ? (
            <>
              <p className="ui-text-strong">{readiness.title}</p>
              <p>{readiness.intro}</p>
            </>
          ) : null}
          <p className="ui-text-muted">
            {fillTemplate(readiness.questionOf, { n: position, count })}
          </p>
        </>
      }
      footer={
        yesShown || onBack !== null ? (
          <>
            {yesShown ? (
              <Button variant="primary" block onClick={onContinue}>
                {onboarding.frame.continue}
              </Button>
            ) : null}
            {onBack === null ? null : (
              <Button variant="quiet" onClick={onBack}>
                {onboarding.frame.back}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <AnswerButtons
        storage={storage}
        question={question}
        answer={answer}
        onAnswered={onAnswered}
      />
      {yesShown ? (
        <div className="ui-card__body" data-testid="consequence">
          <Notice tone="info">
            <p>{consequenceText(question, input)}</p>
          </Notice>
          {question === 'q3' || question === 'q6' ? (
            <ConfirmationControl storage={storage} question={question} input={input} />
          ) : null}
        </div>
      ) : null}
    </FlowStepFrame>
  );
}
