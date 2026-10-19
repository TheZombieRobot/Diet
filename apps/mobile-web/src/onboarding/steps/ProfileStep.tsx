import {
  checkProfileForm,
  type GateInput,
  localDateOf,
  type ProfileDraft,
  type ReadinessGates,
  type ReadinessQuestionId,
} from '@diet/core';
import { onboarding, profile as copy } from '@diet/core/copy/health';
import { Button, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { saveProfile } from '../actions';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { ProfileForm } from '../forms/ProfileForm';
import { focusFirstInvalid } from '../forms/profileErrors';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';

/** The profile step (UX 1d; item 13 design section 3.8). */
export function ProfileStep({
  frame,
  storage,
  input,
  draft,
  onDraftChange,
  onSaved,
  onBack,
  onChangeAnswer,
}: {
  readonly frame: FlowFrame;
  readonly storage: AppStorage;
  readonly input: GateInput;
  readonly draft: ProfileDraft;
  readonly onDraftChange: (draft: ProfileDraft) => void;
  readonly onSaved: (gates: ReadinessGates) => void;
  readonly onBack: () => void;
  readonly onChangeAnswer: (question: ReadinessQuestionId) => void;
}): ReactElement {
  const { env } = storage;
  const today = localDateOf(env.now(), env.timeZone());
  const thisYear = Number(today.slice(0, 4));
  const check = checkProfileForm(draft, {
    mode: 'onboarding',
    readiness: input,
    storedWeightKg: null,
    today,
    storedGoalKg: null,
  });
  const [showErrors, setShowErrors] = useState(false);
  const [refused, setRefused] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const save = useSave();

  useEffect(() => {
    if (refused > 0) focusFirstInvalid(form.current);
  }, [refused]);

  const onContinue = () => {
    const { value } = check;
    if (value === null) {
      setShowErrors(true);
      setRefused((n) => n + 1);
      return;
    }
    let gates: ReadinessGates | null = null;
    void save
      .run(async () => {
        gates = (await saveProfile(storage, value, 'onboarding')).gates;
      })
      .then((ok) => {
        if (ok && gates !== null) onSaved(gates);
      });
  };

  const hasProblems = showErrors && check.value === null;
  return (
    <FlowStepFrame
      frame={frame}
      heading={copy.title}
      footer={
        <>
          <Button variant="primary" block disabled={save.busy} onClick={onContinue}>
            {onboarding.frame.continue}
          </Button>
          <Button variant="quiet" onClick={onBack}>
            {onboarding.frame.back}
          </Button>
        </>
      }
    >
      <p>{copy.intro}</p>
      <ProfileForm
        mode="onboarding"
        draft={draft}
        onDraftChange={onDraftChange}
        check={check}
        showErrors={showErrors}
        thisYear={thisYear}
        onChangeAnswer={onChangeAnswer}
        formRef={form}
        top={
          <>
            {hasProblems ? (
              <Notice role="alert">
                <p>{onboarding.frame.fixBelow}</p>
              </Notice>
            ) : null}
            <SaveError save={save} />
          </>
        }
      />
    </FlowStepFrame>
  );
}
