import type { ReactElement, ReactNode } from 'react';
import { LeafIcon } from '../icons';

/** A list of ingredient lines with a divider between them. */
export function LineList({ children }: { children: ReactNode }): ReactElement {
  return <ul className="ui-line-list">{children}</ul>;
}

export interface LineItemProps {
  name: string;
  /** Right-aligned, such as "800 g". */
  amount: string;
  /** Short lines under the name, such as "About 640 g cooked". */
  details?: readonly string[] | undefined;
  /** Visible words beside a leaf, such as "In your garden"; the leaf itself is decorative. */
  leaf?: string | undefined;
}

/** One ingredient line of a recipe (item 20), in the List board's row style. */
export function LineItem({ name, amount, details = [], leaf }: LineItemProps): ReactElement {
  return (
    <li className="ui-line">
      <span className="ui-line__head">
        <span className="ui-line__name">{name}</span>{' '}
        <span className="ui-line__amount">{amount}</span>
      </span>
      {details.map((detail, i) => (
        <span key={i} className="ui-line__detail">
          {detail}
        </span>
      ))}
      {leaf === undefined ? null : (
        <span className="ui-line__leaf">
          <LeafIcon size={16} /> {leaf}
        </span>
      )}
    </li>
  );
}
