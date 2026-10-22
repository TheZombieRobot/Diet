/**
 * The export flow (storage spec section 10.5; C99; D19, D21, D22).
 * 1. Read every backed-up store in one read transaction (a consistent snapshot).
 * 2. exportedAt = now; the snapshot copy records lastBackupAt = exportedAt, and nothing else.
 * 3. Build the payload from the allow-list and self-check it with the import validator. If the
 *    check fails, the owner can still save an unchecked copy: a rescue file, locked by default,
 *    which does not count as a backup.
 * 4. With a password: encrypt, then decrypt the file again and compare it before offering it.
 * 5. The screen offers the file as a download (files.ts) and asks "Can you see the file?". Only a
 *    Yes records the backup (settings.recordBackup), so the database matches the file.
 * Nothing here touches the network.
 */
import {
  BackupExportError,
  type BackupFile,
  backupFileName,
  createBackupFile,
  createRescueFile,
  type Instant,
  SCHEMA_VERSION,
  type Snapshot,
} from '@diet/core';
import { APP_VERSION } from '../appVersion';
import type { DietDb } from './db';
import type { StorageEnv } from './env';
import { readRescueRows } from './rescue';
import { readBackupSnapshot } from './snapshot';

export interface SavedFile {
  readonly file: BackupFile;
  readonly fileName: string;
}

/** What an unchecked copy is made from when the self-check fails: the snapshot already read. */
export interface UncheckedSource {
  readonly snapshot: Snapshot;
  readonly exportedAt: Instant;
}

export type ExportOutcome =
  | ({ readonly ok: true } & SavedFile)
  | {
      readonly ok: false;
      readonly error: BackupExportError;
      /** Set when the self-check failed: "Save an unchecked copy" uses it. */
      readonly unchecked: UncheckedSource | null;
    };

/** Steps 1 to 4. `password` is null for a plain file. */
export async function createExport(
  db: DietDb,
  env: StorageEnv,
  password: string | null,
  appVersion: string = APP_VERSION,
): Promise<ExportOutcome> {
  const snapshot = await readBackupSnapshot(db);
  const exportedAt = env.now();
  try {
    const file = await createBackupFile({ tables: snapshot, exportedAt, appVersion, password });
    return { ok: true, file, fileName: backupFileName(exportedAt, env.timeZone(), file) };
  } catch (error) {
    if (!(error instanceof BackupExportError)) throw error;
    const unchecked = error.code === 'self-check-failed' ? { snapshot, exportedAt } : null;
    return { ok: false, error, unchecked };
  }
}

/**
 * A rescue file of a snapshot already in memory: "Save an unchecked copy" after a failed
 * self-check, and "Save what was on this phone" after a failed import write (sections 8.5 rule 3
 * and 10.5 step 3). It never sets lastBackupAt.
 */
export async function createRescueCopy(
  source: UncheckedSource,
  env: StorageEnv,
  password: string | null,
  appVersion: string = APP_VERSION,
): Promise<SavedFile> {
  const file = await createRescueFile({
    tables: source.snapshot,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: source.exportedAt,
    appVersion,
    password,
  });
  return { file, fileName: backupFileName(source.exportedAt, env.timeZone(), file) };
}

/**
 * The rescue copy on the upgrade-failed screen (section 9.5): read with raw IndexedDB at the
 * installed version, never through Dexie. Null when there is nothing to rescue.
 */
export async function createUpgradeRescueCopy(
  factory: IDBFactory,
  env: StorageEnv,
  password: string | null,
  appVersion: string = APP_VERSION,
): Promise<SavedFile | null> {
  const rows = await readRescueRows(factory);
  if (rows === null) return null;
  const exportedAt = env.now();
  const file = await createRescueFile({
    tables: rows.tables,
    schemaVersion: rows.schemaVersion,
    exportedAt,
    appVersion,
    password,
  });
  return { file, fileName: backupFileName(exportedAt, env.timeZone(), file) };
}
