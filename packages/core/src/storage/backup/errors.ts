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

const lastSegment = (field: string): string => {
  const parts = field.replace(/\[\d+\]/g, '').split('.');
  return parts[parts.length - 1] ?? '';
};

const lookup = <T extends Readonly<Record<string, string>>>(map: T, key: string | null) =>
  key !== null && Object.hasOwn(map, key) ? map[key as keyof T] : undefined;

/**
 * A record problem in plain words (ux review): the store's plain name, the position, the field's
 * plain name and what is wrong with it, with the allowed range from the spec, for example
 * "Targets, record 1: the Steady-phase deficit is outside the allowed range (15–20)". A
 * cross-record rule reads as a sentence ("two fasts overlap"). Never a value or a record key, and
 * never a code name such as a field, store or rule id.
 */
export function describeRecordProblem(detail: BackupErrorDetail): string {
  const copy = privacy.recordProblem;
  const ruleId = detail.rule ?? null;
  const invariant = lookup(copy.invariants, ruleId);
  if (invariant !== undefined) {
    // A row a rescue import set aside for a cross-record rule is named by store and position.
    const store = lookup(privacy.storeNames, detail.table ?? null);
    const at = detail.index ?? null;
    return store === undefined || at === null
      ? invariant
      : fillTemplate(copy.crossRecord, { table: store, position: at + 1, rule: invariant });
  }
  const ruleText = lookup(copy.rules, ruleId) ?? copy.rules.notAccepted;
  const allowed = detail.allowed ?? null;
  const rule =
    allowed === null ? ruleText : fillTemplate(copy.allowed, { rule: ruleText, allowed });
  const tableId = detail.table ?? null;
  const index = detail.index ?? null;
  if (index === null && ruleId === 'extra-key') return copy.unknownList;
  if (tableId === null) return fillTemplate(copy.file, { rule });
  const table = lookup(privacy.storeNames, tableId) ?? copy.someList;
  if (index === null) return fillTemplate(copy.list, { table, rule });
  const position = index + 1;
  const fieldId = lastSegment(detail.field ?? '');
  const field = lookup(copy.fields, fieldId === '' ? null : fieldId);
  return field === undefined
    ? fillTemplate(copy.withoutField, { table, position, rule })
    : fillTemplate(copy.withField, { table, position, field, rule });
}

/** The rule of a rescue copy's Kickstart history that cannot be imported whole (section 9.5; D27). */
export const KICKSTART_HISTORY_RULE = 'kickstart-history';

/**
 * The rule of a file whose Kickstart history cannot be combined with this phone's (restorePlan.ts):
 * a restore never drops either side's Kickstart records, so the file is refused instead.
 */
export const KICKSTART_MERGE_RULE = 'kickstart-merge';

/**
 * The plain message of a BackupError (ux and wording reviews). A problem with one record names the
 * store, position, field and rule; a problem with a whole list or with the file itself says so
 * instead of speaking of "a record"; a rescue copy's Kickstart history has its own message.
 */
function backupErrorMessage(code: BackupErrorCode, detail: BackupErrorDetail): string {
  const table = lookup(privacy.storeNames, detail.table ?? null);
  const index = detail.index ?? null;
  if (detail.rule === KICKSTART_HISTORY_RULE) {
    const store = table ?? privacy.storeNames.kickstart_periods;
    const record =
      index === null
        ? store
        : fillTemplate(privacy.recordProblem.position, { table: store, position: index + 1 });
    return fillTemplate(privacy.kickstartHistory, { record });
  }
  if (detail.rule === KICKSTART_MERGE_RULE) return privacy.kickstartMerge;
  if (code === 'invalid-record' && index === null) {
    const lists = privacy.backupListErrors;
    const rule = detail.rule ?? null;
    if (rule === 'migration') return lists.migration;
    if (rule === 'extra-key') {
      const deviceOnly = lookup(privacy.deviceOnlyNames, detail.table ?? null);
      return deviceOnly === undefined
        ? lists.unknown
        : fillTemplate(lists.deviceOnly, { table: deviceOnly });
    }
    if (table !== undefined) {
      return fillTemplate(rule === 'missing' ? lists.missing : lists.unreadable, { table });
    }
  }
  return fillTemplate(privacy.backupErrors[code], { detail: describeRecordProblem(detail) });
}

/** Why an import was refused. Nothing in the database is touched until the write step. */
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly table: string | null;
  readonly index: number | null;
  readonly field: string | null;
  readonly rule: string | null;
  /** The allowed range, from spec constants. */
  readonly allowed: string | null;

  constructor(code: BackupErrorCode, detail: BackupErrorDetail = {}) {
    super(backupErrorMessage(code, detail));
    this.code = code;
    this.table = detail.table ?? null;
    this.index = detail.index ?? null;
    this.field = detail.field ?? null;
    this.rule = detail.rule ?? null;
    this.allowed = detail.allowed ?? null;
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
        ? fillTemplate(copy.selfCheckFailed, { detail: describeRecordProblem(detail) })
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
