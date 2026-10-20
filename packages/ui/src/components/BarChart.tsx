import type { ReactElement } from 'react';

export interface BarChartBar {
  readonly key: string;
  /** null: no bar (a day not tracked, or no known figure). */
  readonly value: number | null;
  /** Drawn outlined: not complete (today so far, or some figures unknown). */
  readonly partial?: boolean | undefined;
  /** The label under the bar, if any ("21", "Today"). */
  readonly tick?: string | undefined;
}

export interface BarChartProps {
  /** The chart's accessible summary; the drawing itself is hidden from screen readers. */
  label: string;
  bars: readonly BarChartBar[];
  /** A solid line, one value per bar (the 4-week average). */
  line?: readonly (number | null)[] | undefined;
  lineLabel?: string | undefined;
  /** A dotted line, one value per bar (the owner's milestone). */
  reference?: readonly (number | null)[] | undefined;
  referenceLabel?: string | undefined;
  /** Drawing height in CSS pixels at a 320 px width. */
  height?: number | undefined;
}

const WIDTH = 320;
const GRIDLINES = 3;

/**
 * Bars in the neutral colour (drinks figures), never teal, amber or red: a total is never drawn as
 * a success, a warning or an alarm. There is no target, limit or guidance line: the component has
 * no such input, so a guidance figure can never be drawn on it (A13). Labels and the key are HTML
 * under the drawing; screen readers get `label`, and screens offer the figures as a list too.
 */
export function BarChart({
  label,
  bars,
  line,
  lineLabel,
  reference,
  referenceLabel,
  height = 160,
}: BarChartProps): ReactElement {
  const values = [...bars.map((b) => b.value), ...(line ?? []), ...(reference ?? [])].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  const max = Math.max(1, 1.1 * Math.max(0, ...values));
  const slot = WIDTH / Math.max(1, bars.length);
  const barWidth = slot * 0.62;
  const y = (v: number) => height - (Math.max(0, v) / max) * height;
  const centre = (i: number) => slot * i + slot / 2;

  // The line is broken where a value is missing.
  const lineRuns: string[] = [];
  let run: string[] = [];
  (line ?? []).forEach((v, i) => {
    if (v === null) {
      if (run.length > 0) lineRuns.push(run.join(' '));
      run = [];
    } else run.push(`${centre(i)},${y(v)}`);
  });
  if (run.length > 0) lineRuns.push(run.join(' '));

  return (
    <div className="ui-bar-chart">
      <div role="img" aria-label={label} className="ui-bar-chart__plot">
        <svg
          className="ui-bar-chart__svg"
          viewBox={`0 0 ${WIDTH} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          {Array.from({ length: GRIDLINES }, (_, i) => {
            const gy = height - ((i + 1) / GRIDLINES) * height;
            return (
              <line key={i} className="ui-bar-chart__grid" x1={0} x2={WIDTH} y1={gy} y2={gy} />
            );
          })}
          {bars.map((bar, i) =>
            bar.value === null ? null : (
              <rect
                key={bar.key}
                data-bar={bar.key}
                className={
                  bar.partial === true
                    ? 'ui-bar-chart__bar ui-bar-chart__bar--partial'
                    : 'ui-bar-chart__bar'
                }
                x={centre(i) - barWidth / 2}
                y={y(bar.value)}
                width={barWidth}
                height={Math.max(0, height - y(bar.value))}
                rx={2}
              />
            ),
          )}
          {lineRuns.map((points) => (
            <polyline key={points} className="ui-bar-chart__line" points={points} />
          ))}
          {(reference ?? []).map((v, i) =>
            v === null ? null : (
              <line
                key={i}
                className="ui-bar-chart__reference"
                x1={slot * i + 3}
                x2={slot * (i + 1) - 3}
                y1={y(v)}
                y2={y(v)}
                strokeDasharray="0 6"
                strokeLinecap="round"
              />
            ),
          )}
        </svg>
      </div>
      <div
        className="ui-bar-chart__ticks"
        style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {bars.map((bar) => (
          <span key={bar.key} className="ui-bar-chart__tick">
            {bar.tick ?? ''}
          </span>
        ))}
      </div>
      {line === undefined && reference === undefined ? null : (
        <ul className="ui-bar-chart__legend">
          {line === undefined ? null : (
            <li className="ui-bar-chart__key">
              <span
                className="ui-bar-chart__swatch ui-bar-chart__swatch--line"
                aria-hidden="true"
              />
              {lineLabel}
            </li>
          )}
          {reference === undefined ? null : (
            <li className="ui-bar-chart__key">
              <span
                className="ui-bar-chart__swatch ui-bar-chart__swatch--reference"
                aria-hidden="true"
              />
              {referenceLabel}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
