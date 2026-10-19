import { fillTemplate } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Notice } from '@diet/ui';
import { useState, type ReactElement, type RefObject } from 'react';
import { StorageClosedError, StorageFullError } from '../../db/errors';
import { createExport, createRescueCopy, type UncheckedSource } from '../../db/exportBackup';
import { readGeneration } from '../../db/generation';
import type { AppStorage } from '../../db/runtime';
import { formatLocalTime } from '../../format';
import { useStore } from '../../store';
import { useStepFocus } from './focus';
import { LockFields } from './LockFields';
import { LOCKED_BY_DEFAULT, type LockChoice, lockProblem, passwordOf } from './lockChoice';
import { type PendingCheck, pendingCheckStore, setPendingCheck } from './pendingCheck';
import { Progress } from './Progress';

type Step =
  | { readonly kind: 'form' }
  | { readonly kind: 'working'; readonly locked: boolean }
  /** "Can you see the file?" — `resumed` when the owner came back to it unanswered. */
  | { readonly kind: 'ask'; readonly resumed: boolean }
  | { readonly kind: 'recorded'; readonly locked: boolean }
  | { readonly kind: 'not-confirmed' }
  /** Yes, but this tab's records are closed: the question is kept for after the reload. */
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'refused';
      readonly message: string;
      readonly unchecked: UncheckedSource | null;
    }
  | { readonly kind: 'unchecked-saved'; readonly fileName: string; readonly at: string };

export interface ExportPanelProps {
  readonly storage: AppStorage;
  /** Called when the owner closes the panel after the backup is recorded. */
  readonly onDone: () => void;
  /** The lock switch, so "Export … first" and "Back up now" can move focus to it. */
  readonly switchRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Export a backup (storage spec section 10.5; BK-01, BK-03; D19, D21, D22). The lock is on by
 * default. After the download, the owner is asked "Can you see the file?" (with where to look on
 * Android, and the "(1)" a second file of the day gets): only Yes records the backup, and then the
 * panel says to copy a locked file off the phone too, or that a plain file should not be sent as
 * it is. No records nothing. Leaving without answering keeps the question (pendingCheck.ts), so
 * it is asked again when the owner comes back. Yes counts only while the records are the ones the
 * file was made from (generation.ts); while this tab's records are closed it asks to reload and
 * answer again. When the self-check fails, an unchecked copy can still be saved, and it does not
 * count as a backup.
 */
export function ExportPanel({ storage, onDone, switchRef }: ExportPanelProps): ReactElement {
  const copy = privacy.exportBackup;
  const pending = useStore(pendingCheckStore);
  const [choice, setChoice] = useState<LockChoice>(LOCKED_BY_DEFAULT);
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(() =>
    pendingCheckStore.get() === null ? { kind: 'form' } : { kind: 'ask', resumed: true },
  );
  const stepStart = useStepFocus<HTMLParagraphElement>(step.kind);
  const timeOf = (at: string) => formatLocalTime(at, storage.env.timeZone());

  const exportNow = async (): Promise<void> => {
    const refused = lockProblem(choice);
    setProblem(refused);
    if (refused !== null) return;
    setStep({ kind: 'working', locked: choice.locked });
    try {
      const outcome = await createExport(storage.db, storage.env, passwordOf(choice));
      if (outcome.ok) {
        storage.platform.download(outcome.file.text, outcome.fileName);
        setChoice(LOCKED_BY_DEFAULT);
        setPendingCheck({
          fileName: outcome.fileName,
          exportedAt: outcome.file.exportedAt,
          generation: readGeneration(storage.platform.localStorage),
        });
        setStep({ kind: 'ask', resumed: false });
        return;
      }
      if (outcome.unchecked === null) setChoice(LOCKED_BY_DEFAULT);
      setStep({ kind: 'refused', message: outcome.error.message, unchecked: outcome.unchecked });
    } catch {
      setChoice(LOCKED_BY_DEFAULT);
      setStep({ kind: 'refused', message: copy.exportFailed, unchecked: null });
    }
  };

  const saveUnchecked = async (source: UncheckedSource): Promise<void> => {
    const refused = lockProblem(choice);
    setProblem(refused);
    if (refused !== null) return;
    try {
      const saved = await createRescueCopy(source, storage.env, passwordOf(choice));
      storage.platform.download(saved.file.text, saved.fileName);
      setChoice(LOCKED_BY_DEFAULT);
      setStep({ kind: 'unchecked-saved', fileName: saved.fileName, at: source.exportedAt });
    } catch {
      setFailure(privacy.rescue.failed);
    }
  };

  const confirmSeen = async (check: PendingCheck): Promise<void> => {
    // The records were replaced or deleted after the file was made (in another tab, or before a
    // reload): the file does not hold them, so it is not recorded as their backup.
    if (check.generation !== readGeneration(storage.platform.localStorage)) {
      setPendingCheck(null);
      setStep({
        kind: 'refused',
        message: fillTemplate(copy.notRecordedChanged, { fileName: check.fileName }),
        unchecked: null,
      });
      return;
    }
    try {
      await storage.repos.settings.recordBackup(check.exportedAt);
      setPendingCheck(null);
      setStep({ kind: 'recorded', locked: /-locked\.json$/.test(check.fileName) });
    } catch (error) {
      if (error instanceof StorageClosedError) {
        // A restore or delete-all here did not finish: the file is there, and the question is
        // kept, so it can be answered after the reload.
        setStep({ kind: 'closed' });
        return;
      }
      // Recording failed (a full phone): the backup is not counted.
      setPendingCheck(null);
      const message = error instanceof StorageFullError ? error.message : copy.notConfirmed;
      setStep({ kind: 'refused', message, unchecked: null });
    }
  };

  switch (step.kind) {
    case 'ask': {
      if (pending === null) return renderForm();
      return (
        <div className="ui-card__body" data-testid="export-ask">
          {step.resumed ? (
            <p ref={stepStart} tabIndex={-1} className="ui-step-start ui-text-strong">
              {fillTemplate(copy.pendingCheck, {
                fileName: pending.fileName,
                time: timeOf(pending.exportedAt),
              })}
            </p>
          ) : null}
          <p ref={step.resumed ? undefined : stepStart} tabIndex={-1} className="ui-step-start">
            {fillTemplate(copy.checkDownloads, {
              fileName: pending.fileName,
              time: timeOf(pending.exportedAt),
            })}
          </p>
          <p className="ui-text-strong">{copy.canYouSeeIt}</p>
          <ButtonRow>
            <Button variant="primary" onClick={() => void confirmSeen(pending)}>
              {copy.yes}
            </Button>
            <Button
              onClick={() => {
                setPendingCheck(null);
                setStep({ kind: 'not-confirmed' });
              }}
            >
              {copy.no}
            </Button>
          </ButtonRow>
        </div>
      );
    }
    case 'recorded':
      return (
        <div className="ui-card__body" data-testid="export-recorded">
          <p ref={stepStart} tabIndex={-1} className="ui-step-start">
            {step.locked ? copy.recorded : copy.recordedPlain}
          </p>
          <Button onClick={onDone}>{copy.close}</Button>
        </div>
      );
    case 'closed':
      return (
        <div className="ui-card__body" data-testid="export-closed">
          <Notice role="status">
            <p ref={stepStart} tabIndex={-1} className="ui-step-start">
              {copy.notRecordedClosed}
            </p>
          </Notice>
          <Button variant="primary" onClick={storage.platform.reload}>
            {privacy.backupCard.reload}
          </Button>
        </div>
      );
    case 'not-confirmed':
      return (
        <div className="ui-card__body">
          <Notice role="status">
            <p ref={stepStart} tabIndex={-1} className="ui-step-start">
              {copy.notConfirmed}
            </p>
          </Notice>
          <Button
            variant="primary"
            onClick={() => {
              setStep({ kind: 'form' });
            }}
          >
            {copy.tryAgain}
          </Button>
        </div>
      );
    case 'unchecked-saved':
      return (
        <div className="ui-card__body">
          <p ref={stepStart} tabIndex={-1} className="ui-step-start">
            {fillTemplate(copy.checkDownloads, { fileName: step.fileName, time: timeOf(step.at) })}
          </p>
          <Notice>
            <p>{copy.uncheckedNote}</p>
          </Notice>
        </div>
      );
    case 'refused':
      return (
        <div className="ui-card__body">
          <Notice role="alert">
            <p ref={stepStart} tabIndex={-1} className="ui-step-start">
              {step.message}
            </p>
          </Notice>
          {step.unchecked === null ? (
            <Button
              onClick={() => {
                setStep({ kind: 'form' });
              }}
            >
              {copy.tryAgain}
            </Button>
          ) : (
            <UncheckedCopy
              choice={choice}
              problem={problem}
              failure={failure}
              onChange={setChoice}
              onSave={() => {
                if (step.unchecked !== null) void saveUnchecked(step.unchecked);
              }}
            />
          )}
        </div>
      );
    case 'form':
    case 'working':
      return renderForm();
  }

  /** The form (a render helper, not a component, so the fields keep their state and focus). */
  function renderForm(): ReactElement {
    const working = step.kind === 'working';
    return (
      <form
        className="ui-card__body"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void exportNow();
        }}
      >
        <p ref={stepStart} tabIndex={-1} className="ui-step-start">
          {copy.intro}
        </p>
        <LockFields
          value={choice}
          onChange={setChoice}
          problem={problem}
          disabled={working}
          switchRef={switchRef}
        />
        {working ? <Progress text={step.locked ? copy.locking : copy.working} /> : null}
        <Button type="submit" variant="primary" block disabled={working}>
          {copy.saveFile}
        </Button>
      </form>
    );
  }
}

function UncheckedCopy(props: {
  readonly choice: LockChoice;
  readonly problem: string | null;
  readonly failure: string | null;
  readonly onChange: (next: LockChoice) => void;
  readonly onSave: () => void;
}): ReactElement {
  return (
    <form
      className="ui-card__body"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave();
      }}
    >
      <p>{privacy.exportBackup.uncheckedNote}</p>
      <LockFields
        value={props.choice}
        onChange={props.onChange}
        problem={props.problem}
        failure={props.failure}
      />
      <Button type="submit" block>
        {privacy.exportBackup.saveUnchecked}
      </Button>
    </form>
  );
}
