import {
  type GateInput,
  READINESS_QUESTION_IDS,
  type ReadinessQuestionId,
  type YesNo,
} from '@diet/core';
import { readiness } from '@diet/core/copy/health';
import { Button, ButtonRow, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { answerReadiness } from '../actions';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';
import { ConfirmationControl } from './ConfirmationControl';

/**
 * Yes and No for one question, showing what is stored (aria-pressed). A tap on the stored answer
 * writes nothing (E6); a failed write shows its message under the buttons (section 3.15). With
 * `askBeforeEndingKickstart` (Settings), an answer that would end a running Kickstart is saved only
 * after "Save and end Kickstart"; Cancel saves nothing (F23, F32).
 */
export function AnswerButtons({
  storage,
  question,
  answer,
  labelledBy,
  onAnswered,
  askBeforeEndingKickstart = false,
}: {
  readonly storage: AppStorage;
  readonly question: ReadinessQuestionId;
  readonly answer: YesNo | null;
  readonly labelledBy?: string | undefined;
  /** After the answer is stored (or was already stored). */
  readonly onAnswered?: ((answer: YesNo) => void) | undefined;
  readonly askBeforeEndingKickstart?: boolean | undefined;
}): ReactElement {
  const save = useSave();
  const [confirming, setConfirming] = useState<YesNo | null>(null);
  const group = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (confirming !== null) title.current?.focus();
  }, [confirming]);
  const tap = (value: YesNo, endKickstart: boolean) => {
    let asked = false;
    void save
      .run(async () => {
        const result = await answerReadiness(storage, question, value, {
          askBeforeEndingKickstart: askBeforeEndingKickstart && !endKickstart,
        });
        asked = result.kickstartEndNeedsConfirm;
      })
      .then((ok) => {
        setConfirming(ok && asked ? value : null);
        if (ok && !asked) onAnswered?.(value);
      });
  };
  return (
    <>
      <div ref={group} role="group" aria-labelledby={labelledBy}>
        <ButtonRow>
          {(['yes', 'no'] as const).map((value) => (
            <Button
              key={value}
              className="ui-button--tall"
              aria-pressed={answer === value}
              // Not `disabled` while saving: that would drop focus from the tapped button.
              aria-disabled={save.busy}
              onClick={() => {
                tap(value, false);
              }}
            >
              {readiness[value]}
            </Button>
          ))}
        </ButtonRow>
      </div>
      {confirming === null ? null : (
        <Notice>
          <p ref={title} tabIndex={-1} className="ui-text-strong ui-step-start">
            {readiness.endsKickstart.title}
          </p>
          <p>{readiness.endsKickstart.answer}</p>
          <ButtonRow>
            <Button
              variant="caution"
              aria-disabled={save.busy}
              onClick={() => {
                tap(confirming, true);
              }}
            >
              {readiness.endsKickstart.confirm}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(null);
                // Back to the answer that is still stored (or the first button, with none).
                const buttons = group.current?.querySelectorAll<HTMLButtonElement>('button');
                const stored = [...(buttons ?? [])].find(
                  (b) => b.getAttribute('aria-pressed') === 'true',
                );
                (stored ?? buttons?.[0])?.focus();
              }}
            >
              {readiness.endsKickstart.cancel}
            </Button>
          </ButtonRow>
        </Notice>
      )}
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
      <AnswerButtons
        storage={storage}
        question={question}
        answer={answer}
        labelledBy={id}
        askBeforeEndingKickstart
      />
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
