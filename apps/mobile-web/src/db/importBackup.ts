/**
 * The import flow (storage spec sections 10.6 and 10.7; BK-02, C48, C50; D17). Nothing in the
 * database is touched until the write step.
 * 1–8. Size, parse, envelope, unlock, payload, validation against the file's own version,
 *      migration, validation against the current version and the invariants (core
 *      decodeBackupText). Every refusal is a BackupError with one plain message from health.ts.
 * 9.   The confirmation: the phone's backed-up stores are read in one transaction and kept in
 *      memory (section 8.5 rule 3), and the counts are worked out (importConfirmation).
 * 10.  The write: tell the other tabs, close this tab's write gate, then replace everything in one
 *      transaction. If it fails, the snapshot from step 9 is offered at once as a rescue file
 *      ("Save what was on this phone"). On success, ask again for persistent storage, then reload.
 * No audit row is written for an import itself; only migration changes from an older file add any.
 */
import {
  BACKUP_TABLES,
  BackupError,
  type CardStateRecord,
  type DecodedBackup,
  decodeBackupText,
  type ImportConfirmation,
  importConfirmation,
  MAX_BACKUP_FILE_BYTES,
  type Migration,
  parseBackupText,
  type Snapshot,
} from '@diet/core';
import type { DietDb } from './db';
import { migrationEnv, type StorageEnv } from './env';
import type { GateReason } from './gate';
import { readBackupSnapshot, replaceAll } from './snapshot';

export interface ImportFile {
  readonly text: string;
  readonly sizeBytes: number;
}

/** Reads a chosen file. A file over 50 MiB is refused before it is read (step 1). */
export async function readImportFile(file: Blob): Promise<ImportFile> {
  if (file.size > MAX_BACKUP_FILE_BYTES) throw new BackupError('too-large');
  return { text: await file.text(), sizeBytes: file.size };
}

/** Steps 1 to 3: whether the file needs a password. Throws a BackupError for anything else. */
export function needsPassword(file: ImportFile): boolean {
  return parseBackupText(file.text, file.sizeBytes).encrypted;
}

/** Steps 1 to 8. A wrong password is 'wrong-password-or-damaged'; retrying is allowed (BK-02). */
export function decodeImport(
  file: ImportFile,
  password: string | null,
  env: StorageEnv,
  chain?: readonly Migration[],
): Promise<DecodedBackup> {
  return decodeBackupText(file.text, {
    password,
    env: migrationEnv(env),
    sizeBytes: file.sizeBytes,
    ...(chain === undefined ? {} : { chain }),
  });
}

export interface ImportPlan {
  readonly decoded: DecodedBackup;
  /** What was on the phone when the confirmation was shown, kept for the rescue offer. */
  readonly phone: Snapshot;
  readonly confirmation: ImportConfirmation;
  /** Records per store in the file, in section 4.1 order. */
  readonly counts: readonly { readonly table: string; readonly count: number }[];
}

/** Step 9. */
export async function planImport(db: DietDb, decoded: DecodedBackup): Promise<ImportPlan> {
  const phone = await readBackupSnapshot(db);
  return {
    decoded,
    phone,
    confirmation: importConfirmation(phone, decoded),
    counts: BACKUP_TABLES.map((table) => ({ table, count: decoded.snapshot[table].length })),
  };
}

/**
 * The rows to write: the file's, plus the update-notice card when migration changed values
 * (section 9.2), so the owner sees what changed after the reload.
 */
export function rowsToWrite(decoded: DecodedBackup, env: StorageEnv): Snapshot {
  const trigger = decoded.updateNotice;
  if (trigger === null) return decoded.snapshot;
  const cards = decoded.snapshot.card_state;
  if (cards.some((c) => c.cardId === 'update-notice' && c.trigger === trigger)) {
    return decoded.snapshot;
  }
  const notice: CardStateRecord = {
    cardId: 'update-notice',
    trigger,
    firstShownAt: env.now(),
    dismissedAt: null,
    dismissedTimeZone: null,
    doneAt: null,
  };
  return { ...decoded.snapshot, card_state: [...cards, notice] };
}

export interface WriteDeps {
  /** Posts { type: 'gate', reason } on the diet-db channel (gate.ts). */
  readonly postGate: (reason: GateReason) => void;
  /** pwa/storage.ts requestPersistentStorage. */
  readonly requestPersistentStorage: () => Promise<unknown>;
  readonly reload: () => void;
}

export type WriteOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: BackupError; readonly phone: Snapshot };

/** Step 10. */
export async function writeImport(
  db: DietDb,
  plan: ImportPlan,
  env: StorageEnv,
  deps: WriteDeps,
): Promise<WriteOutcome> {
  const rows = rowsToWrite(plan.decoded, env);
  deps.postGate('import');
  db.gate.close();
  try {
    await replaceAll(db, rows);
  } catch {
    return { ok: false, error: new BackupError('write-failed'), phone: plan.phone };
  }
  await deps.requestPersistentStorage();
  deps.reload();
  return { ok: true };
}
