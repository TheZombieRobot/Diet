/**
 * Android's back gesture during setup (item 13 design section 3.3; E59). The flow keeps at most
 * one history entry of its own, at the same address, and only while the current view has an
 * in-flow Back. The gesture pops that entry; the flow then does exactly what its Back button does,
 * and pushes the entry again if the new view also has a Back. On a view without Back there is no
 * entry, so the gesture leaves the app as usual: nothing is lost, because setup resumes at the
 * same step.
 *
 * Only a pop of the flow's own entry back to the same address is a Back: a typed address, a link
 * or the replace when setup ends also fire popstate, and none of them moves the flow. When setup
 * ends, leaveFlow first pops the flow's entry and then replaces the entry under it, so Today sits
 * on the one entry the app had before setup and a single back gesture leaves the app.
 *
 * The flow's entry is module state: there is one flow, and leaveFlow runs after it unmounts.
 */
import { useEffect, useRef } from 'react';

const FLOW_STATE = { dietFlow: true } as const;

/** The address the flow's own entry was pushed at, while it is in the history. */
let entryHref: string | null = null;
/** Pops the flow caused itself (dropping its entry), which are not a Back. */
let ignorePops = 0;
/** Setup is ending: nothing is pushed again and no pop is a Back. */
let leaving = false;
/** The current view has a Back, so it wants the entry (pushed once a pending drop has landed). */
let wantEntry = false;

const pushEntry = (): void => {
  window.history.pushState(FLOW_STATE, '');
  entryHref = window.location.href;
};

/** How long leaveFlow waits for its own pop before it replaces the address anyway. */
const LEAVE_WAIT_MS = 1_000;

export function useFlowHistory(hasBack: boolean, onBack: () => void): void {
  const back = useRef(onBack);

  useEffect(() => {
    back.current = onBack;
  });

  useEffect(() => {
    // A new flow (the repair questions, or setup after delete-all) starts with no entry of its own.
    entryHref = null;
    ignorePops = 0;
    leaving = false;
    const onPop = () => {
      if (ignorePops > 0) {
        // The flow's own drop has landed; a view that has a Back since then gets its entry now.
        ignorePops -= 1;
        if (ignorePops === 0 && wantEntry && entryHref === null && !leaving) pushEntry();
        return;
      }
      if (leaving || entryHref === null) return;
      // An address change (a typed address, a link, the replace when setup ends): not a Back.
      if (window.location.href !== entryHref) return;
      entryHref = null;
      back.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  // After every render: a Back that moved to another view with a Back needs the entry again. A
  // drop still on its way (the history moves later than this code) is waited for, so the new entry
  // is never the one it removes.
  useEffect(() => {
    if (leaving) return;
    wantEntry = hasBack;
    if (ignorePops > 0) return;
    if (hasBack && entryHref === null) {
      pushEntry();
    } else if (!hasBack && entryHref !== null) {
      // Drop the flow's own entry, so the gesture on this view leaves the app.
      entryHref = null;
      ignorePops += 1;
      window.history.back();
    }
  });
}

/**
 * Leaves the flow for `target` (setup finished, or the repair questions answered): the flow's own
 * entry is popped first, then the entry under it is replaced, so no entry of the flow is left
 * behind Today (E59).
 */
export function leaveFlow(target: string): void {
  leaving = true;
  if (entryHref === null) {
    window.location.replace(target);
    return;
  }
  entryHref = null;
  let timer = 0;
  const replace = () => {
    window.removeEventListener('popstate', replace);
    window.clearTimeout(timer);
    window.location.replace(target);
  };
  window.addEventListener('popstate', replace);
  timer = window.setTimeout(replace, LEAVE_WAIT_MS);
  window.history.back();
}
