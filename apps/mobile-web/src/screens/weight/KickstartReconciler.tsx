import { useEffect } from 'react';
import type { AppStorage } from '../../db/runtime';
import { reconcileKickstart } from './kickstartActions';
import { useWeightView } from './useWeightView';

/**
 * Keeps the stored Kickstart records in line with the phase rule on whatever screen is open (item
 * 14 design section 5.5): on launch, on every readiness, diet-mode, period or targets change, and
 * every minute while an end or a preset move is still due. Renders nothing. Mounted once in App
 * while the records are open; it does nothing before setup is complete.
 */
export function KickstartReconciler({ storage }: { readonly storage: AppStorage }): null {
  const view = useWeightView(storage);
  useEffect(() => {
    if (view === undefined) return;
    const { endNeeded, presetMoveDue } = view.overview.kickstart;
    if (endNeeded === null && presetMoveDue === null) return;
    void reconcileKickstart(storage, view.overview);
  }, [storage, view]);
  return null;
}
