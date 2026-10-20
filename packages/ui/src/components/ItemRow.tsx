import type { ReactElement, ReactNode, Ref } from 'react';
import { classNames } from '../classNames';

export interface ItemRowProps {
  /** A Thumbnail at the left (garden rows). */
  thumbnail?: ReactNode;
  title: string;
  /** The amount, at the right of the title. */
  value?: string | undefined;
  /** A line under the title, such as "Ready to use · 4 days left". */
  detail?: string | undefined;
  /** amber: a calm note that needs a look (past the keep days), never red. */
  detailTone?: 'plain' | 'amber';
  /** A muted line under the detail. */
  note?: string | null | undefined;
  /** Whether the row's panel is open (aria-expanded). */
  expanded: boolean;
  onToggle: () => void;
  /** A control beside the row button, never inside it (the garden row's Ready switch). */
  trailing?: ReactNode;
  /** The row button, for moving focus back to it when its panel closes. */
  buttonRef?: Ref<HTMLButtonElement> | undefined;
  /** The open panel, under the row. */
  children?: ReactNode;
}

/**
 * A list row that opens a panel in place (item 19; mock-up List): a button holding the thumbnail,
 * the name, the amount at the right, a detail line and a note, with an optional control beside it,
 * and the open panel under it. Use inside a `ul.ui-item-list`.
 */
export function ItemRow({
  thumbnail,
  title,
  value,
  detail,
  detailTone = 'plain',
  note,
  expanded,
  onToggle,
  trailing,
  buttonRef,
  children,
}: ItemRowProps): ReactElement {
  return (
    <li className="ui-item-row">
      <div className="ui-item-row__main">
        <button
          ref={buttonRef}
          type="button"
          className="ui-item-row__button"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {thumbnail}
          <span className="ui-item-row__text">
            <span className="ui-item-row__head">
              <span className="ui-item-row__title">{title}</span>
              {/* The spaces keep the parts apart in the button's accessible name. */}
              {value === undefined ? null : (
                <>
                  {' '}
                  <span className="ui-item-row__value">{value}</span>
                </>
              )}
            </span>
            {detail === undefined ? null : (
              <>
                {' '}
                <span
                  className={classNames(
                    'ui-item-row__detail',
                    detailTone === 'amber' && 'ui-text-amber',
                  )}
                >
                  {detail}
                </span>
              </>
            )}
            {note === undefined || note === null ? null : (
              <>
                {' '}
                <span className="ui-item-row__note">{note}</span>
              </>
            )}
          </span>
        </button>
        {trailing === undefined ? null : <div className="ui-item-row__trailing">{trailing}</div>}
      </div>
      {children}
    </li>
  );
}
