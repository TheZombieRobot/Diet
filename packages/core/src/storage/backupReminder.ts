/**
 * The weekly backup reminder (storage spec section 12.2; BK-03, C98; D25). Stored in card_state
 * ('backup-reminder', 'weekly') and settings.lastBackupAt. Pure.
 *
 * - No reminder until onboarding is complete.
 * - Due 7 days after the reference (the last confirmed backup, else onboarding completion); back
 *   7 days after a dismissal.
 * - When this phone has not promised to keep the app's storage ('not-protected' or
 *   'unsupported'), due after 3 days, back 1 day after a dismissal, and shown first. 'checking'
 *   counts as protected: it lasts milliseconds and must not flash a warning.
 * - Days are 24 h of elapsed time. A confirmed export clears it through lastBackupAt; an
 *   unconfirmed one does not (D21).
 */
import { type Instant, instantMs } from './primitives';

/** The persistent-storage status (PWA-06 as reworded by C98). Never stored (D24). */
export type StorageProtectionStatus = 'checking' | 'protected' | 'not-protected' | 'unsupported';

const DAY_MS = 86_400_000;
export const BACKUP_REMINDER_DAYS = Object.freeze({
  protected: Object.freeze({ dueAfter: 7, snooze: 7 }),
  weak: Object.freeze({ dueAfter: 3, snooze: 1 }),
});

export interface BackupReminderInput {
  readonly lastBackupAt: Instant | null;
  readonly onboardingCompletedAt: Instant | null;
  /** card_state('backup-reminder', 'weekly').dismissedAt. */
  readonly dismissedAt: Instant | null;
  readonly storage: StorageProtectionStatus;
  readonly now: Instant;
}

export interface BackupReminderState {
  readonly visible: boolean;
  /** Visible and weak storage: the card goes first among Today's reminders, with the extra line. */
  readonly prominent: boolean;
}

export function isWeakStorage(storage: StorageProtectionStatus): boolean {
  return storage === 'not-protected' || storage === 'unsupported';
}

export function backupReminder(input: BackupReminderInput): BackupReminderState {
  if (input.onboardingCompletedAt === null) return { visible: false, prominent: false };
  const weak = isWeakStorage(input.storage);
  const { dueAfter, snooze } = weak ? BACKUP_REMINDER_DAYS.weak : BACKUP_REMINDER_DAYS.protected;
  const now = instantMs(input.now);
  const reference = instantMs(input.lastBackupAt ?? input.onboardingCompletedAt);
  const dismissed = input.dismissedAt === null ? null : instantMs(input.dismissedAt);
  const visible =
    now - reference >= dueAfter * DAY_MS &&
    (dismissed === null || dismissed < reference || now - dismissed >= snooze * DAY_MS);
  return { visible, prominent: visible && weak };
}
