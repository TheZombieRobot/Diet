/**
 * The "yes" to a stop-sign question before a Kickstart start (item 14 W31; cross-item ruling 9;
 * full review F6, F8, F18). It is a record: a card_state row of the Kickstart stop-signs card with
 * trigger 'date:<LocalDate>' (the local date of the answer; the card's 'period:<Id>' rows are the
 * card during a Kickstart), whose firstShownAt is when the latest "yes" that day was given and
 * whose dismissal is the OK on its guidance (eat, salt and fluids, 111 and Healthline). Being a
 * record, it is the same in every
 * tab, survives the app being closed, is in backups (HS-15), is kept by a restore like the rest of
 * the Kickstart history, and goes with delete-all everywhere (HS-30).
 *
 * What it changes: no Kickstart may start for the rest of that local day (W31, unchanged); its
 * guidance shows that day until OK; and the exercise check counts it for 336 hours like a stop-sign
 * check (ruling 9: lighter session or rest only, naming the day).
 */
import { type CardId, cardHidden, cardTrigger } from '../storage/cards';
import { instantMs, isLocalDate, type Instant } from '../storage/primitives';
import type { CardStateRecord } from '../storage/records';
import type { LocalDate } from '../util/time';
import { KICKSTART_START_AFTER_STOP_SIGN_HOURS } from './phase';

export const PRE_START_STOP_SIGN_CARD = 'kickstart-stop-signs' satisfies CardId;

const PRE_START_PREFIX = 'date:';

/** The card_state trigger of a pre-start "yes" given on `date`. */
export function preStartTrigger(date: LocalDate): string {
  return `${PRE_START_PREFIX}${date}`;
}

type PreStartRow = Pick<
  CardStateRecord,
  'cardId' | 'trigger' | 'firstShownAt' | 'dismissedAt' | 'dismissedTimeZone' | 'doneAt'
>;

/** Whether a card_state row is a pre-start "yes" (not the stop-signs card of a period). */
export function isPreStartStopSignRow(row: Pick<CardStateRecord, 'cardId' | 'trigger'>): boolean {
  return row.cardId === PRE_START_STOP_SIGN_CARD && row.trigger.startsWith(PRE_START_PREFIX);
}

const isPreStart = isPreStartStopSignRow;

/** The pre-start "yes" row of `date`, if there is one. */
export function preStartRowOn(
  cardStates: readonly PreStartRow[],
  date: LocalDate,
): PreStartRow | null {
  const trigger = preStartTrigger(date);
  return cardStates.find((row) => isPreStart(row) && row.trigger === trigger) ?? null;
}

/** A pre-start "yes" was given on `today`: no Kickstart may start for the rest of it (W31). */
export function preStartStopSignOn(cardStates: readonly PreStartRow[], today: LocalDate): boolean {
  return preStartRowOn(cardStates, today) !== null;
}

/** Its guidance shows on `today` until OK: the row of today, not hidden by its own dismissal. */
export function preStartGuidanceDue(
  cardStates: readonly PreStartRow[],
  today: LocalDate,
  now: Instant,
): boolean {
  const row = preStartRowOn(cardStates, today);
  if (row === null) return false;
  const dismissal = cardTrigger(row.cardId, row.trigger)?.dismissal ?? { kind: 'final' };
  return !cardHidden({ now, row, dismissal, drinkingDayCutoverMinutes: 0 });
}

/**
 * For the exercise check (cross-item ruling 9): the local date of the latest pre-start "yes" in
 * the last 336 hours, or null. The time is the row's firstShownAt (the latest "yes" that day), or
 * its OK when an imported row has no firstShownAt; one dated after now (a clock set back) counts,
 * which is the cautious reading.
 */
export function recentPreStartStopSignDay(
  cardStates: readonly PreStartRow[],
  now: Instant,
): LocalDate | null {
  const waitMs = KICKSTART_START_AFTER_STOP_SIGN_HOURS * 3_600_000;
  let latest: LocalDate | null = null;
  for (const row of cardStates) {
    if (!isPreStart(row)) continue;
    const date = row.trigger.slice('date:'.length);
    const at = row.firstShownAt ?? row.dismissedAt ?? row.doneAt;
    if (!isLocalDate(date) || at === null) continue;
    if (instantMs(now) - instantMs(at) >= waitMs) continue;
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}
