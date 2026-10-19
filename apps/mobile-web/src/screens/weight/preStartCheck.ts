/**
 * A "yes" to a pre-start stop-sign question (item 14 design section 2.3.1, W31): no Kickstart may
 * start for the rest of that local day. Held in session storage (this tab only; cleared by
 * delete-all), never in the records; every read and write is guarded, and an unreadable value
 * counts as absent.
 */
import { isLocalDate, type LocalDate } from '@diet/core';
import type { Platform } from '../../db/runtime';
import { createStore } from '../../store';

const PRE_START_KEY = 'diet.kickstart.preStartStopSign';

export const preStartStopSignStore = createStore<LocalDate | null>(null);

/** Reads the held answer; an unreadable value counts as absent. */
export function loadPreStartStopSign(platform: Platform): void {
  try {
    const stored = platform.sessionStorage().getItem(PRE_START_KEY);
    if (isLocalDate(stored)) preStartStopSignStore.set(stored);
  } catch {
    // No session storage: nothing was held.
  }
}

export function recordPreStartStopSign(platform: Platform, today: LocalDate): void {
  preStartStopSignStore.set(today);
  try {
    platform.sessionStorage().setItem(PRE_START_KEY, today);
  } catch {
    // Held in memory for this page only.
  }
}
