import { fillTemplate } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Notice } from '@diet/ui';
import { useState, type ReactElement } from 'react';
import { type DeleteAllResult, deleteAllData } from '../../db/deleteAll';
import type { AppStorage } from '../../db/runtime';
import { recordsBusyStore, useStepFocus } from './focus';
import { Progress } from './Progress';

type Step =
  | { readonly kind: 'first' }
  | { readonly kind: 'second' }
  | { readonly kind: 'deleting' }
  | { readonly kind: 'failed'; readonly result: DeleteAllResult };

export interface DeleteAllPanelProps {
  readonly storage: AppStorage;
  /** Whether a backup has ever been confirmed (settings.lastBackupAt), for the final warning. */
  readonly hasBackup: boolean;
  /** "Export a backup first": opens the export panel. */
  readonly onExportFirst: () => void;
  readonly onCancel: () => void;
}

/**
 * Delete all data (storage spec section 11; HS-30; D45). A first confirmation lists what goes and
 * what stays and offers "Export a backup first"; a second, explicit one follows, with Cancel as
 * the main button and the deletion drawn in amber; it says so when there is no backup to bring
 * the records back. On success the page reloads into a fresh start. Otherwise it names what
 * failed (or that the app is open somewhere else, and that the records are still on the phone),
 * says that nothing more will be saved until the app reloads, and offers Try again and Reload
 * (every step is idempotent). When only the list of other stored data could not be read, it says
 * the records were deleted and to reload.
 */
export function DeleteAllPanel({
  storage,
  hasBackup,
  onExportFirst,
  onCancel,
}: DeleteAllPanelProps): ReactElement {
  const copy = privacy.deleteAll;
  const [step, setStep] = useState<Step>({ kind: 'first' });
  const stepStart = useStepFocus<HTMLParagraphElement>(step.kind);

  const run = async (): Promise<void> => {
    setStep({ kind: 'deleting' });
    recordsBusyStore.set(true);
    const { platform } = storage;
    const result = await deleteAllData({
      db: storage.db,
      gate: storage.gate,
      postGate: platform.postGate,
      locks: platform.locks(),
      indexedDB: storage.deps.indexedDB,
      caches: platform.caches(),
      localStorage: platform.localStorage,
      sessionStorage: platform.sessionStorage,
      revokeObjectUrls: platform.revokeObjectUrls,
      reload: platform.reload,
    });
    if (!result.ok) {
      recordsBusyStore.set(false);
      setStep({ kind: 'failed', result });
    }
  };

  switch (step.kind) {
    case 'first':
      return (
        <div className="ui-card__body" data-testid="delete-first">
          <p ref={stepStart} tabIndex={-1} className="ui-step-start">
            {copy.goes}
          </p>
          <p className="ui-text-strong">{copy.staysTitle}</p>
          <ul className="ui-plain-list">
            {copy.stays.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ButtonRow>
            <Button variant="primary" onClick={onExportFirst}>
              {copy.exportFirst}
            </Button>
            <Button
              onClick={() => {
                setStep({ kind: 'second' });
              }}
            >
              {copy.next}
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              {copy.cancel}
            </Button>
          </ButtonRow>
        </div>
      );
    case 'second':
      return (
        <div className="ui-card__body" data-testid="delete-second">
          <Notice>
            <p ref={stepStart} tabIndex={-1} className="ui-step-start">
              {hasBackup ? copy.finalWarning : copy.finalWarningNoBackup}
            </p>
          </Notice>
          <ButtonRow>
            <Button variant="primary" onClick={onCancel}>
              {copy.cancel}
            </Button>
            <Button variant="caution" onClick={() => void run()}>
              {copy.confirm}
            </Button>
          </ButtonRow>
        </div>
      );
    case 'deleting':
      return (
        <div className="ui-card__body">
          <Progress text={copy.deleting} />
        </div>
      );
    case 'failed': {
      const { result } = step;
      const steps = result.failed.map((s) => copy.steps[s]).join(', ');
      const listOnly =
        result.recordsDeleted &&
        result.failed.length === 1 &&
        result.failed[0] === 'list-databases';
      return (
        <div className="ui-card__body" data-testid="delete-failed">
          <Notice role="alert">
            <p ref={stepStart} tabIndex={-1} className="ui-step-start">
              {listOnly
                ? copy.listFailedOnly
                : result.blocked
                  ? privacy.otherTabs
                  : fillTemplate(copy.stepsFailed, { steps })}
            </p>
            {result.recordsDeleted ? null : <p>{copy.recordsKept}</p>}
            <p>{privacy.backupCard.closed}</p>
          </Notice>
          <ButtonRow>
            <Button variant="primary" onClick={storage.platform.reload}>
              {privacy.backupCard.reload}
            </Button>
            <Button variant="caution" onClick={() => void run()}>
              {copy.tryAgain}
            </Button>
          </ButtonRow>
        </div>
      );
    }
  }
}
