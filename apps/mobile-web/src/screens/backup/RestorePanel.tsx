import { BackupError, fillTemplate, type Instant, type Snapshot } from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Notice, TextField } from '@diet/ui';
import { useRef, useState, type ReactElement } from 'react';
import { createRescueCopy } from '../../db/exportBackup';
import {
  decodeImport,
  type ImportFile,
  type ImportPlan,
  needsPassword,
  planImport,
  readImportFile,
  writeImport,
} from '../../db/importBackup';
import type { AppStorage } from '../../db/runtime';
import { formatLocalDateTime } from '../../format';
import { LockFields } from './LockFields';
import { LOCKED_BY_DEFAULT, type LockChoice, lockProblem, passwordOf } from './lockChoice';

type Step =
  | { readonly kind: 'choose'; readonly error: string | null }
  | { readonly kind: 'reading' }
  | { readonly kind: 'password'; readonly file: ImportFile; readonly error: string | null }
  | { readonly kind: 'unlocking'; readonly file: ImportFile }
  | { readonly kind: 'confirm'; readonly plan: ImportPlan }
  | { readonly kind: 'writing' }
  | { readonly kind: 'failed'; readonly message: string; readonly phone: Snapshot }
  | { readonly kind: 'saved-phone'; readonly fileName: string };

export interface RestorePanelProps {
  readonly storage: AppStorage;
  /** "Export what is on this phone first": opens the export panel, keeping this one as it is. */
  readonly onExportFirst: () => void;
  readonly onCancel: () => void;
}

const storeName = (table: string): string =>
  Object.hasOwn(privacy.storeNames, table)
    ? privacy.storeNames[table as keyof typeof privacy.storeNames]
    : table;

const messageOf = (error: unknown): string =>
  error instanceof BackupError ? error.message : privacy.backupErrors.damaged;

/**
 * Restore from a backup (storage spec sections 10.6 and 10.7; BK-01, BK-02, BK-10; D17, D49).
 * Nothing on the phone changes until Replace. A locked file asks for its password
 * (autocomplete="current-password"); a wrong password says so, imports nothing and can be tried
 * again. The confirmation shows the file's date, its counts, any values changed to fit this
 * version, any rows a rescue copy could not keep, and what would be lost; when the phone has
 * newer records, "Export what is on this phone first" comes first.
 */
export function RestorePanel({
  storage,
  onExportFirst,
  onCancel,
}: RestorePanelProps): ReactElement {
  const copy = privacy.importBackup;
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'choose', error: null });
  const [password, setPassword] = useState('');
  const [rescueChoice, setRescueChoice] = useState<LockChoice>(LOCKED_BY_DEFAULT);
  const [rescueProblem, setRescueProblem] = useState<string | null>(null);
  const [rescueFailure, setRescueFailure] = useState<string | null>(null);

  const decode = async (file: ImportFile, pass: string | null): Promise<void> => {
    try {
      const decoded = await decodeImport(file, pass, storage.env);
      setPassword('');
      setStep({ kind: 'confirm', plan: await planImport(storage.db, decoded) });
    } catch (error) {
      setPassword('');
      if (error instanceof BackupError && error.code === 'wrong-password-or-damaged') {
        setStep({ kind: 'password', file, error: error.message });
      } else {
        setStep({ kind: 'choose', error: messageOf(error) });
      }
    }
  };

  const chosen = async (blob: Blob): Promise<void> => {
    setStep({ kind: 'reading' });
    try {
      const file = await readImportFile(blob);
      if (needsPassword(file)) setStep({ kind: 'password', file, error: null });
      else await decode(file, null);
    } catch (error) {
      setStep({ kind: 'choose', error: messageOf(error) });
    }
  };

  const replace = async (plan: ImportPlan): Promise<void> => {
    setStep({ kind: 'writing' });
    const outcome = await writeImport(storage.db, plan, storage.env, {
      postGate: storage.platform.postGate,
      requestPersistentStorage: storage.platform.requestPersistentStorage,
      reload: storage.platform.reload,
    });
    if (!outcome.ok)
      setStep({ kind: 'failed', message: outcome.error.message, phone: outcome.phone });
  };

  const savePhone = async (phone: Snapshot): Promise<void> => {
    const refused = lockProblem(rescueChoice);
    setRescueProblem(refused);
    if (refused !== null) return;
    const exportedAt: Instant = storage.env.now();
    try {
      const saved = await createRescueCopy(
        { snapshot: phone, exportedAt },
        storage.env,
        passwordOf(rescueChoice),
      );
      storage.platform.download(saved.file.text, saved.fileName);
      setRescueChoice(LOCKED_BY_DEFAULT);
      setStep({ kind: 'saved-phone', fileName: saved.fileName });
    } catch {
      setRescueFailure(privacy.rescue.failed);
    }
  };

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="application/json,.json"
      hidden
      data-testid="restore-file"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file !== undefined) void chosen(file);
      }}
    />
  );

  switch (step.kind) {
    case 'choose':
    case 'reading':
      return (
        <div className="ui-card__body">
          {step.kind === 'choose' && step.error !== null ? (
            <Notice role="alert">
              <p>{step.error}</p>
            </Notice>
          ) : null}
          {fileInput}
          <ButtonRow>
            <Button
              variant="primary"
              disabled={step.kind === 'reading'}
              onClick={() => input.current?.click()}
            >
              {step.kind === 'reading' ? copy.reading : copy.chooseFile}
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              {copy.cancel}
            </Button>
          </ButtonRow>
        </div>
      );
    case 'password':
    case 'unlocking':
      return (
        <form
          className="ui-card__body"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (step.kind !== 'password') return;
            setStep({ kind: 'unlocking', file: step.file });
            void decode(step.file, password);
          }}
        >
          <p>{copy.fileLocked}</p>
          {step.kind === 'password' && step.error !== null ? (
            <Notice role="alert">
              <p>{step.error}</p>
            </Notice>
          ) : null}
          <TextField
            label={copy.passwordLabel}
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            value={password}
            disabled={step.kind === 'unlocking'}
            onChange={(event) => {
              setPassword(event.currentTarget.value);
            }}
          />
          <ButtonRow>
            <Button type="submit" variant="primary" disabled={step.kind === 'unlocking'}>
              {step.kind === 'unlocking' ? copy.unlocking : copy.unlock}
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              {copy.cancel}
            </Button>
          </ButtonRow>
        </form>
      );
    case 'confirm':
      return (
        <Confirmation
          plan={step.plan}
          zone={storage.env.timeZone()}
          onReplace={() => void replace(step.plan)}
          onExportFirst={onExportFirst}
          onCancel={onCancel}
        />
      );
    case 'writing':
      return (
        <div className="ui-card__body">
          <p role="status">{copy.replacing}</p>
        </div>
      );
    case 'failed':
      return (
        <form
          className="ui-card__body"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void savePhone(step.phone);
          }}
        >
          <Notice role="alert">
            <p>{step.message}</p>
            <p>{copy.writeFailedNext}</p>
          </Notice>
          <LockFields
            value={rescueChoice}
            onChange={setRescueChoice}
            problem={rescueProblem}
            failure={rescueFailure}
          />
          <Button type="submit" variant="primary" block>
            {copy.saveWhatWasHere}
          </Button>
          <Button block onClick={storage.platform.reload}>
            {privacy.storageFailure.reload}
          </Button>
        </form>
      );
    case 'saved-phone':
      return (
        <div className="ui-card__body">
          <p>{fillTemplate(privacy.exportBackup.checkDownloads, { fileName: step.fileName })}</p>
          <p>{privacy.rescue.note}</p>
          <Button block onClick={storage.platform.reload}>
            {privacy.storageFailure.reload}
          </Button>
        </div>
      );
  }
}

function Confirmation(props: {
  readonly plan: ImportPlan;
  readonly zone: string;
  readonly onReplace: () => void;
  readonly onExportFirst: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const copy = privacy.importBackup;
  const { decoded, confirmation, counts } = props.plan;
  const when = (at: Instant | null): string =>
    at === null ? copy.noRecords : formatLocalDateTime(at, props.zone);
  const rescueWithGaps = decoded.kind === 'rescue' && decoded.setAside.length > 0;
  const replace = (
    <Button
      key="replace"
      variant={confirmation.exportFirst ? 'secondary' : 'primary'}
      onClick={props.onReplace}
    >
      {rescueWithGaps ? copy.importRest : copy.replace}
    </Button>
  );
  const exportFirst = (
    <Button
      key="export-first"
      variant={confirmation.exportFirst ? 'primary' : 'secondary'}
      onClick={props.onExportFirst}
    >
      {copy.exportFirst}
    </Button>
  );
  return (
    <div className="ui-card__body" data-testid="restore-confirm">
      <p>{fillTemplate(copy.fileMade, { date: when(decoded.exportedAt) })}</p>
      <p>{decoded.locked ? copy.fileLocked : copy.filePlain}</p>
      {decoded.kind === 'rescue' ? (
        <Notice>
          <p>{copy.rescueNote}</p>
        </Notice>
      ) : null}
      <p className="ui-text-strong">{copy.countsTitle}</p>
      <ul className="ui-plain-list" data-testid="restore-counts">
        {counts.map(({ table, count }) => (
          <li key={table}>{fillTemplate(copy.storeCount, { table: storeName(table), count })}</li>
        ))}
      </ul>
      {decoded.changes.length > 0 ? (
        <>
          <p className="ui-text-strong">{copy.migrationChanges}</p>
          <ul className="ui-plain-list">
            {decoded.changes.map((change, i) => (
              <li key={`${change.table}-${change.field}-${String(i)}`}>{change.reason}</li>
            ))}
          </ul>
        </>
      ) : null}
      {decoded.setAside.length > 0 ? (
        <>
          <p className="ui-text-strong">{copy.setAside}</p>
          <ul className="ui-plain-list" data-testid="restore-set-aside">
            {decoded.setAside.map((row, i) => (
              <li key={`${row.table}-${String(row.index)}-${String(i)}`}>
                {fillTemplate(copy.setAsideRow, {
                  table: storeName(row.table),
                  position: row.index + 1,
                  rule: row.rule,
                })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Notice role="status">
        <p data-testid="restore-summary">
          {fillTemplate(copy.replaceSummary, {
            missing: confirmation.missingFromFile,
            changed: confirmation.changedAfterExport,
            phoneNewest: when(confirmation.phoneNewest),
            fileNewest: when(confirmation.fileNewest),
          })}
        </p>
      </Notice>
      <ButtonRow>
        {confirmation.exportFirst ? [exportFirst, replace] : [replace, exportFirst]}
        <Button variant="quiet" onClick={props.onCancel}>
          {copy.cancel}
        </Button>
      </ButtonRow>
    </div>
  );
}
