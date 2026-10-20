import { effectiveProteinTargetG, fillTemplate, localDateOf, type TargetsRecord } from '@diet/core';
import { fasting, schedule } from '@diet/core/copy/health';
import { ActionRow, Button, ButtonRow, ChevronIcon, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { saveSchedule, scheduleTargetsPatch } from '../../onboarding/actions';
import { GateNotice } from '../../onboarding/GateNotice';
import {
  checkScheduleDraft,
  type ScheduleDraft,
  scheduleDraftFrom,
  scheduleDraftSavedAs,
} from '../../onboarding/drafts';
import { ScheduleForm } from '../../onboarding/forms/ScheduleForm';
import { type ReadinessGateView, useReadinessGates } from '../../onboarding/state';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { routeHref } from '../../routes';
import { useStore } from '../../store';
import { useStaleDays } from '../fasting/dayWindows';
import { dayList } from '../fasting/fastingText';
import { useWeightView } from '../weight/useWeightView';

const readTargets = (storage: AppStorage): Promise<TargetsRecord> => storage.repos.targets.get();

/** The way to the Fasting screen, which keeps the reflux log reachable while fasting is off (item 15). */
function FastingLink(): ReactElement {
  return (
    <ul className="ui-action-list">
      <li>
        <ActionRow
          href={routeHref('fasting')}
          title={fasting.pattern.fastingLink}
          badge={<ChevronIcon />}
        />
      </li>
    </ul>
  );
}

/**
 * Settings, Eating schedule (item 13 design section 3.12): while fasting is gated, only the reason
 * (the stored schedule is kept, RD-06); otherwise the schedule form, starting from what is stored,
 * with "No fasting plan for now" chosen when nothing is. "No eating schedule is saved yet" shows
 * only until a schedule (or no fasting plan) has been saved. A Kickstart default stored before
 * answer 4 turned yes is not used (C07): the form starts with nothing chosen and says so. Item 15
 * adds the way to the Fasting screen below either.
 */
export function EatingScheduleScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  const view = useReadinessGates(storage);
  const targets = useLiveQuery(storage, readTargets);
  if (storage === null || view === undefined || targets === undefined) return null;
  if (view.gates.fastingGated) {
    return (
      <>
        <GateNotice feature="fasting" link />
        <FastingLink />
      </>
    );
  }
  return (
    <>
      <ScheduleSettings storage={storage} view={view} targets={targets} />
      <FastingLink />
    </>
  );
}

/**
 * The one eating-schedule editor after setup (item 13's form in settings mode), here and on the
 * Fasting screen's Eating pattern card (item 15, F2). Before Save it names the per-day changes the
 * new pattern would remove (C30). With `onClose` it has Cancel, and closes after a save.
 */
export function ScheduleSettings({
  storage,
  view,
  targets,
  onClose,
}: {
  readonly storage: AppStorage;
  readonly view: ReadinessGateView;
  readonly targets: TargetsRecord;
  readonly onClose?: (() => void) | undefined;
}): ReactElement {
  const kickstartChosen = view.state.profile.kickstartOptIn && view.gates.kickstartAvailable;
  const { pharmacistReminder } = view.gates;
  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    scheduleDraftFrom({ targets, scheduleConfirmed: true, pharmacistReminder, kickstartChosen }),
  );
  // Opened on a set-aside Kickstart default (nothing chosen): the reason stays while the form is
  // open, also once item 14 has moved that default to 22:2 underneath it.
  const [openedSetAside] = useState(
    () => pharmacistReminder && targets.presetChosenBy === 'kickstart-default',
  );
  const [showErrors, setShowErrors] = useState(false);
  const [refused, setRefused] = useState<{ readonly n: number; readonly at: 'list' | 'window' }>({
    n: 0,
    at: 'list',
  });
  const [saved, setSaved] = useState(false);
  const list = useRef<HTMLInputElement>(null);
  const windowField = useRef<HTMLInputElement>(null);
  const save = useSave();

  useEffect(() => {
    if (refused.n === 0) return;
    (refused.at === 'list' ? list : windowField).current?.focus();
  }, [refused]);

  const onSave = () => {
    const checked = checkScheduleDraft(draft);
    if (!checked.ok) {
      setShowErrors(true);
      setSaved(false);
      setRefused(({ n }) => ({
        n: n + 1,
        at: checked.problem === 'choose-pattern' ? 'list' : 'window',
      }));
      return;
    }
    // The reflux preferences are the Reflux card's two switches here (item 15, F8).
    void save
      .run(() => saveSchedule(storage, { ...checked.save, reflux: null }))
      .then((ok) => {
        setSaved(ok);
        if (ok) onClose?.();
      });
  };

  const patch = useMemo(() => {
    const checked = checkScheduleDraft(draft);
    return checked.ok
      ? scheduleTargetsPatch(checked.save, targets, { pharmacistReminder, kickstartChosen })
      : null;
  }, [draft, targets, pharmacistReminder, kickstartChosen]);
  const stale = useStaleDays(storage, patch);
  const today = localDateOf(storage.env.now(), storage.env.timeZone());
  // Item 14's phase, for the due date of a running Kickstart (F39).
  const phase = useWeightView(storage)?.overview.phase;

  return (
    <>
      {targets.fastingPreset === null && view.state.settings.scheduleConfirmedAt === null ? (
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
        savedAs={scheduleDraftSavedAs(draft, targets)}
        proteinG={effectiveProteinTargetG('kickstart', targets.proteinRangeG)}
        pharmacistNote={pharmacistReminder}
        diabetesNote={view.input.answers.q3 === 'yes' && view.input.confirmations.prescriberAgreed}
        kickstartDefaultSetAside={
          pharmacistReminder && (openedSetAside || targets.presetChosenBy === 'kickstart-default')
        }
        kickstartRunsUntil={
          phase === undefined
            ? undefined
            : phase.kind === 'kickstart'
              ? phase.scheduledLastDay
              : null
        }
        showErrors={showErrors}
        listRef={list}
        windowRef={windowField}
        top={<SaveError save={save} />}
      />
      {saved ? (
        <Notice tone="info" role="status">
          <p>{schedule.saved}</p>
        </Notice>
      ) : null}
      {stale.length > 0 ? (
        <p>{fillTemplate(fasting.pattern.clearsChanges, { days: dayList(stale, today) })}</p>
      ) : null}
      {/* aria-disabled while saving keeps focus on the button; useSave refuses a second tap. */}
      {onClose === undefined ? (
        <Button variant="primary" block aria-disabled={save.busy} onClick={onSave}>
          {schedule.save}
        </Button>
      ) : (
        <ButtonRow>
          <Button variant="primary" aria-disabled={save.busy} onClick={onSave}>
            {schedule.save}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {fasting.card.cancel}
          </Button>
        </ButtonRow>
      )}
    </>
  );
}
