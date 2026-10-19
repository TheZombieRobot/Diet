import type { ReactElement, Ref } from 'react';
import { SettingsIcon } from '../icons';
import { IconLink } from './IconButton';
import { OfflineIndicator } from './OfflineIndicator';

export interface TopBarProps {
  /** The screen name. */
  title: string;
  /** The screen heading, so the app can move focus to it when the screen changes. */
  titleRef?: Ref<HTMLHeadingElement> | undefined;
  settingsHref: string;
  /**
   * 'page' on the settings screen itself; 'section' on a screen reached from it (About), which
   * marks the gear without saying it is the current page.
   */
  settingsCurrent?: 'page' | 'section' | undefined;
  /** The offline copy of the app is saved (see OfflineIndicator). */
  offlineReady: boolean;
}

/** Screen name, the offline pill and the settings gear (UX_SCREENS.md global elements). */
export function TopBar({
  title,
  titleRef,
  settingsHref,
  settingsCurrent,
  offlineReady,
}: TopBarProps): ReactElement {
  return (
    <header className="ui-topbar">
      {/* tabIndex -1: focusable by the app (a screen change), not a stop for the Tab key. */}
      <h1 ref={titleRef} className="ui-topbar__title" tabIndex={-1}>
        {title}
      </h1>
      <div className="ui-topbar__actions">
        <OfflineIndicator offlineReady={offlineReady} />
        <IconLink
          href={settingsHref}
          label="Settings"
          icon={<SettingsIcon />}
          current={
            settingsCurrent === 'page' ? 'page' : settingsCurrent === 'section' ? 'true' : undefined
          }
        />
      </div>
    </header>
  );
}
