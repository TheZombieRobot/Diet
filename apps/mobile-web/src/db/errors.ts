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
 * confirmation with no answer, "done" on a card that can never be turned off, or a setup step out
 * of order (the alcohol notice un-acknowledged, or setup completed before the notice and all seven
 * readiness answers; item 13, E62). The fasting rules (item 15): a fast cannot be started or
 * reopened while fasting is switched off; only the latest ended fast can be reopened, only through
 * undoEnd and only within 5 minutes of its end; and a fast's times cannot be later than now.
 * Item 21: the diet mode is written only by the diet-mode switch, and leaving keto while a
 * Kickstart runs needs the owner's confirmation (C56, T14, T35).
 * Item 19: a garden photo is written only as a clean JPEG of its stated size, at most 1,024 px on
 * its long side, with no metadata (the validation middleware's photo check; G2, G4).
 * Item 28: no alcohol record before the alcohol notice is acknowledged, no drink or milestone
 * while alcohol logging is off (HS-20, RD-01), and no drink time more than 5 minutes ahead of now
 * ('future-time', as for fasts).
 * Item 20 (recipes): a recipe or line that is not there, a second copy of a seed, a swap the
 * owner is not offered (a listed allergen among them), a copy whose figures the schema cannot
 * store yet, a copy still in the meal plan, and a change of the recipe a copy was made from.
 */
export type StorageRule =
  | 'recipe-not-found'
  | 'recipe-copy-exists'
  | 'recipe-swap-not-allowed'
  | 'recipe-figures-unknown'
  | 'recipe-in-plan'
  | 'recipe-origin-fixed'
  | 'not-found'
  | 'already-ended'
  | 'confirmation-without-answer'
  | 'not-final'
  | 'onboarding-order'
  | 'fasting-gated'
  | 'not-ended'
  | 'not-latest'
  | 'reopen'
  | 'future-time'
  | 'undo-expired'
  | 'diet-mode-switch-only'
  | 'kickstart-confirm-needed'
  // Item 19: a second row for one crop or pantry item (G17).
  | 'duplicate'
  // Item 19: core photoProblem.
  | 'photo-format'
  | 'photo-metadata'
  | 'photo-size'
  // Item 28: the alcohol notice and the alcohol-logging gate (HS-20, RD-01).
  | 'alcohol-notice-first'
  | 'alcohol-logging-off'
  // Item 23 (the food log): the label food or recipe is gone; core refused the entry or the
  // label; a time off the entry's date; a planned meal that is not planned, or is already logged;
  // the same recipe already logged that day without the owner's "log it again".
  | 'food-source-missing'
  | 'entry-refused'
  | 'label-refused'
  | 'entry-other-day'
  | 'plan-not-found'
  | 'plan-slot-logged'
  | 'already-logged';

export class StorageRuleError extends Error {
  readonly table: string;
  readonly rule: StorageRule;
  /**
   * A fixed code saying why, never a value or a key (item 23): core's EntryRefusal or
   * LabelProblem, or 'unconfirmed' when only unticked label checks remain.
   */
  readonly reason: string | null;

  constructor(table: string, rule: StorageRule, reason: string | null = null) {
    super(`${table} refused the write: ${rule}${reason === null ? '' : ` (${reason})`}`);
    this.table = table;
    this.rule = rule;
    this.reason = reason;
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
