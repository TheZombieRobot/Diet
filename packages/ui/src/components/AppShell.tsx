import type { ReactElement, ReactNode } from 'react';
import { TabBar, type TabItem } from './TabBar';
import { TopBar } from './TopBar';

export interface AppShellProps {
  /** The current screen's name, shown in the top bar. */
  title: string;
  tabs: readonly TabItem[];
  /** The current tab's id, or undefined on a screen that is not a tab. */
  currentTab: string | undefined;
  settingsHref: string;
  settingsCurrent: boolean;
  /** Banners shown above the screen, such as "Update available". */
  banners?: ReactNode;
  /** Shown above the tab bar, such as the "+" on Today. */
  floatingAction?: ReactNode;
  children: ReactNode;
}

/** Top bar, the screen, and the bottom tab bar: the frame around every screen. */
export function AppShell({
  title,
  tabs,
  currentTab,
  settingsHref,
  settingsCurrent,
  banners,
  floatingAction,
  children,
}: AppShellProps): ReactElement {
  return (
    <div className="ui-shell">
      <TopBar title={title} settingsHref={settingsHref} settingsCurrent={settingsCurrent} />
      <main id="main" className="ui-shell__main" tabIndex={-1}>
        {banners === undefined || banners === null || banners === false ? null : (
          <div className="ui-shell__banners">{banners}</div>
        )}
        {children}
      </main>
      {floatingAction}
      <TabBar items={tabs} current={currentTab} />
    </div>
  );
}
