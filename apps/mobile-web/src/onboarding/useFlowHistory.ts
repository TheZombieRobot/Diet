/**
 * Android's back gesture during setup (item 13 design section 3.3; E59). The flow keeps at most
 * one history entry of its own, at the same address, and only while the current view has an
 * in-flow Back. The gesture pops that entry; the flow then does exactly what its Back button does,
 * and pushes the entry again if the new view also has a Back. On a view without Back there is no
 * entry, so the gesture leaves the app as usual: nothing is lost, because setup resumes at the
 * same step. When setup ends, location.replace('#/today') replaces the flow's entry.
 */
import { useEffect, useRef } from 'react';

const FLOW_STATE = { dietFlow: true } as const;

export function useFlowHistory(hasBack: boolean, onBack: () => void): void {
  const pushed = useRef(false);
  const ignorePops = useRef(0);
  const back = useRef(onBack);

  useEffect(() => {
    back.current = onBack;
  });

  useEffect(() => {
    const onPop = () => {
      if (ignorePops.current > 0) {
        ignorePops.current -= 1;
        return;
      }
      if (!pushed.current) return;
      pushed.current = false;
      back.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  // After every render: a Back that moved to another view with a Back needs the entry again.
  useEffect(() => {
    if (hasBack && !pushed.current) {
      window.history.pushState(FLOW_STATE, '');
      pushed.current = true;
    } else if (!hasBack && pushed.current) {
      // Drop the flow's own entry, so the gesture on this view leaves the app.
      pushed.current = false;
      ignorePops.current += 1;
      window.history.back();
    }
  });
}
