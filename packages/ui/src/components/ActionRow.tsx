import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';

export interface ActionRowProps {
  href: string;
  title: string;
  detail?: string;
  /** A small icon or short text in a rounded square at the left. Decorative. */
  badge: ReactNode;
  /** emergency: red, only for emergency instructions such as calling 111. */
  tone?: 'default' | 'emergency';
}

/** A full-width link row at least 64 px high, such as a help number to call. */
export function ActionRow({
  href,
  title,
  detail,
  badge,
  tone = 'default',
}: ActionRowProps): ReactElement {
  return (
    <a
      className={classNames('ui-action-row', tone === 'emergency' && 'ui-action-row--emergency')}
      href={href}
    >
      <span className="ui-action-row__badge" aria-hidden="true">
        {badge}
      </span>
      <span className="ui-action-row__text">
        <span className="ui-action-row__title">{title}</span>
        {/* The space keeps the title and detail apart in the link's accessible name. */}
        {detail === undefined ? null : (
          <>
            {' '}
            <span className="ui-action-row__detail">{detail}</span>
          </>
        )}
      </span>
    </a>
  );
}
