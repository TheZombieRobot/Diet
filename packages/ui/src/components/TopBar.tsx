import type { ReactElement } from 'react';
import { SettingsIcon } from '../icons';
import { IconLink } from './IconButton';
import { OfflineIndicator } from './OfflineIndicator';

export interface TopBarProps {
  /** The screen name. */
  title: string;
  settingsHref: string;
  /** True on the settings screen and the screens under it. */
  settingsCurrent: boolean;
}

/** Screen name, the offline pill and the settings gear (UX_SCREENS.md global elements). */
export function TopBar({ title, settingsHref, settingsCurrent }: TopBarProps): ReactElement {
  return (
    <header className="ui-topbar">
      <h1 className="ui-topbar__title">{title}</h1>
      <div className="ui-topbar__actions">
        <OfflineIndicator />
        <IconLink
          href={settingsHref}
          label="Settings"
          icon={<SettingsIcon />}
          current={settingsCurrent}
        />
      </div>
    </header>
  );
}
