import type { ReactElement, ReactNode } from 'react';
import { ChevronIcon } from '../icons';

/** A list of link rows with a divider between them, as on the approved List board. */
export function LinkList({ children }: { children: ReactNode }): ReactElement {
  return <ul className="ui-link-list">{children}</ul>;
}

export interface LinkRowProps {
  href: string;
  title: string;
  /** A small line above the title, such as "Day 1". */
  overline?: string | undefined;
  /** A line under the title, such as "Serves 4 · About 45 min". */
  detail?: string | undefined;
  /** Chips under the detail; their words carry the meaning, so colour is never the only signal. */
  chips?: ReactNode;
  /** The row is today (item 22's week): aria-current="date" and a stronger overline. */
  current?: boolean | undefined;
}

/**
 * A whole-row link at least 64 px high (item 20: a recipe on the Recipes list), named by its
 * text, with a chevron that is decorative.
 */
export function LinkRow({
  href,
  title,
  overline,
  detail,
  chips,
  current = false,
}: LinkRowProps): ReactElement {
  return (
    <li>
      <a
        className={current ? 'ui-link-row ui-link-row--current' : 'ui-link-row'}
        href={href}
        aria-current={current ? 'date' : undefined}
      >
        <span className="ui-link-row__text">
          {overline === undefined ? null : (
            <>
              <span className="ui-link-row__overline">{overline}</span>{' '}
            </>
          )}
          <span className="ui-link-row__title">{title}</span>
          {/* The spaces keep the parts apart in the link's accessible name. */}
          {detail === undefined ? null : (
            <>
              {' '}
              <span className="ui-link-row__detail">{detail}</span>
            </>
          )}
          {chips === undefined || chips === null ? null : (
            <>
              {' '}
              <span className="ui-chip-row">{chips}</span>
            </>
          )}
        </span>
        <span className="ui-link-row__chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </a>
    </li>
  );
}
