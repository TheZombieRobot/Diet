/**
 * A "yes" to a pre-start stop-sign question (item 14 design section 2.3.1, W31; cross-item ruling
 * 9; full review F6, F8, F18) is a record: a card_state row of that local date (core
 * weight/preStart.ts), so every tab, a reload, a closed app, a backup and delete-all treat it like
 * any other record. No Kickstart may start for the rest of that day; its guidance (eat, salt, 111)
 * shows on Today and on the Weight screen, through a reload and a change of screen, until OK is
 * tapped that day (item 14 review); and the exercise check counts it for 336 hours. Until the row
 * is written, and if it cannot be, this page holds the answer in memory, so neither the guidance
 * nor the refusal depends on a write succeeding. OK is the other way round: the guidance goes only
 * once its dismissal is stored, so a reload or a closed app never brings back guidance this page
 * said was done, and if the write fails it stays and OK can be tapped again. Nothing is kept in
 * web storage.
 */
import {
  type CardStateRecord,
  type Instant,
  type LocalDate,
  PRE_START_STOP_SIGN_CARD,
  preStartGuidanceDue,
  preStartRowOn,
  preStartStopSignOn,
  preStartTrigger,
} from '@diet/core';
import type { AppStorage } from '../../db/runtime';
import { createStore } from '../../store';

/** The local date of a "yes" given in this page (held until its row is written, or if it cannot be). */
export const preStartStopSignStore = createStore<LocalDate | null>(null);
/** The local date of an OK on the guidance stored from this page. */
export const preStartSeenStore = createStore<LocalDate | null>(null);

/** A new "yes": recorded for the day, and its guidance shows again until OK. */
export async function recordPreStartStopSign(storage: AppStorage, today: LocalDate): Promise<void> {
  preStartStopSignStore.set(today);
  preStartSeenStore.set(null);
  await storage.repos.cardState.reopen(PRE_START_STOP_SIGN_CARD, preStartTrigger(today));
}

/**
 * OK on the guidance: once stored, it stays away for the rest of that day, in every tab. This
 * page hides it then, even while its clock still reads earlier than the stored OK.
 */
export async function acknowledgePreStartStopSign(
  storage: AppStorage,
  today: LocalDate,
): Promise<void> {
  await storage.repos.cardState.dismiss(PRE_START_STOP_SIGN_CARD, preStartTrigger(today));
  preStartSeenStore.set(today);
}

/** A pre-start "yes" holds today: its record, or this page's hold. */
export function preStartStopSignToday(
  cardStates: readonly CardStateRecord[],
  held: LocalDate | null,
  today: LocalDate,
): boolean {
  return held === today || preStartStopSignOn(cardStates, today);
}

/**
 * Its guidance shows: today's record until its OK (in any tab), or, while there is no record
 * (not yet written, or the write failed), this page's hold; never after an OK stored from this
 * page.
 */
export function preStartGuidanceShown(
  cardStates: readonly CardStateRecord[],
  page: { readonly held: LocalDate | null; readonly seen: LocalDate | null },
  today: LocalDate,
  now: Instant,
): boolean {
  if (page.seen === today) return false;
  if (preStartRowOn(cardStates, today) !== null) return preStartGuidanceDue(cardStates, today, now);
  return page.held === today;
}
