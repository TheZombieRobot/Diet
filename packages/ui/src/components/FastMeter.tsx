import type { ReactElement } from 'react';
import { classNames } from '../classNames';

export interface FastMeterProps {
  /** How far through the 24-hour bar the fast is, 0 to 100. */
  progressPct: number;
  /** The planned eating window's place on the bar, in percent, or null. */
  window: { startPct: number; widthPct: number } | null;
  /** Past 24 hours: the whole bar turns amber (never red). */
  over: boolean;
}

const pct = (value: number): string => `${String(Math.min(100, Math.max(0, value)))}%`;

/**
 * The Fast card's bar (mock-up Main): 24 hours from the start of the fast, teal progress from the
 * left and the amber eating window at its place. Decorative: the text beside it carries the meaning.
 */
export function FastMeter({ progressPct, window, over }: FastMeterProps): ReactElement {
  return (
    <div className={classNames('ui-fast-meter', over && 'ui-fast-meter--over')} aria-hidden="true">
      <div className="ui-fast-meter__fill" style={{ width: pct(over ? 100 : progressPct) }} />
      {window === null || over ? null : (
        <div
          className="ui-fast-meter__window"
          style={{ left: pct(window.startPct), width: pct(window.widthPct) }}
        />
      )}
    </div>
  );
}
