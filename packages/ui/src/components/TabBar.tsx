import type { ReactElement, ReactNode } from 'react';

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
  /** The navigation landmark's name. */
  label?: string;
}

/** The bottom tab bar: one link per tab, the current one marked with aria-current="page". */
export function TabBar({ items, current, label = 'Main' }: TabBarProps): ReactElement {
  return (
    <nav className="ui-tabbar" aria-label={label}>
      <ul className="ui-tabbar__list">
        {items.map((item) => (
          <li key={item.id}>
            <a
              className="ui-tabbar__link"
              href={item.href}
              aria-current={item.id === current ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
