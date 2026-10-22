import { useId, type ReactElement, type ReactNode } from 'react';
import { ChevronIcon } from '../icons';

export interface ExpandableRowProps {
  title: string;
  /** A short line under the title, such as "Contains soy · Check the label for allergens". */
  detail?: string | undefined;
  /** An amber pill after the detail; its words say what it means, so colour is never the only signal. */
  flag?: string | undefined;
  expanded: boolean;
  onToggle: () => void;
  /** The panel shown under the row while it is expanded. */
  children: ReactNode;
}

/**
 * A list row (inside a `ul.ui-divider-rows`) that opens a panel under itself, as on the List
 * mock-up: the whole row is one button at least 48 px high, named by its text.
 */
export function ExpandableRow({
  title,
  detail,
  flag,
  expanded,
  onToggle,
  children,
}: ExpandableRowProps): ReactElement {
  const panelId = useId();
  return (
    <li className="ui-expandable">
      <button
        type="button"
        className="ui-expandable__toggle"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        onClick={onToggle}
      >
        <span className="ui-row__text">
          <span className="ui-expandable__title">{title}</span>
          {/* The spaces keep the parts apart in the button's accessible name. */}
          {detail === undefined ? null : (
            <>
              {' '}
              <span className="ui-expandable__detail">{detail}</span>
            </>
          )}
          {flag === undefined ? null : (
            <>
              {' '}
              <span className="ui-expandable__flag">{flag}</span>
            </>
          )}
        </span>
        <span className="ui-expandable__chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      {expanded ? (
        <div id={panelId} className="ui-expandable__panel" role="region" aria-label={title}>
          {children}
        </div>
      ) : null}
    </li>
  );
}
