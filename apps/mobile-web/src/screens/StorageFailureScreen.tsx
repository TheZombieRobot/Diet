import { fillTemplate } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, Card, Notice } from '@diet/ui';
import { useState, type ReactElement } from 'react';
import type { FailureStatus } from '../db/db';
import { browserEnv } from '../db/env';
import { createUpgradeRescueCopy, type SavedFile } from '../db/exportBackup';
import { offerDownload } from '../files';
import { formatLocalTime } from '../format';
import { applyUpdate, updateStore } from '../pwa/update';
import { HelpNumberList } from './HelpNumbers';
import { useStepFocus } from './backup/focus';
import { LockFields } from './backup/LockFields';
import { LOCKED_BY_DEFAULT, type LockChoice, lockProblem, passwordOf } from './backup/lockChoice';
import { Progress } from './backup/Progress';
import { UpdateBanner } from './UpdateBanner';

export interface StorageFailureActions {
  readonly reload: () => void;
  /** Reads the records with raw IndexedDB and makes a rescue file (section 9.5). */
  readonly makeRescueCopy: (password: string | null) => Promise<SavedFile | null>;
  readonly download: (text: string, fileName: string) => void;
}

const browserActions: StorageFailureActions = {
  // A new version waiting to take over is applied first: a plain reload keeps the old one in
  // control (registerType 'prompt'), so the screen would come back (wording review).
  reload: () => {
    if (updateStore.get().waiting) void applyUpdate();
    else window.location.reload();
  },
  makeRescueCopy: (password) => createUpgradeRescueCopy(indexedDB, browserEnv(), password),
  download: (text, fileName) => {
    offerDownload(text, fileName);
  },
};

/**
 * The storage failure screens (storage spec section 7.4; HS-13; D48). They replace the whole app,
 * so Settings and delete-all are not reachable from them. Every one also shows, from static copy
 * with no dependence on the database, the not-a-medical-device line and the help numbers: these
 * screens appear exactly when the rest of the app is unusable, for example during a running fast.
 * On upgrade-failed, saving the rescue copy is the main button and Reload comes after it; once
 * saved, the screen says where the file went and offers another copy (ux review). A new version
 * waiting to take over shows its Update banner here too, and Reload applies it.
 */
export function StorageFailureScreen({
  status,
  actions = browserActions,
}: {
  readonly status: FailureStatus;
  readonly actions?: StorageFailureActions;
}): ReactElement {
  const copy = privacy.storageFailure;
  return (
    <div className="ui-shell">
      <header className="ui-topbar">
        <h1 className="ui-topbar__title">{copy.title}</h1>
      </header>
      <main id="main" className="ui-shell__main" tabIndex={-1}>
        <UpdateBanner />
        <Card label={copy.cardLabel}>
          <p className="ui-text-lead" data-testid="storage-failure">
            {copy[status]}
          </p>
          {status === 'upgrade-failed' ? <RescueCopy actions={actions} /> : null}
          <Button
            variant={status === 'upgrade-failed' ? 'secondary' : 'primary'}
            block
            onClick={actions.reload}
          >
            {copy.reload}
          </Button>
        </Card>
        <Card label={copy.helpTitle}>
          <p>{copy.notMedicalDevice}</p>
          <p className="ui-text-muted">{copy.helpLine}</p>
          <HelpNumberList />
        </Card>
      </main>
    </div>
  );
}

function RescueCopy({ actions }: { readonly actions: StorageFailureActions }): ReactElement {
  const [choice, setChoice] = useState<LockChoice>(LOCKED_BY_DEFAULT);
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedFile | null>(null);
  const [working, setWorking] = useState<'locked' | 'plain' | null>(null);
  const stepStart = useStepFocus<HTMLParagraphElement>(saved === null ? 'form' : 'saved');
  const save = async (): Promise<void> => {
    const refused = lockProblem(choice);
    setProblem(refused);
    if (refused !== null) return;
    setWorking(choice.locked ? 'locked' : 'plain');
    try {
      const file = await actions.makeRescueCopy(passwordOf(choice));
      setChoice(LOCKED_BY_DEFAULT);
      if (file === null) {
        setFailure(privacy.rescue.failed);
      } else {
        actions.download(file.file.text, file.fileName);
        setFailure(null);
        setSaved(file);
      }
    } catch {
      setFailure(privacy.rescue.failed);
    }
    setWorking(null);
  };
  if (saved !== null) {
    return (
      <div className="ui-card__body" data-testid="rescue-saved">
        <Notice role="status">
          <p ref={stepStart} tabIndex={-1} className="ui-step-start">
            {fillTemplate(privacy.exportBackup.checkDownloads, {
              fileName: saved.fileName,
              time: formatLocalTime(saved.file.exportedAt, browserEnv().timeZone()),
            })}
          </p>
          <p>{privacy.rescue.note}</p>
        </Notice>
        <Button
          block
          onClick={() => {
            setSaved(null);
          }}
        >
          {privacy.rescue.saveAnother}
        </Button>
      </div>
    );
  }
  return (
    <form
      className="ui-card__body"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p ref={stepStart} tabIndex={-1} className="ui-step-start">
        {privacy.rescue.note}
      </p>
      <LockFields
        value={choice}
        onChange={setChoice}
        problem={problem}
        failure={failure}
        disabled={working !== null}
      />
      {working === null ? null : (
        <Progress
          text={working === 'locked' ? privacy.exportBackup.locking : privacy.exportBackup.working}
        />
      )}
      <Button type="submit" variant="primary" block disabled={working !== null}>
        {privacy.storageFailure.saveRescueCopy}
      </Button>
    </form>
  );
}
