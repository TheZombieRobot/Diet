import { OfflineIndicator } from '@diet/ui';
import type { ReactElement } from 'react';
import { offlineCopyStore } from '../pwa/offline';
import { useStore } from '../store';

/**
 * The offline pill for the screens drawn outside the app's shell and setup (the opening and
 * storage failure screens), in the top bar's place for it, so the offline state is visible on
 * every screen (UX_SCREENS design rules; item 37).
 */
export function TopBarPill(): ReactElement {
  const offlineCopy = useStore(offlineCopyStore);
  return (
    <div className="ui-topbar__actions">
      <OfflineIndicator offlineReady={offlineCopy === 'ready'} />
    </div>
  );
}
