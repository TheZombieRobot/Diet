import { effectiveProteinTargetG, type TargetsRecord } from '@diet/core';
import { schedule } from '@diet/core/copy/health';
import { Button, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { saveSchedule } from '../../onboarding/actions';
import { GateNotice } from '../../onboarding/GateNotice';
import { checkScheduleDraft, type ScheduleDraft, scheduleDraftFrom } from '../../onboarding/drafts';
import { ScheduleForm } from '../../onboarding/forms/ScheduleForm';
import { type ReadinessGateView, useReadinessGates } from '../../onboarding/state';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { useStore } from '../../store';

const readTargets = (storage: AppStorage): Promise<TargetsRecord> => storage.repos.targets.get();

/**
 * Settings, Eating schedule (item 13 design section 3.12): while fasting is gated, only the reason
 * (the stored schedule is kept, RD-06); otherwise the schedule form, starting from what is stored,
 * with "No fasting plan for now" chosen when nothing is.
 */
export function EatingScheduleScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  const view = useReadinessGates(storage);
  const targets = useLiveQuery(storage, readTargets);
  if (storage === null || view === undefined || targets === undefined) return null;
  if (view.gates.fastingGated) return <GateNotice feature="fasting" link />;
  return <ScheduleSettings storage={storage} view={view} targets={targets} />;
}

function ScheduleSettings({
  storage,
  view,
  targets,
}: {
  readonly storage: AppStorage;
  readonly view: ReadinessGateView;
  readonly targets: TargetsRecord;
}): ReactElement {
  const kickstartChosen = view.state.profile.kickstartOptIn && view.gates.kickstartAvailable;
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    scheduleDraftFrom({
      targets,
      scheduleConfirmed: true,
      pharmacistReminder: view.gates.pharmacistReminder,
      kickstartChosen,
    }),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [refused, setRefused] = useState(0);
  const [saved, setSaved] = useState(false);
  const list = useRef<HTMLInputElement>(null);
  const save = useSave();

  useEffect(() => {
    if (refused > 0) list.current?.focus();
  }, [refused]);

  const onSave = () => {
    const checked = checkScheduleDraft(draft);
    if (!checked.ok) {
      setShowErrors(true);
      setSaved(false);
      if (checked.problem === 'choose-pattern') setRefused((n) => n + 1);
      return;
    }
    void save.run(() => saveSchedule(storage, checked.save, 'settings')).then(setSaved);
  };

  return (
    <>
      {targets.fastingPreset === null ? (
        <p className="ui-text-muted">{schedule.noneSaved}</p>
      ) : null}
      <ScheduleForm
        mode="settings"
        draft={draft}
        onDraftChange={(next) => {
          setSaved(false);
          setDraft(next);
        }}
        kickstartChosen={kickstartChosen}
        proteinG={effectiveProteinTargetG('kickstart', targets.proteinRangeG)}
        pharmacistNote={view.gates.pharmacistReminder}
        diabetesNote={view.input.answers.q3 === 'yes' && view.input.confirmations.prescriberAgreed}
        storedKickstartDefault={targets.presetChosenBy === 'kickstart-default'}
        showErrors={showErrors}
        listRef={list}
        top={<SaveError save={save} />}
      />
      {saved ? (
        <Notice tone="info" role="status">
          <p>{schedule.saved}</p>
        </Notice>
      ) : null}
      <Button variant="primary" block disabled={save.busy} onClick={onSave}>
        {schedule.save}
      </Button>
    </>
  );
}
