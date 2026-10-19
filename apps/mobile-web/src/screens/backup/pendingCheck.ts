/**
 * An unanswered "Can you see the file?" (storage spec section 10.5 step 6; ux review). On a phone,
 * checking Downloads means leaving the app, and Android may reload it in the meantime, so the
 * question is kept outside the export panel: in memory, so it survives moving between screens,
 * and in sessionStorage, so it survives a reload of the same tab. It holds only the file name and
 * the export time, never a record. While it is set, the Backup and data card asks again; Yes or No
 * clears it. Leaving it unanswered records nothing (D21). Delete-all clears sessionStorage, and a
 * restore clears it before the reload.
 */
import { type Instant, isInstant, isPlainObject } from '@diet/core';
import { createStore, type Store } from '../../store';

export interface PendingCheck {
  readonly fileName: string;
  readonly exportedAt: Instant;
}

export const PENDING_CHECK_KEY = 'diet-pending-backup-check';

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function read(): PendingCheck | null {
  try {
    const text = session()?.getItem(PENDING_CHECK_KEY) ?? null;
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    if (
      isPlainObject(value) &&
      typeof value.fileName === 'string' &&
      /^diet-backup-[\w.-]+\.json$/.test(value.fileName) &&
      isInstant(value.exportedAt)
    ) {
      return { fileName: value.fileName, exportedAt: value.exportedAt };
    }
  } catch {
    // Unreadable storage or text: nothing is pending.
  }
  return null;
}

/** The unanswered question, if any (read from sessionStorage when the app starts). */
export const pendingCheckStore: Store<PendingCheck | null> = createStore(read());

/** Sets or clears the unanswered question, in memory and in sessionStorage. */
export function setPendingCheck(next: PendingCheck | null): void {
  pendingCheckStore.set(next);
  try {
    const storage = session();
    if (next === null) storage?.removeItem(PENDING_CHECK_KEY);
    else storage?.setItem(PENDING_CHECK_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the question still lasts until the tab reloads.
  }
}

/** Reads sessionStorage again (tests; and after another part of the app cleared it). */
export function reloadPendingCheck(): void {
  pendingCheckStore.set(read());
}
