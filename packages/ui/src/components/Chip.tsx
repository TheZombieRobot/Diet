import type { ReactElement } from 'react';
import { classNames } from '../classNames';

export interface ChipProps {
  /** teal: the default tint; neutral: the chip grey; amber: the amber tint. */
  tone?: 'teal' | 'neutral' | 'amber';
  children: string;
}

/**
 * A small tinted pill with a word, such as a nutrition source ("Label", "Database", "Estimate").
 * The word carries the meaning, so the colour is never the only signal.
 */
export function Chip({ tone = 'teal', children }: ChipProps): ReactElement {
  return (
    <span className={classNames('ui-chip', tone !== 'teal' && `ui-chip--${tone}`)}>{children}</span>
  );
}
