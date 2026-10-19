import type { ReactElement } from 'react';

export interface DayBarProps {
  /** The eating part of the day, in percent: one segment, or two across midnight. */
  segments: readonly { readonly startPct: number; readonly widthPct: number }[];
  /** Times under the bar, evenly spaced from the left end to the right end. */
  labels: readonly string[];
}

/**
 * A 24-hour bar with the eating window drawn on it (mock-up Schedule). Decorative: the same
 * window is always written out in words next to it.
 */
export function DayBar({ segments, labels }: DayBarProps): ReactElement {
  return (
    <div className="ui-daybar" aria-hidden="true">
      <div className="ui-daybar__track">
        {segments.map((segment) => (
          <span
            key={segment.startPct}
            className="ui-daybar__segment"
            // Set through the CSSOM, which the page's Content Security Policy allows.
            style={{ left: `${segment.startPct}%`, width: `${segment.widthPct}%` }}
          />
        ))}
      </div>
      <div className="ui-daybar__labels">
        {labels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
