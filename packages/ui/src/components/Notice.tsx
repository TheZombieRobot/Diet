import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';

export interface NoticeProps {
  children: ReactNode;
  /** amber: a calm note that needs a look (a warning or a refusal); info: soft teal. */
  tone?: 'amber' | 'info';
  /** alert: announced at once (an error after an action); status: announced politely. */
  role?: 'alert' | 'status';
}

/** A short boxed message inside a card, such as "Wrong password, or the file is damaged." */
export function Notice({ children, tone = 'amber', role }: NoticeProps): ReactElement {
  return (
    <div className={classNames('ui-notice', `ui-notice--${tone}`)} role={role}>
      {children}
    </div>
  );
}
