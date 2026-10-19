/**
 * One control's write on the fasting screens (item 15 design 3.9): the control is disabled only
 * while its own write runs, and a failure keeps its line for ActionError to show directly under
 * the control. The view stays as stored.
 */
import { useCallback, useRef, useState } from 'react';
import type { ActionResult } from './actions';

export interface FastingAction {
  readonly busy: boolean;
  readonly failure: string | null;
  /** Counts failures, so the same message twice moves focus again. */
  readonly failures: number;
  /** Runs the write unless one is running; the value on success, null otherwise. */
  readonly run: <T>(work: () => Promise<ActionResult<T>>) => Promise<{ value: T } | null>;
  readonly clear: () => void;
}

export function useAction(): FastingAction {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const running = useRef(false);

  const run = useCallback(
    async <T>(work: () => Promise<ActionResult<T>>): Promise<{ value: T } | null> => {
      if (running.current) return null;
      running.current = true;
      setBusy(true);
      try {
        const result = await work();
        if (result.ok) {
          setFailure(null);
          return { value: result.value };
        }
        setFailure(result.failure.message);
        setFailures((n) => n + 1);
        return null;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [],
  );
  const clear = useCallback(() => {
    setFailure(null);
  }, []);

  return { busy, failure, failures, run, clear };
}
