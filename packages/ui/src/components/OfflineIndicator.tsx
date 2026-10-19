import type { ReactElement } from 'react';
import { CloudIcon, CloudOffIcon } from '../icons';
import { useOnlineStatus } from '../useOnlineStatus';

/** UX_SCREENS.md global elements: the cloud pill in the top bar. */
export const OFFLINE_LABEL = 'Offline, all saved';
/** Offline before the app's offline copy is saved: nothing promises that everything is saved. */
export const OFFLINE_NOT_READY_LABEL = 'Offline';
export const ONLINE_LABEL = 'Online';

export interface OfflineIndicatorProps {
  /** The offline copy of the app is saved on the device, so it opens without a connection. */
  offlineReady: boolean;
}

/** Shows whether the phone is online. Records are saved on the phone either way. */
export function OfflineIndicator({ offlineReady }: OfflineIndicatorProps): ReactElement {
  const online = useOnlineStatus();
  const offlineLabel = offlineReady ? OFFLINE_LABEL : OFFLINE_NOT_READY_LABEL;
  return (
    <span className="ui-pill" role="status" data-online={online ? 'true' : 'false'}>
      {online ? <CloudIcon /> : <CloudOffIcon />}
      {online ? ONLINE_LABEL : offlineLabel}
    </span>
  );
}
