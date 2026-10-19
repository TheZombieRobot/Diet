import {
  type GateInput,
  READINESS_QUESTION_IDS,
  type ReadinessQuestionId,
  type YesNo,
} from '@diet/core';
import { readiness } from '@diet/core/copy/health';
import { Button, ButtonRow } from '@diet/ui';
import { type ReactElement, useId } from 'react';
import type { AppStorage } from '../../db/runtime';
import { answerReadiness } from '../actions';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';
import { ConfirmationControl } from './ConfirmationControl';

/**
 * Yes and No for one question, showing what is stored (aria-pressed). A tap on the stored answer
 * writes nothing (E6); a failed write shows its message under the buttons (section 3.15).
 */
export function AnswerButtons({
  storage,
  question,
  answer,
  labelledBy,
  onAnswered,
}: {
  readonly storage: AppStorage;
  readonly question: ReadinessQuestionId;
  readonly answer: YesNo | null;
  readonly labelledBy?: string | undefined;
  /** After the answer is stored (or was already stored). */
  readonly onAnswered?: ((answer: YesNo) => void) | undefined;
}): ReactElement {
  const save = useSave();
  const tap = (value: YesNo) => {
    void save
      .run(() => answerReadiness(storage, question, value))
      .then((ok) => {
        if (ok) onAnswered?.(value);
      });
  };
  return (
    <>
      <div role="group" aria-labelledby={labelledBy}>
        <ButtonRow>
          {(['yes', 'no'] as const).map((value) => (
            <Button
              key={value}
              className="ui-button--tall"
              aria-pressed={answer === value}
              disabled={save.busy}
              onClick={() => {
                tap(value);
              }}
            >
              {readiness[value]}
            </Button>
          ))}
        </ButtonRow>
      </div>
      <SaveError save={save} />
    </>
  );
}

function ReadinessRow({
  storage,
  question,
  input,
}: {
  readonly storage: AppStorage;
  readonly question: ReadinessQuestionId;
  readonly input: GateInput;
}): ReactElement {
  const id = useId();
  const answer = input.answers[question];
  return (
    <li className="ui-card__body" data-testid={`readiness-${question}`}>
      <p id={id} className="ui-text-strong">
        {readiness.questions[question]}
      </p>
      {answer === null ? <p className="ui-text-muted">{readiness.unanswered}</p> : null}
      <AnswerButtons storage={storage} question={question} answer={answer} labelledBy={id} />
      {answer === 'yes' && (question === 'q3' || question === 'q6') ? (
        <ConfirmationControl storage={storage} question={question} input={input} />
      ) : null}
    </li>
  );
}

/** Settings, Readiness answers: every question with its stored answer; each tap writes at once (RD-06). */
export function ReadinessList({
  storage,
  input,
}: {
  readonly storage: AppStorage;
  readonly input: GateInput;
}): ReactElement {
  return (
    <ul className="ui-rows">
      {READINESS_QUESTION_IDS.map((q) => (
        <ReadinessRow key={q} storage={storage} question={q} input={input} />
      ))}
    </ul>
  );
}
