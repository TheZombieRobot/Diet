import { useId, type ReactElement, type ReactNode, type Ref } from 'react';
import { ChevronIcon } from '../icons';

export interface ExpandableRowProps {
  title: string;
  /** A short line under the title, such as "Contains soy · Check the label for allergens". */
  detail?: string | undefined;
  /** An amber pill after the detail; its words say what it means, so colour is never the only signal. */
  flag?: string | undefined;
  /** Something at the right of the text, before the chevron, such as a source tag (item 23). */
  aside?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** The toggle button, for moving focus back to it when its panel closes (item 23). */
  toggleRef?: Ref<HTMLButtonElement> | undefined;
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
  aside,
  expanded,
  onToggle,
  toggleRef,
  children,
}: ExpandableRowProps): ReactElement {
  const panelId = useId();
  return (
    <li className="ui-expandable">
      <button
        ref={toggleRef}
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
        {aside === undefined || aside === null ? null : (
          <span className="ui-expandable__aside">{aside}</span>
        )}
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
