import type { ReactElement } from 'react';
import { CloudIcon, CloudOffIcon } from '../icons';
import { useOnlineStatus } from '../useOnlineStatus';

/** UX_SCREENS.md global elements: the cloud pill in the top bar. */
export const OFFLINE_LABEL = 'Offline, all saved';
export const ONLINE_LABEL = 'Online';

/** Shows whether the phone is online. Records are saved on the phone either way. */
export function OfflineIndicator(): ReactElement {
  const online = useOnlineStatus();
  return (
    <span className="ui-pill" role="status" data-online={online ? 'true' : 'false'}>
      {online ? <CloudIcon /> : <CloudOffIcon />}
      {online ? ONLINE_LABEL : OFFLINE_LABEL}
    </span>
  );
}
