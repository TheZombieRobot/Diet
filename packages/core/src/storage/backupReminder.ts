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
 * - A last backup or onboarding time dated after now makes it due at once, and a dismissal dated
 *   after now is ignored (cardHidden), so a clock that ran ahead, or an imported file dated ahead,
 *   never silences it (health-rules review). While that time is ahead, a "Not now" made at the
 *   correct time still snoozes it.
 * - backupReminderNextChange gives the next moment the answer can change, so Today can draw again
 *   then.
 */
import { cardHidden } from './cards';
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
  const ahead = reference > now;
  const due = ahead || now - reference >= dueAfter * DAY_MS;
  // A dismissal made before the last backup (or onboarding) no longer counts, unless that time is
  // itself dated ahead: then a "Not now" made at the correct time still snoozes the card.
  const snoozed =
    input.dismissedAt !== null &&
    (ahead || instantMs(input.dismissedAt) >= reference) &&
    cardHidden({
      now: input.now,
      row: { dismissedAt: input.dismissedAt, dismissedTimeZone: null, doneAt: null },
      dismissal: { kind: 'backup-snooze' },
      drinkingDayCutoverMinutes: 0,
      snoozeMs: snooze * DAY_MS,
    });
  const visible = due && !snoozed;
  return { visible, prominent: visible && weak };
}

/**
 * The next instant after `now` at which backupReminder(input) can change its answer (the reminder
 * comes due, a snooze ends, a dismissal or reference dated ahead comes due), or null when nothing
 * can change it but a new write. Today sets a timer for it (health-rules review).
 */
export function backupReminderNextChange(input: BackupReminderInput): Instant | null {
  if (input.onboardingCompletedAt === null) return null;
  const { dueAfter, snooze } = isWeakStorage(input.storage)
    ? BACKUP_REMINDER_DAYS.weak
    : BACKUP_REMINDER_DAYS.protected;
  const now = instantMs(input.now);
  const reference = instantMs(input.lastBackupAt ?? input.onboardingCompletedAt);
  const candidates = [reference, reference + dueAfter * DAY_MS];
  if (input.dismissedAt !== null) {
    const dismissed = instantMs(input.dismissedAt);
    candidates.push(dismissed, dismissed + snooze * DAY_MS);
  }
  const next = Math.min(...candidates.filter((ms) => ms > now));
  return Number.isFinite(next) ? new Date(next).toISOString() : null;
}
