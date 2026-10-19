/**
 * Errors of the app's storage layer (storage spec sections 2.3, 7.5, 7.6 and 8.2). Like the core
 * StorageValidationError and StorageInvariantError, none of them carries a value, a record key or
 * a cause: only the store name, an operation or rule id, and fixed wording.
 */
import { privacy } from '@diet/core/copy/health';

/** A write after the write gate closed (another tab imported or deleted, or this tab is closing). */
export class StorageClosedError extends Error {
  constructor() {
    super('The records are closed in this tab. Reload the app.');
  }
}
StorageClosedError.prototype.name = 'StorageClosedError';

/** An operation the store does not allow (section 8.4; the middleware of section 7.3). */
export class StorageOperationError extends Error {
  readonly table: string;
  readonly operation: string;

  constructor(table: string, operation: string) {
    super(`${table} does not allow ${operation}`);
    this.table = table;
    this.operation = operation;
  }
}
StorageOperationError.prototype.name = 'StorageOperationError';

/**
 * Repository rules that are not record invariants: a missing record, a fast already ended, a
 * confirmation with no answer, or "done" on a card that can never be turned off.
 */
export type StorageRule =
  'not-found' | 'already-ended' | 'confirmation-without-answer' | 'not-final';

export class StorageRuleError extends Error {
  readonly table: string;
  readonly rule: StorageRule;

  constructor(table: string, rule: StorageRule) {
    super(`${table} refused the write: ${rule}`);
    this.table = table;
    this.rule = rule;
  }
}
StorageRuleError.prototype.name = 'StorageRuleError';

/** The phone ran out of space: the transaction was aborted, so nothing was saved (section 7.6). */
export class StorageFullError extends Error {
  constructor() {
    super(privacy.storageFull);
  }
}
StorageFullError.prototype.name = 'StorageFullError';

/**
 * A Kickstart write that depends on today, refused because the phone's clock reads earlier than
 * the newest saved record (section 8.2; clock.ts isClockBehind; health-rules review).
 */
export class StorageClockError extends Error {
  constructor() {
    super(privacy.clockBehind);
  }
}
StorageClockError.prototype.name = 'StorageClockError';

/** True for a QuotaExceededError, as IndexedDB or Dexie reports it (also as the inner error of an abort). */
export function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, inner } = error as { name?: unknown; inner?: unknown };
  return name === 'QuotaExceededError' || (inner !== undefined && isQuotaError(inner));
}

/** Maps a failed write to the error the screens show: a full phone becomes StorageFullError. */
export function mapWriteError(error: unknown): unknown {
  return isQuotaError(error) ? new StorageFullError() : error;
}
