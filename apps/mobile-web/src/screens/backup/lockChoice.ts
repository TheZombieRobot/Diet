import { BACKUP_PASSWORD_LENGTH, normalizeBackupPassword } from '@diet/core';
import { privacy } from '@diet/core/copy/health';

/**
 * The lock choice for a file the app saves (storage spec section 10.4; C99; D19, D49): the lock is
 * on by default, the password is typed twice, and the unrecoverable-password warning is shown.
 * Turning the lock off shows "Anyone who opens this file can read your records." The inputs use
 * autocomplete="new-password". The password is never stored or logged; screens clear it after use.
 */
export interface LockChoice {
  readonly locked: boolean;
  readonly password: string;
  readonly repeat: string;
}

export const LOCKED_BY_DEFAULT: LockChoice = { locked: true, password: '', repeat: '' };

/** Why the choice cannot be used yet, or null. The rules are core's (10–1,000 characters after trim and NFC). */
export function lockProblem(choice: LockChoice): string | null {
  if (!choice.locked) return null;
  const normalized = normalizeBackupPassword(choice.password);
  if (normalized.length < BACKUP_PASSWORD_LENGTH.min) return privacy.exportBackup.passwordTooShort;
  if (normalized.length > BACKUP_PASSWORD_LENGTH.max) return privacy.exportBackup.passwordTooLong;
  if (normalizeBackupPassword(choice.repeat) !== normalized) {
    return privacy.exportBackup.passwordsDiffer;
  }
  return null;
}

/** The password to lock with, or null for a plain file. */
export const passwordOf = (choice: LockChoice): string | null =>
  choice.locked ? choice.password : null;
