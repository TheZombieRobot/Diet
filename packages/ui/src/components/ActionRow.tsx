import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';

export interface ActionRowProps {
  /** A link row. Without `href` the row is a button: `onSelect` runs it, or with neither it is off. */
  href?: string;
  /** Runs the row's action in place, for an action that is not a screen of its own. */
  onSelect?: () => void;
  title: string;
  detail?: string;
  /** A small icon or short text in a rounded square at the left. Decorative. */
  badge?: ReactNode;
  /** emergency: red, only for emergency instructions such as calling 111. */
  tone?: 'default' | 'emergency';
  /** A short visible marker on an off row ("Later", "Off"), hidden from assistive tech. */
  marker?: string;
  /** The id of the text that says why an off row does nothing (aria-describedby). */
  describedBy?: string;
}

/** A phone number in a row: digit groups joined by single spaces, such as "0800 611 116". */
const PHONE_NUMBER = /\d+(?: \d+)+/g;

/**
 * The text with each phone number in a span that never breaks across lines, so a number is never
 * split however narrow the row (re-check V20); the words around it wrap as usual.
 */
function wholeNumbers(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(PHONE_NUMBER)) {
    if (match.index > from) parts.push(text.slice(from, match.index));
    parts.push(
      <span key={match.index} className="ui-action-row__number">
        {match[0]}
      </span>,
    );
    from = match.index + match[0].length;
  }
  if (parts.length === 0) return text;
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

/**
 * A full-width row at least 64 px high, such as a help number to call. An off row (no `href`, no
 * `onSelect`) stays focusable at full contrast with a dashed border and does nothing: it is an
 * aria-disabled button that says why through `describedBy`, never a faded or hidden one.
 */
export function ActionRow({
  href,
  onSelect,
  title,
  detail,
  badge,
  tone = 'default',
  marker,
  describedBy,
}: ActionRowProps): ReactElement {
  const content = (
    <>
      {badge === undefined ? null : (
        <span className="ui-action-row__badge" aria-hidden="true">
          {badge}
        </span>
      )}
      <span className="ui-action-row__text">
        <span className="ui-action-row__title">{wholeNumbers(title)}</span>
        {/* The space keeps the title and detail apart in the link's accessible name. */}
        {detail === undefined ? null : (
          <>
            {' '}
            <span className="ui-action-row__detail">{wholeNumbers(detail)}</span>
          </>
        )}
      </span>
      {marker === undefined ? null : (
        <span className="ui-pill ui-action-row__marker" aria-hidden="true">
          {marker}
        </span>
      )}
    </>
  );
  const className = classNames('ui-action-row', tone === 'emergency' && 'ui-action-row--emergency');
  if (href !== undefined) {
    return (
      <a className={className} href={href} aria-describedby={describedBy}>
        {content}
      </a>
    );
  }
  if (onSelect !== undefined) {
    return (
      <button
        type="button"
        className={classNames(className, 'ui-action-row--button')}
        aria-describedby={describedBy}
        onClick={onSelect}
      >
        {content}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={classNames(className, 'ui-action-row--button', 'ui-action-row--off')}
      aria-disabled="true"
      aria-describedby={describedBy}
    >
      {content}
    </button>
  );
}
