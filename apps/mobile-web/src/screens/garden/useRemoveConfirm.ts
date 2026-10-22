import { type RefObject, useEffect, useRef, useState } from 'react';

/**
 * A remove confirmation's state (item 19 review): "Keep it" hands focus back to the button that
 * asked (`askRef`), so a screen reader keeps its place. The confirmation itself is RemoveConfirm
 * (parts.tsx), which takes focus on "Keep it" when it opens.
 */
export function useRemoveConfirm(): {
  readonly confirming: boolean;
  readonly askRef: RefObject<HTMLButtonElement | null>;
  readonly ask: () => void;
  /** "Keep it": closes the confirmation and focuses the button that asked. */
  readonly keep: () => void;
  /** Closes it after the removal, when the caller moves focus itself. */
  readonly close: () => void;
} {
  const [confirming, setConfirming] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  useEffect(() => {
    if (confirming || !returning.current) return;
    returning.current = false;
    askRef.current?.focus();
  }, [confirming]);
  return {
    confirming,
    askRef,
    ask: () => {
      setConfirming(true);
    },
    keep: () => {
      returning.current = true;
      setConfirming(false);
    },
    close: () => {
      setConfirming(false);
    },
  };
}
