/**
 * The import flow (storage spec sections 10.6 and 10.7; BK-02, C48, C50; D17). Nothing in the
 * database is touched until the write step.
 * 1–8. Size, parse, envelope, unlock, payload, validation against the file's own version,
 *      migration, validation against the current version and the invariants (core
 *      decodeBackupText). Every refusal is a BackupError with one plain message from health.ts.
 * 9.   The confirmation: the phone's backed-up stores are read in one transaction and kept in
 *      memory (section 8.5 rule 3), and the counts are worked out (importConfirmation).
 * 10.  The write: tell the other tabs, close this tab's write gate, give up this tab's shared lock,
 *      then replace everything in one transaction inside the lock in exclusive mode (locks.ts), so
 *      no other tab's write can land on top of the restored records. If the other tabs do not let
 *      go within 3 seconds, nothing is written ("Close the app's other tabs, then try again"). If
 *      the write fails, the snapshot from step 9 is offered at once as a rescue file ("Save what
 *      was on this phone"). On success, ask again for persistent storage, then reload.
 * No audit row is written for an import itself; only migration changes from an older file add any.
 */
import {
  BACKUP_TABLES,
  BackupError,
  type CardStateRecord,
  cautiousSafetyMerge,
  type DecodedBackup,
  decodeBackupText,
  type ImportConfirmation,
  importConfirmation,
  type KeptStricter,
  MAX_BACKUP_FILE_BYTES,
  type Migration,
  parseBackupText,
  type Snapshot,
} from '@diet/core';
import type { DietDb } from './db';
import { migrationEnv, type StorageEnv } from './env';
import type { GateReason } from './gate';
import { type LockManagerLike, withExclusiveLock } from './locks';
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
  /**
   * The records to write: the file's, except that a rescue copy never makes a safety setting
   * less cautious than this phone had (cautiousSafetyMerge; orchestrator ruling).
   */
  readonly snapshot: Snapshot;
  /** Rescue copies: the safety settings kept from this phone, listed on the confirmation. */
  readonly keptStricter: readonly KeptStricter[];
}

/** Step 9. */
export async function planImport(db: DietDb, decoded: DecodedBackup): Promise<ImportPlan> {
  const phone = await readBackupSnapshot(db);
  let snapshot = decoded.snapshot;
  let keptStricter: KeptStricter[] = [];
  const fileTargets = decoded.snapshot.targets[0];
  const fileSettings = decoded.snapshot.settings[0];
  const phoneTargets = phone.targets[0];
  const phoneSettings = phone.settings[0];
  if (
    decoded.kind === 'rescue' &&
    fileTargets !== undefined &&
    fileSettings !== undefined &&
    phoneTargets !== undefined &&
    phoneSettings !== undefined
  ) {
    const merged = cautiousSafetyMerge(
      { targets: fileTargets, settings: fileSettings },
      { targets: phoneTargets, settings: phoneSettings },
    );
    snapshot = { ...snapshot, targets: [merged.targets], settings: [merged.settings] };
    keptStricter = merged.kept;
  }
  return {
    decoded,
    phone,
    confirmation: importConfirmation(phone, decoded),
    counts: BACKUP_TABLES.map((table) => ({ table, count: decoded.snapshot[table].length })),
    snapshot,
    keptStricter,
  };
}

/**
 * The rows to write: the plan's (the file's records), plus the update-notice card when migration
 * changed values (section 9.2), so the owner sees what changed after the reload.
 */
export function rowsToWrite(
  decoded: Pick<DecodedBackup, 'snapshot' | 'updateNotice'>,
  env: StorageEnv,
): Snapshot {
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
  /** Web Locks (locks.ts), or null where the browser has none. */
  readonly locks: LockManagerLike | null;
  /** How long to wait for the other tabs to let go (3 s). */
  readonly lockWaitMs?: number;
  /** pwa/storage.ts requestPersistentStorage. */
  readonly requestPersistentStorage: () => Promise<unknown>;
  readonly reload: () => void;
}

export type WriteOutcome =
  | { readonly ok: true }
  /** Another tab did not let go of the records within 3 s: nothing was written. */
  | { readonly ok: false; readonly blocked: true; readonly phone: Snapshot }
  | {
      readonly ok: false;
      readonly blocked: false;
      readonly error: BackupError;
      readonly phone: Snapshot;
    };

/** Step 10. It can be tried again after a blocked or failed attempt (nothing was written). */
export async function writeImport(
  db: DietDb,
  plan: ImportPlan,
  env: StorageEnv,
  deps: WriteDeps,
): Promise<WriteOutcome> {
  const rows = rowsToWrite(
    { snapshot: plan.snapshot, updateNotice: plan.decoded.updateNotice },
    env,
  );
  deps.postGate('import');
  db.gate.close();
  db.releaseOpenLock();
  let written;
  try {
    written = await withExclusiveLock(deps.locks, () => replaceAll(db, rows), deps.lockWaitMs);
  } catch {
    return {
      ok: false,
      blocked: false,
      error: new BackupError('write-failed'),
      phone: plan.phone,
    };
  }
  if (!written.granted) return { ok: false, blocked: true, phone: plan.phone };
  await deps.requestPersistentStorage();
  deps.reload();
  return { ok: true };
}
