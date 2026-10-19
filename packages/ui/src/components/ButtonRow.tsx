import type { ReactElement, ReactNode } from 'react';

/** Buttons side by side, wrapping onto the next line on a narrow screen. */
export function ButtonRow({ children }: { children: ReactNode }): ReactElement {
  return <div className="ui-button-row">{children}</div>;
}
