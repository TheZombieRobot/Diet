import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';

export interface BannerProps {
  title: string;
  children?: ReactNode;
  /** Buttons shown under the text. */
  actions?: ReactNode;
  /** info: soft teal, for something to act on; neutral: a plain card. */
  tone?: 'info' | 'neutral';
}

/** A short message above the screen content, announced politely by screen readers. */
export function Banner({ title, children, actions, tone = 'info' }: BannerProps): ReactElement {
  return (
    <div className={classNames('ui-banner', `ui-banner--${tone}`)} role="status">
      <p className="ui-banner__title">{title}</p>
      {children}
      {actions === undefined ? null : <div className="ui-banner__actions">{actions}</div>}
    </div>
  );
}
