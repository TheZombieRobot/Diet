import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { WriteGate } from '../../db/gate';
import { createStore } from '../../store';

/**
 * True while a restore or delete-all runs in this tab (wording review). Both close the write gate
 * before they wait for the other tabs, so the Backup and data card shows "Nothing more will be
 * saved until the app reloads" and its Reload only once one has stopped without finishing.
 */
export const recordsBusyStore = createStore(false);

/**
 * Moves focus to the start of a panel's new step whenever the step changes (not on the first
 * render), so a screen reader announces it and Tab continues from there instead of from the top
 * of the page (ux review). Put the ref on the step's first paragraph, with tabIndex -1 and the
 * ui-step-start class. With `preventScroll`, the step scrolls itself (the pairing screen's camera
 * view and notices).
 */
export function useStepFocus<T extends HTMLElement>(
  step: string,
  preventScroll = false,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus({ preventScroll });
  }, [step, preventScroll]);
  return ref;
}

const noSubscribe = (): (() => void) => () => undefined;

/** Whether this tab's write gate is still open (it closes for good on a restore or delete-all). */
export function useGateOpen(gate: WriteGate | null): boolean {
  return useSyncExternalStore(
    gate === null ? noSubscribe : gate.onClose,
    () => gate?.isOpen() ?? true,
    () => gate?.isOpen() ?? true,
  );
}
