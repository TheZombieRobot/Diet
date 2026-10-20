/**
 * A "yes" to a pre-start stop-sign question (item 14 design section 2.3.1, W31): no Kickstart may
 * start for the rest of that local day. Held in session storage (this tab only; cleared by
 * delete-all), never in the records; every read and write is guarded, and an unreadable value
 * counts as absent. Its guidance (eat, salt, 111) shows on Today and on the Weight screen, through
 * a reload and a change of screen, until OK is tapped that day (item 14 review).
 */
import { isLocalDate, type LocalDate } from '@diet/core';
import type { Platform } from '../../db/runtime';
import { createStore } from '../../store';

const PRE_START_KEY = 'diet.kickstart.preStartStopSign';
const SEEN_KEY = 'diet.kickstart.preStartStopSignSeen';

export const preStartStopSignStore = createStore<LocalDate | null>(null);
/** The local date on which OK was tapped on the guidance after that "yes". */
export const preStartSeenStore = createStore<LocalDate | null>(null);

function read(platform: Platform, key: string): LocalDate | null {
  try {
    const stored = platform.sessionStorage().getItem(key);
    return isLocalDate(stored) ? stored : null;
  } catch {
    // No session storage: nothing was held.
    return null;
  }
}

function write(platform: Platform, key: string, value: LocalDate | null): void {
  try {
    if (value === null) platform.sessionStorage().removeItem(key);
    else platform.sessionStorage().setItem(key, value);
  } catch {
    // Held in memory for this page only.
  }
}

/** Reads the held answer and its OK; an unreadable value counts as absent. */
export function loadPreStartStopSign(platform: Platform): void {
  const held = read(platform, PRE_START_KEY);
  if (held !== null) preStartStopSignStore.set(held);
  const seen = read(platform, SEEN_KEY);
  if (seen !== null) preStartSeenStore.set(seen);
}

/** A new "yes": held for the day, and its guidance shows again until OK. */
export function recordPreStartStopSign(platform: Platform, today: LocalDate): void {
  preStartStopSignStore.set(today);
  preStartSeenStore.set(null);
  write(platform, PRE_START_KEY, today);
  write(platform, SEEN_KEY, null);
}

/** OK on the guidance: it stays away for the rest of that day. */
export function acknowledgePreStartStopSign(platform: Platform, today: LocalDate): void {
  preStartSeenStore.set(today);
  write(platform, SEEN_KEY, today);
}
