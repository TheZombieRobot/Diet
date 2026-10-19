/**
 * Backup errors (storage spec sections 10.5 and 10.9). Each code has one plain-English message in
 * health.ts (privacy section). Messages may name a store, a field, a rule and an allowed range
 * from the spec, but never a record's value or key (section 2.3). No error has a cause.
 */
import { privacy } from '../../copy/health';
import { fillTemplate } from '../../copy/template';

export const BACKUP_ERROR_CODES = Object.freeze([
  'too-large',
  'not-a-backup',
  'unsupported-version',
  'newer-version',
  'damaged',
  'wrong-password-or-damaged',
  'invalid-record',
  'inconsistent',
  'write-failed',
] as const);
export type BackupErrorCode = (typeof BACKUP_ERROR_CODES)[number];

export interface BackupErrorDetail {
  /** A store name from the spec (never a name read from the file). */
  readonly table?: string | null;
  /** The row's position in the file's table. */
  readonly index?: number | null;
  readonly field?: string | null;
  readonly rule?: string | null;
  /** The allowed range, from spec constants. */
  readonly allowed?: string | null;
}

function describe(detail: BackupErrorDetail): string {
  const table = detail.table ?? null;
  const index = detail.index ?? null;
  const field = detail.field ?? '';
  const allowed = detail.allowed ?? null;
  const parts: string[] = [];
  if (table !== null) parts.push(table);
  if (index !== null) parts.push(`record ${index + 1}`);
  if (field !== '') parts.push(field);
  const where = parts.join(' ');
  const rule = `${detail.rule ?? 'not accepted'}${allowed === null ? '' : `, allowed ${allowed}`}`;
  return where === '' ? rule : `${where}: ${rule}`;
}

/** Why an import was refused. Nothing in the database is touched until the write step. */
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly table: string | null;
  readonly index: number | null;
  readonly field: string | null;
  readonly rule: string | null;

  constructor(code: BackupErrorCode, detail: BackupErrorDetail = {}) {
    super(fillTemplate(privacy.backupErrors[code], { detail: describe(detail) }));
    this.code = code;
    this.table = detail.table ?? null;
    this.index = detail.index ?? null;
    this.field = detail.field ?? null;
    this.rule = detail.rule ?? null;
  }
}
BackupError.prototype.name = 'BackupError';

export const BACKUP_EXPORT_ERROR_CODES = Object.freeze([
  'self-check-failed',
  'lock-check-failed',
  'password-too-short',
  'password-too-long',
] as const);
export type BackupExportErrorCode = (typeof BACKUP_EXPORT_ERROR_CODES)[number];

/**
 * Why an export stopped (section 10.5). After 'self-check-failed' the app offers "Save an unchecked
 * copy" (createRescueFile); after 'lock-check-failed' nothing is offered as a backup.
 */
export class BackupExportError extends Error {
  readonly code: BackupExportErrorCode;
  readonly table: string | null;
  readonly field: string | null;
  readonly rule: string | null;

  constructor(code: BackupExportErrorCode, detail: BackupErrorDetail = {}) {
    const copy = privacy.exportBackup;
    const message =
      code === 'self-check-failed'
        ? fillTemplate(copy.selfCheckFailed, {
            table: detail.table ?? '(file)',
            field: (detail.field ?? '') === '' ? '(record)' : (detail.field ?? ''),
            rule: detail.rule ?? 'not accepted',
          })
        : code === 'lock-check-failed'
          ? copy.lockCheckFailed
          : code === 'password-too-short'
            ? copy.passwordTooShort
            : copy.passwordTooLong;
    super(message);
    this.code = code;
    this.table = detail.table ?? null;
    this.field = detail.field ?? null;
    this.rule = detail.rule ?? null;
  }
}
BackupExportError.prototype.name = 'BackupExportError';
