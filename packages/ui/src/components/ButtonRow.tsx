import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';

/**
 * Buttons side by side, wrapping onto the next line on a narrow screen. `stacked`: one full-width
 * button per line (an editor inside a small card).
 */
export function ButtonRow({
  children,
  stacked = false,
}: {
  children: ReactNode;
  stacked?: boolean;
}): ReactElement {
  return (
    <div className={classNames('ui-button-row', stacked && 'ui-button-row--stacked')}>
      {children}
    </div>
  );
}
