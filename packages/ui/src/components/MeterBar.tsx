import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';
import { meterRects } from './meterRects';

export type MeterTone = 'ink' | 'teal' | 'soft' | 'alcohol';

export interface MeterSegment {
  /** The share of the track this part fills, 0 to 1 (clamped). */
  readonly fraction: number;
  readonly tone: MeterTone;
}

export interface MeterBarProps {
  /** "Energy". */
  label: string;
  /** "8,900 of 9,240 kJ", already filled from the copy. */
  value: string;
  /** The bar's parts, left to right; null draws no bar (no target, or figures shown plain). */
  segments: readonly MeterSegment[] | null;
  /** 'over' fills a soft part amber. Ignored when there is no bar. */
  state?: 'normal' | 'within' | 'over' | 'incomplete';
  size?: 'full' | 'half';
  /** Small lines under the bar. */
  notes?: readonly string[];
}

/**
 * A labelled figure with an optional bar (the Nutrition today card). The label and the value are
 * ordinary text, so screen readers read "Energy 8,900 of 9,240 kJ"; the bar is decorative and
 * drawn with SVG width attributes (no style attributes, for the page's style-src policy). A state
 * changes only a colour; the value text already says the amount, so colour is never the only
 * signal (WCAG 1.4.1; HS-09).
 */
export function MeterBar({
  label,
  value,
  segments,
  state = 'normal',
  size = 'full',
  notes = [],
}: MeterBarProps): ReactElement {
  return (
    <div
      className={classNames('ui-meter', `ui-meter--${size}`)}
      data-state={segments === null ? undefined : state}
    >
      <div className="ui-meter__head">
        <span className="ui-meter__label">{label}</span>{' '}
        <span className="ui-meter__value">{value}</span>
      </div>
      {segments === null ? null : (
        <svg
          className="ui-meter__track"
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {meterRects(segments).map((rect, i) => (
            <rect
              key={i}
              className={`ui-meter__fill ui-meter__fill--${rect.tone}`}
              x={rect.x}
              y={0}
              width={rect.width}
              height={10}
            />
          ))}
        </svg>
      )}
      {notes.map((note) => (
        <p key={note} className="ui-meter__note">
          {note}
        </p>
      ))}
    </div>
  );
}

/** Two meters side by side, dropping to one column only on a narrow content box. */
export function MeterPair({ children }: { children: ReactNode }): ReactElement {
  return <div className="ui-meter-pair">{children}</div>;
}
