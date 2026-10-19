import { fillTemplate, type Instant } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Notice } from '@diet/ui';
import { useState, type ReactElement } from 'react';
import { createExport, createRescueCopy, type UncheckedSource } from '../../db/exportBackup';
import { StorageFullError } from '../../db/errors';
import type { AppStorage } from '../../db/runtime';
import { LockFields } from './LockFields';
import { LOCKED_BY_DEFAULT, type LockChoice, lockProblem, passwordOf } from './lockChoice';

type Step =
  | { readonly kind: 'form' }
  | { readonly kind: 'working' }
  | { readonly kind: 'ask'; readonly fileName: string; readonly exportedAt: Instant }
  | { readonly kind: 'not-confirmed' }
  | {
      readonly kind: 'refused';
      readonly message: string;
      readonly unchecked: UncheckedSource | null;
    }
  | { readonly kind: 'unchecked-saved'; readonly fileName: string };

export interface ExportPanelProps {
  readonly storage: AppStorage;
  /** Called after the owner confirms they can see the file. */
  readonly onDone: () => void;
}

/**
 * Export a backup (storage spec section 10.5; BK-01, BK-03; D19, D21, D22). The lock is on by
 * default. After the download, the owner is asked "Can you see the file?": only Yes records the
 * backup; No, or leaving, records nothing. When the self-check fails, an unchecked copy can still
 * be saved, and it does not count as a backup.
 */
export function ExportPanel({ storage, onDone }: ExportPanelProps): ReactElement {
  const copy = privacy.exportBackup;
  const [choice, setChoice] = useState<LockChoice>(LOCKED_BY_DEFAULT);
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'form' });

  const exportNow = async (): Promise<void> => {
    const refused = lockProblem(choice);
    setProblem(refused);
    if (refused !== null) return;
    setStep({ kind: 'working' });
    try {
      const outcome = await createExport(storage.db, storage.env, passwordOf(choice));
      if (outcome.ok) {
        storage.platform.download(outcome.file.text, outcome.fileName);
        setChoice(LOCKED_BY_DEFAULT);
        setStep({ kind: 'ask', fileName: outcome.fileName, exportedAt: outcome.file.exportedAt });
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
      setStep({ kind: 'unchecked-saved', fileName: saved.fileName });
    } catch {
      setFailure(privacy.rescue.failed);
    }
  };

  const confirmSeen = async (exportedAt: Instant): Promise<void> => {
    try {
      await storage.repos.settings.recordBackup(exportedAt);
      onDone();
    } catch (error) {
      // Recording failed (a full phone, or another tab restored): the backup is not counted.
      const message = error instanceof StorageFullError ? error.message : copy.notConfirmed;
      setStep({ kind: 'refused', message, unchecked: null });
    }
  };

  switch (step.kind) {
    case 'ask':
      return (
        <div className="ui-card__body" data-testid="export-ask">
          <p>{fillTemplate(copy.checkDownloads, { fileName: step.fileName })}</p>
          <p className="ui-text-strong">{copy.canYouSeeIt}</p>
          <ButtonRow>
            <Button variant="primary" onClick={() => void confirmSeen(step.exportedAt)}>
              {copy.yes}
            </Button>
            <Button
              onClick={() => {
                setStep({ kind: 'not-confirmed' });
              }}
            >
              {copy.no}
            </Button>
          </ButtonRow>
        </div>
      );
    case 'not-confirmed':
      return (
        <div className="ui-card__body">
          <Notice role="status">
            <p>{copy.notConfirmed}</p>
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
          <p>{fillTemplate(copy.checkDownloads, { fileName: step.fileName })}</p>
          <Notice>
            <p>{copy.uncheckedNote}</p>
          </Notice>
        </div>
      );
    case 'refused':
      return (
        <div className="ui-card__body">
          <Notice role="alert">
            <p>{step.message}</p>
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
      return (
        <form
          className="ui-card__body"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void exportNow();
          }}
        >
          <LockFields
            value={choice}
            onChange={setChoice}
            problem={problem}
            disabled={step.kind === 'working'}
          />
          <Button type="submit" variant="primary" block disabled={step.kind === 'working'}>
            {step.kind === 'working' && choice.locked ? copy.locking : copy.saveFile}
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
