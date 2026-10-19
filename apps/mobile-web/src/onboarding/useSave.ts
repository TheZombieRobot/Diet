/**
 * The one rule for a write that fails in the flow, the new Settings screens and the Today help
 * card (item 13 design section 3.15; E58): the control that started it is disabled while it runs;
 * a failure shows a plain message as an alert right where it happened (SaveError), focus moves to
 * it, the view stays, and the controls keep showing what is stored.
 */
import { onboarding, privacy } from '@diet/core/copy/health';
import { useCallback, useRef, useState } from 'react';
import { StorageClosedError, StorageFullError } from '../db/errors';
import { FlowStaleError } from './actions';

/** The message for a failed write, or null when none is shown here. */
export function saveFailureMessage(error: unknown): string | null {
  if (error instanceof StorageFullError) return privacy.storageFull;
  // The open status moves to reload-needed and the failure screen replaces the app (section 6.2).
  if (error instanceof StorageClosedError) return null;
  // The records changed under the screen: it re-renders from the live gates.
  if (error instanceof FlowStaleError) return null;
  return onboarding.frame.saveFailed;
}

export interface Save {
  readonly busy: boolean;
  readonly error: string | null;
  /** Counts failures, so a repeated failure with the same message moves focus again. */
  readonly failures: number;
  /** Runs the write unless one is running; true when it succeeded. */
  readonly run: (write: () => Promise<unknown>) => Promise<boolean>;
}

export function useSave(): Save {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const running = useRef(false);

  const run = useCallback(async (write: () => Promise<unknown>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    try {
      await write();
      setError(null);
      return true;
    } catch (failure) {
      setError(saveFailureMessage(failure));
      setFailures((n) => n + 1);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, error, failures, run };
}
