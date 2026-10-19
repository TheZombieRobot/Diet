/**
 * Bookkeeping instants that must never lie in the future (storage spec section 3.1; health-rules
 * review). A card dismissal or done time, a backup confirmation, an onboarding confirmation or an
 * elapsed-time start dated ahead would hide the rapid-loss card, the alcohol help card or the
 * backup reminder, or delay a check-in, for as long as the date lies ahead. So:
 * - a repository write refuses any of these fields written with a new value later than the moment
 *   of writing plus FUTURE_INSTANT_TOLERANCE_MS (rule 'future');
 * - import refuses a 'backup' file holding one later than its exportedAt plus the tolerance, and a
 *   'rescue' file has that row set aside (or that singleton field reset to its default);
 * - the card and reminder rules (cards.ts cardHidden, backupReminder.ts) also ignore a dismissal
 *   dated after now, so data that slipped through (a clock moved back) never hides a card.
 * Event instants (at, startedAt, endedAt, askedAt, completedAt, enteredAt) are not listed: they
 * record when something happened. The grocery transfer times (sentAt, receivedAt,
 * laptopReceivedAt) are not listed either, because a refused write would lose the "received"
 * status (section 4.11). Part of the spec fingerprint (tables.ts specDescription).
 */
import { FUTURE_INSTANT_TOLERANCE_MS } from './limits';
import { type Instant, instantMs, isInstant, isPlainObject } from './primitives';
import type { BackupTableName } from './records';

export const BOOKKEEPING_INSTANT_FIELDS: Readonly<
  Partial<Record<BackupTableName, readonly string[]>>
> = Object.freeze({
  profile: Object.freeze([
    'carbCeilingStartedAt',
    'firstLowCarbAt',
    'goalSetAt',
    'createdAt',
    'updatedAt',
  ]),
  readiness: Object.freeze(['answeredAt']),
  targets: Object.freeze(['updatedAt']),
  settings: Object.freeze([
    'onboardingCompletedAt',
    'alcoholNoticeAckAt',
    'profileConfirmedAt',
    'scheduleConfirmedAt',
    'gardenConfirmedAt',
    'lastBackupAt',
    'rapidLossExplanationReadAt',
  ]),
  steps_log: Object.freeze(['updatedAt']),
  ingredients: Object.freeze(['packSizeEnteredAt', 'createdAt', 'updatedAt']),
  ingredient_overrides: Object.freeze(['createdAt', 'updatedAt']),
  recipes: Object.freeze(['createdAt', 'updatedAt']),
  plan_days: Object.freeze(['updatedAt']),
  garden: Object.freeze(['updatedAt']),
  pantry: Object.freeze(['updatedAt']),
  beverages: Object.freeze(['createdAt', 'updatedAt']),
  alcohol_day_notes: Object.freeze(['updatedAt']),
  alcohol_milestones: Object.freeze(['createdAt']),
  grocery_lists: Object.freeze(['createdAt', 'updatedAt']),
  card_state: Object.freeze(['firstShownAt', 'dismissedAt', 'doneAt']),
});

/** The latest acceptable bookkeeping instant, in milliseconds, for a write or file made at `at`. */
export function latestBookkeepingMs(at: Instant): number {
  return instantMs(at) + FUTURE_INSTANT_TOLERANCE_MS;
}

/**
 * The first bookkeeping field of `row` dated after `limitMs`, or null. `changed` limits the check
 * to fields written with a new value (a repository write never re-checks a value carried over).
 */
export function futureBookkeepingField(
  table: string,
  row: unknown,
  limitMs: number,
  changed: (field: string) => boolean = () => true,
): string | null {
  if (!isPlainObject(row)) return null;
  const fields = (BOOKKEEPING_INSTANT_FIELDS as Readonly<Record<string, readonly string[]>>)[table];
  for (const field of fields ?? []) {
    const value = row[field];
    if (isInstant(value) && changed(field) && instantMs(value) > limitMs) return field;
  }
  return null;
}
