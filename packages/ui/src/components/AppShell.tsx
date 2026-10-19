import type { ReactElement, ReactNode, Ref } from 'react';
import { classNames } from '../classNames';
import { TabBar, type TabItem } from './TabBar';
import { TopBar, type TopBarProps } from './TopBar';

export interface AppShellProps {
  /** The current screen's name, shown in the top bar. */
  title: string;
  /** The screen heading, so the app can move focus to it when the screen changes. */
  titleRef?: Ref<HTMLHeadingElement> | undefined;
  tabs: readonly TabItem[];
  /** The current tab's id, or undefined on a screen that is not a tab. */
  currentTab: string | undefined;
  /** How a tab tap switches screens (see TabBar); without it the tabs are plain links. */
  onTabSelect?: ((id: string) => void) | undefined;
  settingsHref: string;
  settingsCurrent?: TopBarProps['settingsCurrent'];
  /** The offline copy of the app is saved (the top-bar pill says "all saved" only then). */
  offlineReady: boolean;
  /** Banners shown above the screen, such as "Update available". */
  banners?: ReactNode;
  /** Shown above the tab bar, such as the "+" on Today. The screen gets room below for it. */
  floatingAction?: ReactNode;
  children: ReactNode;
}

/** Top bar, the screen, and the bottom tab bar: the frame around every screen. */
export function AppShell({
  title,
  titleRef,
  tabs,
  currentTab,
  onTabSelect,
  settingsHref,
  settingsCurrent,
  offlineReady,
  banners,
  floatingAction,
  children,
}: AppShellProps): ReactElement {
  const hasFloatingAction =
    floatingAction !== undefined && floatingAction !== null && floatingAction !== false;
  return (
    <div className={classNames('ui-shell', hasFloatingAction && 'ui-shell--with-fab')}>
      <TopBar
        title={title}
        titleRef={titleRef}
        settingsHref={settingsHref}
        settingsCurrent={settingsCurrent}
        offlineReady={offlineReady}
      />
      <main id="main" className="ui-shell__main" tabIndex={-1}>
        {banners === undefined || banners === null || banners === false ? null : (
          <div className="ui-shell__banners">{banners}</div>
        )}
        {children}
      </main>
      {floatingAction}
      <TabBar items={tabs} current={currentTab} onSelect={onTabSelect} />
    </div>
  );
}
