import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';

export interface TickRowProps {
  /** The item's name, the row's main text. */
  name: string;
  /** Right-aligned beside the name, such as "1 bunch". */
  amount?: string | null | undefined;
  checked?: boolean | undefined;
  /** With it the row has a real checkbox covering the label; without it, plain text. */
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  disabled?: boolean | undefined;
  /** Strikes the name through (a ticked line), as well as the box's mark. */
  struck?: boolean | undefined;
  /** Small detail lines under the name. */
  details?: ReactNode;
  /** A small decorative icon before the first detail line, such as item 19's leaf. */
  leaf?: ReactNode;
  /** One-tap questions under the details. */
  offers?: ReactNode;
  /** A button on the row's own line, outside the label (Options). */
  trailing?: ReactNode;
  /** A failure under the row. */
  error?: ReactNode;
  /** An open panel under the row. */
  children?: ReactNode;
}

/**
 * One grocery line (item 24 design 1.14): a tick box and the item with its amount on one line,
 * the whole label at least 48 px high and a tap target, with the box only over the label (the
 * label is positioned), so a tap on the Options button beside it never ticks the line.
 */
export function TickRow({
  name,
  amount = null,
  checked = false,
  onCheckedChange,
  disabled = false,
  struck = false,
  details,
  leaf,
  offers,
  trailing,
  error,
  children,
}: TickRowProps): ReactElement {
  const texts = (
    <>
      <span className="ui-tick-row__name">{name}</span>
      {/* A space between the two, so the box's name reads "Broccoli 1 head". */}
      {amount === null ? null : (
        <>
          {' '}
          <span className="ui-tick-row__amount">{amount}</span>
        </>
      )}
    </>
  );
  return (
    <li className={classNames('ui-tick-row', struck && 'ui-tick-row--struck')}>
      <div className="ui-tick-row__head">
        {onCheckedChange === undefined ? (
          <div className="ui-tick-row__text">{texts}</div>
        ) : (
          <label className="ui-tick-row__tick">
            <input
              type="checkbox"
              className="ui-check__input"
              checked={checked}
              disabled={disabled}
              onChange={(event) => {
                onCheckedChange(event.currentTarget.checked);
              }}
            />
            <span className="ui-check__mark" aria-hidden="true" />
            {texts}
          </label>
        )}
        {trailing}
      </div>
      {details === undefined || details === null ? null : (
        <div className="ui-tick-row__details">
          {leaf === undefined ? null : (
            <span className="ui-tick-row__leaf" aria-hidden="true">
              {leaf}
            </span>
          )}
          <div>{details}</div>
        </div>
      )}
      {offers}
      {error}
      {children}
    </li>
  );
}
