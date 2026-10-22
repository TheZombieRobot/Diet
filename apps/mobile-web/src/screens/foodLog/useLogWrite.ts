/**
 * One food-log control's write (item 23 design 1.2 "Write failures"; item 16's pattern): while it
 * runs the control is aria-disabled and a second tap is ignored, so a double tap writes one row;
 * a refusal is shown in the card by its rule (writeFailureText), and nothing is shown as logged
 * until the stored row comes back in the live read.
 */
import { useCallback, useRef, useState } from 'react';
import { writeFailureText } from './text';

export interface LogWrite {
  readonly busy: boolean;
  readonly error: string | null;
  /** The refusal itself, for a panel that answers one rule with a confirmation. */
  readonly failure: unknown;
  readonly clear: () => void;
  readonly run: <T>(write: () => Promise<T>) => Promise<{ readonly value: T } | null>;
}

export function useLogWrite(context: 'label' | 'recipe' | 'plan' | 'change'): LogWrite {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const running = useRef(false);
  const run = useCallback(async <T>(write: () => Promise<T>) => {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    try {
      const value = await write();
      setFailure(null);
      return { value };
    } catch (error) {
      setFailure(error);
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => {
    setFailure(null);
  }, []);
  return {
    busy,
    failure,
    error: failure === null ? null : writeFailureText(failure, context),
    clear,
    run,
  };
}
