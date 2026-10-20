import {
  fillTemplate,
  type GateInput,
  type ReadinessGates,
  type ReadinessQuestionId,
  type YesNo,
} from '@diet/core';
import { onboarding, readiness } from '@diet/core/copy/health';
import { Button, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef } from 'react';
import type { AppStorage } from '../../db/runtime';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { AnswerButtons } from '../forms/ReadinessList';
import { ConfirmationControl } from '../forms/ConfirmationControl';
import { consequenceText } from '../readinessText';

/**
 * One readiness question (UX 1c; HEALTH_SAFETY section 1; C41). There is no Next: an unanswered
 * question cannot be passed. "No" moves on; "Yes" stays and says what it switches off, with the
 * confirmation switch for questions 3 and 6, and Continue, once the yes is saved with its effects.
 * A question already answered yes (reached with Back) shows the same at once, so it always has a
 * way forward. Tap only, no swipe (E5).
 */
export function QuestionStep({
  frame,
  storage,
  question,
  position,
  count,
  showIntro,
  input,
  gates,
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
  readonly gates: ReadinessGates;
  readonly showingYes: boolean;
  readonly onAnswered: (answer: YesNo) => void;
  readonly onContinue: () => void;
  readonly onBack: (() => void) | null;
}): ReactElement {
  const answer = input.answers[question];
  const yesShown = showingYes && answer === 'yes';
  // After a Yes tap, focus moves to what it switches off, so a screen reader hears it: at once
  // when it shows already, or as soon as the stored yes shows it.
  const consequence = useRef<HTMLDivElement>(null);
  const focusWhenShown = useRef(false);
  useEffect(() => {
    if (!yesShown || !focusWhenShown.current) return;
    focusWhenShown.current = false;
    consequence.current?.focus();
  }, [yesShown]);
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
        onAnswered={(value) => {
          if (value === 'yes') {
            if (consequence.current === null) focusWhenShown.current = true;
            else consequence.current.focus();
          }
          onAnswered(value);
        }}
      />
      {yesShown ? (
        <div
          ref={consequence}
          tabIndex={-1}
          className="ui-card__body ui-step-start"
          data-testid="consequence"
        >
          <Notice tone="info">
            <p>{consequenceText(question, input, gates)}</p>
          </Notice>
          {question === 'q3' || question === 'q6' ? (
            <ConfirmationControl storage={storage} question={question} input={input} />
          ) : null}
        </div>
      ) : null}
    </FlowStepFrame>
  );
}
