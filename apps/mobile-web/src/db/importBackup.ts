/**
 * The import flow (storage spec sections 10.6 and 10.7; BK-02, C48, C50; D17). Nothing in the
 * database is touched until the write step.
 * 1–8. Size, parse, envelope, unlock, payload, validation against the file's own version,
 *      migration, validation against the current version and the invariants (core
 *      decodeBackupText). Every refusal is a BackupError with one plain message from health.ts.
 * 9.   The confirmation: the phone's backed-up stores are read in one transaction and kept in
 *      memory (section 8.5 rule 3), and the counts are worked out (importConfirmation) against
 *      what would be written. The Kickstart history is never lowered: the phone's periods, checks
 *      and pre-start answers are merged with the file's (core mergeKickstartHistory; D27), and
 *      while the phone's Kickstart runs, the settings it runs on are kept too
 *      (runningKickstartSettings). A rescue copy is merged with the phone's safety settings and
 *      allergens (cautiousSafetyMerge), except where the phone still holds the untouched defaults.
 *      A fast running when the file was made is named, with the choice to end it then.
 * 10.  The write: tell the other tabs, close this tab's write gate, give up this tab's shared lock,
 *      then replace everything in one transaction inside the lock in exclusive mode (locks.ts), so
 *      no other tab's write can land on top of the restored records. That transaction first checks
 *      that the phone still holds what the confirmation was worked out from; if anything was saved
 *      since (another tab), it writes nothing and the confirmation is worked out again (F12). If
 *      the other tabs do not let go within 3 seconds, nothing is written ("Close the app's other
 *      tabs, then try again"). If the write fails, the snapshot from step 9 is offered at once as a
 *      rescue file ("Save what was on this phone"). On success, mark the records as replaced
 *      (generation.ts), ask again for persistent storage, then reload.
 * No audit row is written for an import itself; only migration changes from an older file add any.
 */
import {
  BACKUP_TABLES,
  BackupError,
  type CardStateRecord,
  cautiousSafetyMerge,
  type DecodedBackup,
  decodeBackupText,
  endFastAtBackup,
  type FastRecord,
  fastRunningAtBackup,
  type ImportConfirmation,
  importConfirmation,
  isUntouchedSeedRow,
  type KeptStricter,
  kickstartEndsAfterRestore,
  livedUntil,
  MAX_BACKUP_FILE_BYTES,
  type MergeSeen,
  mergeKickstartHistory,
  type Migration,
  parseBackupText,
  type RestoreClock,
  runningKickstartSettings,
  type Snapshot,
  stableStringify,
  withRunningKickstartSettings,
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
   * less cautious than this phone had (cautiousSafetyMerge; orchestrator ruling), that the
   * Kickstart history holds this phone's records too (keptKickstart), and that a Kickstart
   * running on this phone keeps the settings it runs on (keptKickstartSettings).
   */
  readonly snapshot: Snapshot;
  /** Rescue copies: the safety settings kept from this phone, listed on the confirmation. */
  readonly keptStricter: readonly KeptStricter[];
  /** The written Kickstart history holds records from this phone that the file lacks (D27). */
  readonly keptKickstart: boolean;
  /** The diet mode, keto start or Kickstart eating pattern of a running Kickstart were kept (F13). */
  readonly keptKickstartSettings: boolean;
  /** The Kickstart running on this phone ends once these records are restored (F13). */
  readonly kickstartEnds: boolean;
  /** The file's fast that was running when it was made: it comes back as still running (F3). */
  readonly runningFast: FastRecord | null;
  /** Whether this phone is paired with a laptop (the restore removes the pairing). */
  readonly paired: boolean;
}

/** The phone's singleton row for the rescue merge: the file's own row where the phone still holds the untouched default (F16). */
function phoneSide<T>(table: 'profile' | 'targets' | 'settings', phone: T, file: T): T {
  return isUntouchedSeedRow(table, phone) ? file : phone;
}

/**
 * The Kickstart history to write (D27; full review F1, F12): the phone's and the file's merged.
 * A phone history so damaged that it cannot even be merged is kept whole instead: keeping it never
 * reopens a cap, and its damaged rows then fail the write, which changes nothing. A file whose
 * history cannot be combined with the phone's is refused (a BackupError).
 */
function mergedKickstart(
  phone: Snapshot,
  file: Snapshot,
  seen: MergeSeen,
): ReturnType<typeof mergeKickstartHistory> {
  try {
    return mergeKickstartHistory(phone, file, seen);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    return {
      snapshot: {
        ...file,
        kickstart_periods: phone.kickstart_periods,
        kickstart_checks: phone.kickstart_checks,
      },
      keptFromPhone: true,
    };
  }
}

/** Step 9. */
export async function planImport(db: DietDb, decoded: DecodedBackup): Promise<ImportPlan> {
  const phone = await readBackupSnapshot(db);
  const paired = (await db.transfer_pairings.count()) > 0;
  const clock: RestoreClock = { now: db.env.now(), deviceTimeZone: db.env.timeZone() };
  let snapshot = decoded.snapshot;
  let keptStricter: KeptStricter[] = [];
  const [fileProfile, fileTargets, fileSettings] = [
    decoded.snapshot.profile[0],
    decoded.snapshot.targets[0],
    decoded.snapshot.settings[0],
  ];
  const [phoneProfile, phoneTargets, phoneSettings] = [
    phone.profile[0],
    phone.targets[0],
    phone.settings[0],
  ];
  if (
    decoded.kind === 'rescue' &&
    fileProfile !== undefined &&
    fileTargets !== undefined &&
    fileSettings !== undefined &&
    phoneProfile !== undefined &&
    phoneTargets !== undefined &&
    phoneSettings !== undefined
  ) {
    const merged = cautiousSafetyMerge(
      { profile: fileProfile, targets: fileTargets, settings: fileSettings },
      {
        profile: phoneSide('profile', phoneProfile, fileProfile),
        targets: phoneSide('targets', phoneTargets, fileTargets),
        settings: phoneSide('settings', phoneSettings, fileSettings),
      },
    );
    snapshot = {
      ...snapshot,
      profile: [merged.profile],
      targets: [merged.targets],
      settings: [merged.settings],
    };
    keptStricter = merged.kept;
  }
  // How far each side's Kickstart had run: the phone now, the file when it was made (its own
  // records, not the rescue merge's singletons), each lifted to its newest saved instant.
  const kickstart = mergedKickstart(phone, snapshot, {
    phone: livedUntil(phone, clock.now),
    deviceTimeZone: clock.deviceTimeZone,
    file: livedUntil(decoded.snapshot, decoded.exportedAt),
  });
  snapshot = kickstart.snapshot;
  let running: ReturnType<typeof runningKickstartSettings> = null;
  try {
    running = runningKickstartSettings(phone, clock);
  } catch {
    // A phone history that cannot be read keeps nothing more.
  }
  let keptKickstartSettings = false;
  let kickstartEnds = false;
  if (running !== null) {
    const before = stableStringify([snapshot.profile, snapshot.targets]);
    snapshot = withRunningKickstartSettings(snapshot, running);
    keptKickstartSettings = stableStringify([snapshot.profile, snapshot.targets]) !== before;
    kickstartEnds = kickstartEndsAfterRestore(snapshot, clock);
  }
  return {
    decoded,
    phone,
    confirmation: importConfirmation(phone, { snapshot, exportedAt: decoded.exportedAt }),
    counts: BACKUP_TABLES.map((table) => ({ table, count: decoded.snapshot[table].length })),
    snapshot,
    keptStricter,
    keptKickstart: kickstart.keptFromPhone,
    keptKickstartSettings,
    kickstartEnds,
    runningFast: fastRunningAtBackup(snapshot, decoded.exportedAt),
    paired,
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
  /** Marks the records as replaced (generation.ts), so an older "Can you see the file?" no longer counts. */
  readonly markReplaced?: () => void;
  readonly reload: () => void;
}

/** The owner's choices on the confirmation. */
export interface ImportChoices {
  /** End the fast that was running when the backup was made, at that time (F3). */
  readonly endRunningFast?: boolean;
}

export type WriteOutcome =
  | { readonly ok: true }
  /** Another tab did not let go of the records within 3 s: nothing was written. */
  | { readonly ok: false; readonly blocked: true; readonly phone: Snapshot }
  /** The records changed after the confirmation was shown: nothing was written (F12). */
  | {
      readonly ok: false;
      readonly blocked: false;
      readonly changed: true;
      readonly phone: Snapshot;
    }
  | {
      readonly ok: false;
      readonly blocked: false;
      readonly changed: false;
      readonly error: BackupError;
      readonly phone: Snapshot;
    };

/** Step 10. It can be tried again after a blocked, changed or failed attempt (nothing was written). */
export async function writeImport(
  db: DietDb,
  plan: ImportPlan,
  env: StorageEnv,
  deps: WriteDeps,
  choices: ImportChoices = {},
): Promise<WriteOutcome> {
  const snapshot =
    choices.endRunningFast === true
      ? endFastAtBackup(plan.snapshot, plan.decoded.exportedAt, env.now())
      : plan.snapshot;
  const rows = rowsToWrite({ snapshot, updateNotice: plan.decoded.updateNotice }, env);
  deps.postGate('import');
  db.gate.close();
  db.releaseOpenLock();
  let written;
  try {
    written = await withExclusiveLock(
      deps.locks,
      () => replaceAll(db, rows, { phone: plan.phone, paired: plan.paired }),
      deps.lockWaitMs,
    );
  } catch {
    return {
      ok: false,
      blocked: false,
      changed: false,
      error: new BackupError('write-failed'),
      phone: plan.phone,
    };
  }
  if (!written.granted) return { ok: false, blocked: true, phone: plan.phone };
  if (written.value === 'changed') {
    return { ok: false, blocked: false, changed: true, phone: plan.phone };
  }
  deps.markReplaced?.();
  await deps.requestPersistentStorage();
  deps.reload();
  return { ok: true };
}
