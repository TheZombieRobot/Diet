/**
 * One Today control's write (item 16 design sections 1.6, 1.7 and 1.14; T26): the control is
 * disabled while its own write runs; a failure says plainly that nothing was saved (WriteError,
 * an alert under the card's controls), and focus stays on the control that was used. Nothing is
 * shown as saved until the stored row comes back in the live read.
 */
import { privacy, today } from '@diet/core/copy/health';
import { useCallback, useRef, useState } from 'react';
import { StorageFullError } from '../../db/errors';

export interface TodayWrite {
  readonly busy: boolean;
  readonly error: string | null;
  /** Runs the write unless one is running; its value, or null when it failed. */
  readonly run: <T>(write: () => Promise<T>) => Promise<{ readonly value: T } | null>;
}

/** The message for a failed write on Today. */
export function writeFailureMessage(error: unknown): string {
  return error instanceof StorageFullError ? privacy.storageFull : today.saveFailed;
}

export function useTodayWrite(): TodayWrite {
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
        setError(writeFailureMessage(failure));
        return null;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [],
  );
  return { busy, error, run };
}
