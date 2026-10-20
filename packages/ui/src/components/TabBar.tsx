import type { MouseEvent, ReactElement, ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
}

export interface TabBarProps {
  items: readonly TabItem[];
  /** The id of the current tab, or undefined on a screen that is not a tab (Settings, About). */
  current: string | undefined;
  /**
   * The current tab is the parent of the screen shown (a sub-screen such as Move's session), so
   * it is marked aria-current="true" rather than "page", as the gear is for About.
   */
  currentIsParent?: boolean | undefined;
  /** The navigation landmark's name. */
  label?: string;
  /**
   * Called instead of following the link on a plain tap or click, so the app can decide how the
   * switch enters the browser history. A modified click (new tab, new window) follows the link.
   */
  onSelect?: ((id: string) => void) | undefined;
}

const isPlainClick = (event: MouseEvent): boolean =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * The bottom tab bar: one link per tab, the current one marked with aria-current="page" (or "true"
 * on a sub-screen of that tab) and, not by colour alone, a tinted pill behind its icon.
 */
export function TabBar({
  items,
  current,
  currentIsParent = false,
  label = 'Main',
  onSelect,
}: TabBarProps): ReactElement {
  return (
    <nav className="ui-tabbar" aria-label={label}>
      <ul className="ui-tabbar__list">
        {items.map((item) => (
          <li key={item.id}>
            <a
              className="ui-tabbar__link"
              href={item.href}
              aria-current={item.id === current ? (currentIsParent ? 'true' : 'page') : undefined}
              onClick={
                onSelect === undefined
                  ? undefined
                  : (event) => {
                      if (!isPlainClick(event)) return;
                      event.preventDefault();
                      onSelect(item.id);
                    }
              }
            >
              <span className="ui-tabbar__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="ui-tabbar__label">{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
