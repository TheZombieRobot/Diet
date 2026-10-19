import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';

export interface NoticeProps {
  children: ReactNode;
  /** amber: a calm note that needs a look (a warning or a refusal); info: soft teal. */
  tone?: 'amber' | 'info';
  /** alert: announced at once (an error after an action); status: announced politely. */
  role?: 'alert' | 'status';
  /** A small decorative icon before the text, such as the meal check's bowl. */
  icon?: ReactNode;
  /** Buttons under the text, the full width of the notice (with an icon, not indented). */
  actions?: ReactNode;
}

/** A short boxed message inside a card, such as "Wrong password, or the file is damaged." */
export function Notice({
  children,
  tone = 'amber',
  role,
  icon,
  actions,
}: NoticeProps): ReactElement {
  return (
    <div className={classNames('ui-notice', `ui-notice--${tone}`)} role={role}>
      {icon === undefined ? (
        children
      ) : (
        <div className="ui-notice__with-icon">
          <span className="ui-notice__icon" aria-hidden="true">
            {icon}
          </span>
          <div className="ui-notice__text">{children}</div>
        </div>
      )}
      {actions}
    </div>
  );
}
