import { fillTemplate } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Notice } from '@diet/ui';
import { useState, type ReactElement } from 'react';
import { type DeleteAllResult, deleteAllData } from '../../db/deleteAll';
import type { AppStorage } from '../../db/runtime';

type Step =
  | { readonly kind: 'first' }
  | { readonly kind: 'second' }
  | { readonly kind: 'deleting' }
  | { readonly kind: 'failed'; readonly result: DeleteAllResult };

export interface DeleteAllPanelProps {
  readonly storage: AppStorage;
  /** "Export a backup first": opens the export panel. */
  readonly onExportFirst: () => void;
  readonly onCancel: () => void;
}

/**
 * Delete all data (storage spec section 11; HS-30; D45). A first confirmation lists what goes and
 * what stays and offers "Export a backup first"; a second, explicit one follows. On success the
 * page reloads into a fresh start; otherwise the steps that failed are named and it can be tried
 * again (every step is idempotent).
 */
export function DeleteAllPanel({
  storage,
  onExportFirst,
  onCancel,
}: DeleteAllPanelProps): ReactElement {
  const copy = privacy.deleteAll;
  const [step, setStep] = useState<Step>({ kind: 'first' });

  const run = async (): Promise<void> => {
    setStep({ kind: 'deleting' });
    const { platform } = storage;
    const result = await deleteAllData({
      db: storage.db,
      gate: storage.gate,
      postGate: platform.postGate,
      indexedDB: storage.deps.indexedDB,
      caches: platform.caches(),
      localStorage: platform.localStorage,
      sessionStorage: platform.sessionStorage,
      revokeObjectUrls: platform.revokeObjectUrls,
      reload: platform.reload,
    });
    if (!result.ok) setStep({ kind: 'failed', result });
  };

  switch (step.kind) {
    case 'first':
      return (
        <div className="ui-card__body" data-testid="delete-first">
          <p>{copy.goes}</p>
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
            <p>{copy.finalWarning}</p>
          </Notice>
          <ButtonRow>
            <Button variant="primary" onClick={() => void run()}>
              {copy.confirm}
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              {copy.cancel}
            </Button>
          </ButtonRow>
        </div>
      );
    case 'deleting':
      return (
        <div className="ui-card__body">
          <p role="status">{copy.deleting}</p>
        </div>
      );
    case 'failed': {
      const { result } = step;
      const steps = result.failed.map((s) => copy.steps[s]).join(', ');
      return (
        <div className="ui-card__body">
          <Notice role="alert">
            <p>{result.blocked ? copy.blocked : fillTemplate(copy.stepsFailed, { steps })}</p>
          </Notice>
          <Button variant="primary" onClick={() => void run()}>
            {copy.confirm}
          </Button>
        </div>
      );
    }
  }
}
