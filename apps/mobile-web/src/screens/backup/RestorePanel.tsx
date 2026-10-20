import {
  BackupError,
  describeRecordProblem,
  fillTemplate,
  type Instant,
  type Snapshot,
} from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Notice, TextField } from '@diet/ui';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createRescueCopy } from '../../db/exportBackup';
import { newGeneration } from '../../db/generation';
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
import { formatLocalDateTime, formatLocalTime } from '../../format';
import { recordsBusyStore, useStepFocus } from './focus';
import { LockFields } from './LockFields';
import { LOCKED_BY_DEFAULT, type LockChoice, lockProblem, passwordOf } from './lockChoice';
import { setPendingCheck } from './pendingCheck';
import { Progress } from './Progress';

type Step =
  | { readonly kind: 'choose'; readonly error: string | null }
  | { readonly kind: 'reading' }
  | { readonly kind: 'password'; readonly file: ImportFile; readonly error: string | null }
  | { readonly kind: 'unlocking'; readonly file: ImportFile }
  | { readonly kind: 'confirm'; readonly plan: ImportPlan }
  | { readonly kind: 'writing' }
  /** Another tab did not let go of the records: nothing was written, and it can be tried again. */
  | { readonly kind: 'blocked'; readonly plan: ImportPlan }
  | { readonly kind: 'failed'; readonly message: string; readonly phone: Snapshot }
  | { readonly kind: 'saved-phone'; readonly fileName: string; readonly at: Instant };

export interface RestorePanelProps {
  readonly storage: AppStorage;
  /** "Export what is on this phone first": opens the export panel, keeping this one as it is. */
  readonly onExportFirst: () => void;
  readonly onCancel: () => void;
}

const storeName = (table: string): string =>
  Object.hasOwn(privacy.storeNames, table)
    ? privacy.storeNames[table as keyof typeof privacy.storeNames]
    : privacy.recordProblem.someList;

const fieldName = (field: string): string =>
  Object.hasOwn(privacy.recordProblem.fields, field)
    ? privacy.recordProblem.fields[field as keyof typeof privacy.recordProblem.fields]
    : field === ''
      ? privacy.importBackup.wholeRecord
      : privacy.recordProblem.fields.value;

const messageOf = (error: unknown): string =>
  error instanceof BackupError ? error.message : privacy.backupErrors.damaged;

/**
 * Restore from a backup (storage spec sections 10.6 and 10.7; BK-01, BK-02, BK-10; D17, D49).
 * Nothing on the phone changes until "Replace everything on this phone". A locked file asks for
 * its password (autocomplete="current-password"); a wrong password says so next to the field,
 * imports nothing and can be tried again. The confirmation shows the file's date (a backup's or a
 * rescue copy's), its counts, any values changed to fit this version, any rows a rescue copy
 * could not keep, what was kept from this phone (safety settings, allergens, a Kickstart history
 * that records more), and what would be lost; when the phone holds records the file does not,
 * "Export what is on this phone first" comes first. When other tabs do not let go, nothing is
 * changed: "Try the restore again" counts the records again and shows the confirmation again.
 * Focus moves to the start of each new step.
 */
export function RestorePanel({
  storage,
  onExportFirst,
  onCancel,
}: RestorePanelProps): ReactElement {
  const copy = privacy.importBackup;
  const input = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'choose', error: null });
  const [password, setPassword] = useState('');
  const [rescueChoice, setRescueChoice] = useState<LockChoice>(LOCKED_BY_DEFAULT);
  const [rescueProblem, setRescueProblem] = useState<string | null>(null);
  const [rescueFailure, setRescueFailure] = useState<string | null>(null);
  // Unlocking is part of the password step: after a wrong password, focus goes back to the
  // cleared field, which now carries the error, not to the start of the step.
  const stepStart = useStepFocus<HTMLParagraphElement>(
    step.kind === 'unlocking' ? 'password' : step.kind,
  );
  const wrongPassword = step.kind === 'password' && step.error !== null ? step : null;
  useEffect(() => {
    if (wrongPassword !== null) passwordField.current?.focus();
  }, [wrongPassword]);

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
    recordsBusyStore.set(true);
    const outcome = await writeImport(storage.db, plan, storage.env, {
      postGate: storage.platform.postGate,
      locks: storage.platform.locks(),
      requestPersistentStorage: storage.platform.requestPersistentStorage,
      markReplaced: () => {
        newGeneration(storage.platform.localStorage, () => storage.env.randomId());
      },
      reload: () => {
        // A backup file of the records just replaced no longer matches them.
        setPendingCheck(null);
        storage.platform.reload();
      },
    });
    if (outcome.ok) return;
    recordsBusyStore.set(false);
    if (outcome.blocked) setStep({ kind: 'blocked', plan });
    else setStep({ kind: 'failed', message: outcome.error.message, phone: outcome.phone });
  };

  /** After a blocked attempt: count the phone's records again and confirm again. */
  const replan = async (plan: ImportPlan): Promise<void> => {
    setStep({ kind: 'reading' });
    try {
      setStep({ kind: 'confirm', plan: await planImport(storage.db, plan.decoded) });
    } catch (error) {
      setStep({ kind: 'choose', error: messageOf(error) });
    }
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
      setStep({ kind: 'saved-phone', fileName: saved.fileName, at: exportedAt });
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

  const reloadButton = (
    <Button variant="primary" block onClick={storage.platform.reload}>
      {privacy.storageFailure.reload}
    </Button>
  );

  switch (step.kind) {
    case 'choose':
    case 'reading':
      return (
        <div className="ui-card__body">
          <p ref={stepStart} tabIndex={-1} className="ui-step-start">
            {copy.intro}
          </p>
          {step.kind === 'choose' && step.error !== null ? (
            <Notice role="alert">
              <p>{step.error}</p>
            </Notice>
          ) : null}
          {step.kind === 'reading' ? <Progress text={copy.reading} /> : null}
          {fileInput}
          <ButtonRow>
            <Button
              variant="primary"
              disabled={step.kind === 'reading'}
              onClick={() => input.current?.click()}
            >
              {copy.chooseFile}
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
          <p ref={stepStart} tabIndex={-1} className="ui-step-start">
            {copy.fileLocked}
          </p>
          <TextField
            ref={passwordField}
            label={copy.passwordLabel}
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            value={password}
            readOnly={step.kind === 'unlocking'}
            error={step.kind === 'password' && step.error !== null ? step.error : undefined}
            onChange={(event) => {
              setPassword(event.currentTarget.value);
            }}
          />
          {step.kind === 'unlocking' ? <Progress text={copy.unlocking} /> : null}
          <ButtonRow>
            <Button type="submit" variant="primary" disabled={step.kind === 'unlocking'}>
              {copy.unlock}
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
          firstLine={
            <p ref={stepStart} tabIndex={-1} className="ui-step-start">
              {fillTemplate(step.plan.decoded.kind === 'rescue' ? copy.rescueMade : copy.fileMade, {
                date: formatLocalDateTime(step.plan.decoded.exportedAt, storage.env.timeZone()),
              })}
            </p>
          }
          onReplace={() => void replace(step.plan)}
          onExportFirst={onExportFirst}
          onCancel={onCancel}
        />
      );
    case 'writing':
      return (
        <div className="ui-card__body">
          <Progress text={copy.replacing} />
        </div>
      );
    case 'blocked':
      return (
        <div className="ui-card__body" data-testid="restore-blocked">
          <Notice role="alert">
            <p ref={stepStart} tabIndex={-1} className="ui-step-start">
              {privacy.otherTabs}
            </p>
            <p>{copy.blockedNothingChanged}</p>
            <p>{privacy.backupCard.closed}</p>
            <p>{copy.reloadCancels}</p>
          </Notice>
          <ButtonRow>
            <Button onClick={() => void replan(step.plan)}>{copy.tryRestoreAgain}</Button>
          </ButtonRow>
          {reloadButton}
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
            <p ref={stepStart} tabIndex={-1} className="ui-step-start">
              {step.message}
            </p>
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
          <p ref={stepStart} tabIndex={-1} className="ui-step-start">
            {fillTemplate(privacy.exportBackup.checkDownloads, {
              fileName: step.fileName,
              time: formatLocalTime(step.at, storage.env.timeZone()),
            })}
          </p>
          <p>{privacy.rescue.note}</p>
          {reloadButton}
        </div>
      );
  }
}

function summaryOf(plan: ImportPlan, when: (at: Instant | null) => string): string[] {
  const copy = privacy.importBackup;
  const { confirmation } = plan;
  const count = (n: number, none: string, one: string, many: string) =>
    n === 0 ? none : n === 1 ? one : fillTemplate(many, { count: n });
  const lines: string[] = [copy.replaceIntro];
  if (confirmation.phoneHasOwnRecords) {
    lines.push(
      count(confirmation.missingFromFile, copy.missingNone, copy.missingOne, copy.missingMany),
      count(confirmation.differFromFile, copy.differNone, copy.differOne, copy.differMany),
      confirmation.phoneNewest === null
        ? fillTemplate(copy.newestFileOnly, { fileNewest: when(confirmation.fileNewest) })
        : fillTemplate(copy.newest, {
            phoneNewest: when(confirmation.phoneNewest),
            fileNewest: when(confirmation.fileNewest),
          }),
    );
  } else {
    lines.push(copy.freshPhone);
  }
  if (plan.keptKickstart) lines.push(copy.kickstartKept);
  if (plan.paired) lines.push(copy.pairingRemoved);
  return lines;
}

function Confirmation(props: {
  readonly plan: ImportPlan;
  readonly zone: string;
  readonly firstLine: ReactElement;
  readonly onReplace: () => void;
  readonly onExportFirst: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const copy = privacy.importBackup;
  const { decoded, confirmation, counts, keptStricter } = props.plan;
  const when = (at: Instant | null): string =>
    at === null ? copy.noRecords : formatLocalDateTime(at, props.zone);
  const rescueWithGaps = decoded.kind === 'rescue' && decoded.setAside.length > 0;
  // Replacing loses records only when the phone holds some the file does not: then the action
  // that cannot be undone is drawn in amber and exporting first is the default.
  const replace = (
    <Button
      key="replace"
      variant={confirmation.exportFirst ? 'caution' : 'primary'}
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
      {props.firstLine}
      <p>{decoded.locked ? copy.fileLocked : copy.filePlain}</p>
      {decoded.kind === 'rescue' ? (
        <Notice>
          <p>{copy.rescueNote}</p>
        </Notice>
      ) : null}
      <p className="ui-text-strong">{copy.countsTitle}</p>
      <ul className="ui-plain-list" data-testid="restore-counts">
        {/* Only the stores the file has records in: a list of zeros reads as noise (F41). */}
        {counts
          .filter(({ count }) => count > 0)
          .map(({ table, count }) => (
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
                {describeRecordProblem(row)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {decoded.replacedFields.length > 0 ? (
        <>
          <p className="ui-text-strong">{copy.resetToDefault}</p>
          <ul className="ui-plain-list" data-testid="restore-reset">
            {decoded.replacedFields.map(({ table, field }) => (
              <li key={`${table}-${field}`}>
                {fillTemplate(copy.resetRow, { table: storeName(table), field: fieldName(field) })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {keptStricter.length > 0 ? (
        <>
          <p className="ui-text-strong">{copy.keptStricter}</p>
          <ul className="ui-plain-list" data-testid="restore-kept">
            {keptStricter.map(({ table, field }) => (
              <li key={`${table}-${field}`}>
                {fillTemplate(copy.resetRow, { table: storeName(table), field: fieldName(field) })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Notice role="status">
        <div data-testid="restore-summary">
          {summaryOf(props.plan, when).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
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
