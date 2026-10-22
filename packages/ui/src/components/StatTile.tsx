import type { ReactElement, ReactNode } from 'react';

/** Two inset tiles side by side (the mock-up's Drinks card); one column on a narrow screen. */
export function StatGrid({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className="ui-stat-grid">{children}</div>;
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /**
   * What a screen reader says in place of `value` ("1 drink, 1.30 standard drinks"). When given,
   * the visible value is hidden from screen readers and this is read instead.
   */
  spoken?: string | undefined;
  detail?: ReactNode;
}

/** A figure in an inset tile, in the neutral colour: never success, warning or alarm. */
export function StatTile({ label, value, spoken, detail }: StatTileProps): ReactElement {
  return (
    <div className="ui-stat-tile">
      <p className="ui-stat-tile__label">{label}</p>
      <p className="ui-stat-tile__value">
        {spoken === undefined ? (
          value
        ) : (
          <>
            <span aria-hidden="true">{value}</span>
            <span className="ui-visually-hidden">{spoken}</span>
          </>
        )}
      </p>
      {detail === undefined || detail === null ? null : (
        <p className="ui-stat-tile__detail">{detail}</p>
      )}
    </div>
  );
}
