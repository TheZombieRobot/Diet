/**
 * Bookkeeping instants that must never lie in the future (storage spec sections 3.1 and 12.3;
 * health-rules review). A card dismissal or done time, a backup confirmation, an onboarding
 * confirmation or an elapsed-time start dated ahead would hide the rapid-loss card, the alcohol
 * help card or the backup reminder, or delay a check-in, for as long as the date lies ahead. So:
 * - a repository write refuses any of these fields written with a new value later than the moment
 *   of writing plus FUTURE_INSTANT_TOLERANCE_MS (rule 'future'): with a correct clock only a bug
 *   can produce one;
 * - the export snapshot and import put one dated later than latestAcceptedMs (the earlier of the
 *   file's exportedAt and this phone's now, plus the tolerance) back to that limit and keep the
 *   row (clampFutureBookkeeping), so a clock corrected after a write never blocks a backup or a
 *   restore;
 * - the card and reminder rules (cards.ts cardHidden, backupReminder.ts) also ignore a dismissal
 *   dated after now, and an elapsed-time start dated after now is read as now (clock.ts
 *   elapsedStartAt), so data that slipped through (a clock moved back) never hides a card.
 * Event instants (at, startedAt, endedAt, askedAt, completedAt, enteredAt) are not listed: they
 * record when something happened. Three of them start something the app counts from, so a file
 * dated them ahead is refused instead (FUTURE_START_FIELDS). The grocery transfer times (sentAt,
 * receivedAt, laptopReceivedAt) are not listed either, because a refused write would lose the
 * "received" status (section 4.11). Part of the spec fingerprint (tables.ts specDescription).
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

/**
 * The latest instant a file may hold for a bookkeeping time or an event start, in milliseconds:
 * the earlier of its exportedAt and this phone's now, plus the tolerance. The export self-check
 * passes the export time as now.
 */
export function latestAcceptedMs(exportedAt: Instant, now: Instant): number {
  return Math.min(instantMs(exportedAt), instantMs(now)) + FUTURE_INSTANT_TOLERANCE_MS;
}

/**
 * A row with every bookkeeping instant dated after `limitMs` put back to that limit, never earlier
 * than an event instant of the same row (so a rule such as "updatedAt is not before enteredAt"
 * still holds), and the names of the fields changed. Nothing else is touched; the row is kept.
 */
export function clampFutureBookkeeping(
  table: string,
  row: unknown,
  limitMs: number,
): { readonly row: unknown; readonly clamped: readonly string[] } {
  if (!isPlainObject(row)) return { row, clamped: [] };
  const fields = (BOOKKEEPING_INSTANT_FIELDS as Readonly<Record<string, readonly string[]>>)[table];
  const late = (fields ?? []).filter((field) => {
    const value = row[field];
    return isInstant(value) && instantMs(value) > limitMs;
  });
  if (late.length === 0) return { row, clamped: [] };
  let floor = limitMs;
  for (const [field, value] of Object.entries(row)) {
    if (!(fields ?? []).includes(field) && isInstant(value))
      floor = Math.max(floor, instantMs(value));
  }
  const out: Record<string, unknown> = { ...row };
  for (const field of late) {
    const value = row[field] as Instant;
    out[field] = new Date(Math.min(instantMs(value), floor)).toISOString();
  }
  return { row: out, clamped: late };
}

/**
 * Event starts the app counts from (the Kickstart days, the extension window, a fast's length),
 * which a file may not date after latestAcceptedMs: a 'backup' file holding one is refused, and in
 * a 'rescue' copy a Kickstart start refuses the whole Kickstart history (D27) while a fast is set
 * aside (storage spec section 10.6 step 8; health-rules review). Not part of the fingerprint: it
 * decides only which files import, like the clamp above.
 */
export const FUTURE_START_FIELDS: Readonly<Partial<Record<BackupTableName, readonly string[]>>> =
  Object.freeze({
    kickstart_periods: Object.freeze(['startedAt']),
    kickstart_checks: Object.freeze(['askedAt']),
    fasts: Object.freeze(['startedAt']),
  });

/**
 * How long after its start a Kickstart period or a fast is ended when it never ran: kickstart.ts
 * NEVER_RAN_END_MS (a Kickstart ended before its first day) and fasts.end's end at the start when
 * the clock reads earlier than it (not imported from kickstart.ts, which depends on this module
 * through clock.ts).
 */
const NEVER_RAN_MS = 1;

/**
 * The first event start of `row` dated after `limitMs` (FUTURE_START_FIELDS), or null. A period or
 * a fast that never ran (ended at most 1 ms after its start: started while the clock ran ahead, then
 * ended once it was corrected) is not counted from, so its start may lie ahead; refusing it would
 * block every backup until the clock reached that start, and every unchecked copy for good (full
 * review F15).
 */
export function futureStartField(table: string, row: unknown, limitMs: number): string | null {
  if (!isPlainObject(row)) return null;
  const { startedAt, endedAt } = row;
  if (
    isInstant(startedAt) &&
    isInstant(endedAt) &&
    instantMs(endedAt) - instantMs(startedAt) <= NEVER_RAN_MS
  ) {
    return null;
  }
  const fields = (FUTURE_START_FIELDS as Readonly<Record<string, readonly string[]>>)[table];
  for (const field of fields ?? []) {
    const value = row[field];
    if (isInstant(value) && instantMs(value) > limitMs) return field;
  }
  return null;
}
