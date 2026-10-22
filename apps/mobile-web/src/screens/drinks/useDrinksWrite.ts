/**
 * One drinks form's write (item 28 design 2, "One error pattern"; A48): the control that started it
 * is disabled while it runs and a second tap is ignored; a failure shows one amber alert inside the
 * card that failed, with the rule's own line where there is one, the phone-full line, or "That was
 * not saved. Try again."; nothing is shown as saved until the live read returns the change. A write
 * refused because the records are closed shows nothing here: the storage failure screen takes over.
 * The message is shown with Today's WriteError, under the card's buttons.
 */
import { alcohol, privacy } from '@diet/core/copy/health';
import { useCallback, useRef, useState } from 'react';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';
import { appStorageStore } from '../../db/runtime';
import { useStore } from '../../store';

/** The message for a failed drinks write, or null when the failure screen takes over. */
export function drinksWriteMessage(error: unknown): string | null {
  if (error instanceof StorageClosedError) return null;
  if (error instanceof StorageFullError) return privacy.storageFull;
  if (error instanceof StorageRuleError) {
    if (error.rule === 'alcohol-notice-first') return alcohol.access.noticeFirst;
    if (error.rule === 'alcohol-logging-off') return alcohol.log.errors.off;
    if (error.rule === 'future-time') return alcohol.log.errors.future;
  }
  return alcohol.notSaved;
}

export interface DrinksWrite {
  readonly busy: boolean;
  readonly error: string | null;
  /** Runs the write unless one is running; its value, or null when it failed. */
  readonly run: <T>(write: () => Promise<T>) => Promise<{ readonly value: T } | null>;
  /** Clears the message (Cancel). */
  readonly clear: () => void;
}

export function useDrinksWrite(): DrinksWrite {
  const storage = useStore(appStorageStore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const run = useCallback(
    async <T>(write: () => Promise<T>): Promise<{ readonly value: T } | null> => {
      if (running.current) return null;
      running.current = true;
      setBusy(true);
      try {
        const value = await write();
        setError(null);
        return { value };
      } catch (failure) {
        if (failure instanceof StorageClosedError) storage?.db.closeForGood('reload-needed');
        setError(drinksWriteMessage(failure));
        return null;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [storage],
  );
  const clear = useCallback(() => {
    setError(null);
  }, []);
  return { busy, error, run, clear };
}
