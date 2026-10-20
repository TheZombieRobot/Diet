import {
  effectiveProteinTargetG,
  type GateInput,
  type ReadinessGates,
  type TargetsRecord,
} from '@diet/core';
import { onboarding, schedule } from '@diet/core/copy/health';
import { Button } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { saveSchedule } from '../actions';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import {
  checkScheduleDraft,
  type ScheduleBasis,
  type ScheduleDraft,
  scheduleDraftFits,
  scheduleDraftFrom,
  scheduleDraftSavedAs,
} from '../drafts';
import { ScheduleForm } from '../forms/ScheduleForm';
import type { OnboardingState } from '../state';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';

const readTargets = (storage: AppStorage): Promise<TargetsRecord> => storage.repos.targets.get();

/**
 * The eating-schedule step (UX 1e; item 13 design section 3.9). Left out while fasting is gated. A
 * draft started under other gates (answer 4 or the Kickstart choice changed since) is set aside,
 * so the form starts again from the stored records: nothing chosen with answer 4 (C07, E49), and
 * the default for the Kickstart choice otherwise (C55).
 */
export function ScheduleStep({
  frame,
  storage,
  state,
  input,
  gates,
  draft,
  onDraftChange,
  onSaved,
  onBack,
}: {
  readonly frame: FlowFrame;
  readonly storage: AppStorage;
  readonly state: OnboardingState;
  readonly input: GateInput;
  readonly gates: ReadinessGates;
  readonly draft: ScheduleDraft | undefined;
  readonly onDraftChange: (draft: ScheduleDraft) => void;
  readonly onSaved: () => void;
  readonly onBack: () => void;
}): ReactElement {
  const targets = useLiveQuery(storage, readTargets);
  const kickstartChosen = state.profile.kickstartOptIn && gates.kickstartAvailable;
  const basis: ScheduleBasis = { pharmacistReminder: gates.pharmacistReminder, kickstartChosen };
  const [showErrors, setShowErrors] = useState(false);
  const [refused, setRefused] = useState<{ readonly n: number; readonly at: 'list' | 'window' }>({
    n: 0,
    at: 'list',
  });
  const list = useRef<HTMLInputElement>(null);
  const windowField = useRef<HTMLInputElement>(null);
  const save = useSave();
  const current =
    draft !== undefined && scheduleDraftFits(draft, basis)
      ? draft
      : targets === undefined
        ? undefined
        : scheduleDraftFrom({
            targets,
            scheduleConfirmed: state.settings.scheduleConfirmedAt !== null,
            ...basis,
          });

  useEffect(() => {
    if (refused.n === 0) return;
    (refused.at === 'list' ? list : windowField).current?.focus();
  }, [refused]);

  const onContinue = () => {
    if (current === undefined) return;
    const checked = checkScheduleDraft(current);
    if (!checked.ok) {
      setShowErrors(true);
      setRefused(({ n }) => ({
        n: n + 1,
        at: checked.problem === 'choose-pattern' ? 'list' : 'window',
      }));
      return;
    }
    void save
      .run(() => saveSchedule(storage, checked.save))
      .then((ok) => {
        if (ok) onSaved();
      });
  };

  return (
    <FlowStepFrame
      frame={frame}
      heading={schedule.title}
      footer={
        <>
          <Button
            variant="primary"
            block
            disabled={save.busy || current === undefined}
            onClick={onContinue}
          >
            {onboarding.frame.continue}
          </Button>
          <Button variant="quiet" onClick={onBack}>
            {onboarding.frame.back}
          </Button>
        </>
      }
    >
      {current === undefined || targets === undefined ? null : (
        <ScheduleForm
          mode="onboarding"
          draft={current}
          onDraftChange={onDraftChange}
          kickstartChosen={kickstartChosen}
          savedAs={scheduleDraftSavedAs(current, targets)}
          proteinG={effectiveProteinTargetG('kickstart', targets.proteinRangeG)}
          pharmacistNote={gates.pharmacistReminder}
          diabetesNote={input.answers.q3 === 'yes' && input.confirmations.prescriberAgreed}
          showErrors={showErrors}
          listRef={list}
          windowRef={windowField}
          top={<SaveError save={save} />}
        />
      )}
    </FlowStepFrame>
  );
}
