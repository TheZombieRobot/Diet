import type { ReactElement, ReactNode } from 'react';

/** The smallest vertical span, in the values' unit (kg), so a small change never looks dramatic (W20). */
export const CHART_MIN_SPAN_KG = 2;

const WIDTH = 320;
const HEIGHT = 104;
/** Room above and below the values, in the values' unit. */
const PADDING = 0.5;

export interface TrendChartProps {
  /** Number of x positions (28 for four weeks, 30, 90). */
  readonly days: number;
  /** Daily mean weigh-ins, drawn as dots. */
  readonly points: readonly { readonly index: number; readonly value: number }[];
  /** 7-day averages, drawn as one line through the available indexes. */
  readonly line: readonly { readonly index: number; readonly value: number }[];
  /** The shaded range, or null. Drawn as one filled path, never stroked. */
  readonly band:
    readonly { readonly index: number; readonly low: number; readonly high: number }[] | null;
  readonly todayIndex: number | null;
  /** From health.ts; never a weight, a date or a target. */
  readonly ariaLabel: string;
  /** HTML labels under the chart, e.g. Week 1 … Week 4 (never inside the SVG). */
  readonly xLabels?: readonly string[];
  readonly legend?: ReactNode;
}

const fixed = (n: number) => n.toFixed(2);

/**
 * The weight chart (UX_SCREENS section 2, card 1; HS-26, W20). A line of 7-day averages over dots
 * for the weigh-ins, an optional shaded range and today's point, on quarter grid lines. Nothing
 * else: no text, title, axis value, goal or target line inside the SVG, so the only figures a
 * person reads are the labelled ones beside it. Higher weight is drawn higher.
 */
export function TrendChart({
  days,
  points,
  line,
  band,
  todayIndex,
  ariaLabel,
  xLabels,
  legend,
}: TrendChartProps): ReactElement {
  const values = [
    ...points.map((p) => p.value),
    ...line.map((p) => p.value),
    ...(band ?? []).flatMap((b) => [b.low, b.high]),
  ];
  let top = values.length === 0 ? 1 : Math.max(...values) + PADDING;
  let bottom = values.length === 0 ? 0 : Math.min(...values) - PADDING;
  if (top - bottom < CHART_MIN_SPAN_KG) {
    const middle = (top + bottom) / 2;
    top = middle + CHART_MIN_SPAN_KG / 2;
    bottom = middle - CHART_MIN_SPAN_KG / 2;
  }
  const x = (index: number) => ((index + 0.5) * WIDTH) / Math.max(1, days);
  const y = (value: number) => ((top - value) / (top - bottom)) * HEIGHT;
  const linePath = line
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${fixed(x(p.index))} ${fixed(y(p.value))}`)
    .join(' ');
  const bandPath =
    band === null || band.length === 0
      ? null
      : [
          ...band.map((b, i) => `${i === 0 ? 'M' : 'L'}${fixed(x(b.index))} ${fixed(y(b.high))}`),
          ...[...band].reverse().map((b) => `L${fixed(x(b.index))} ${fixed(y(b.low))}`),
          'Z',
        ].join(' ');
  const today = todayIndex === null ? undefined : line.find((p) => p.index === todayIndex);
  const todayValue = today?.value ?? points.find((p) => p.index === todayIndex)?.value;

  return (
    <figure className="ui-trend-chart">
      <svg
        className="ui-trend-chart__svg"
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        preserveAspectRatio="none"
      >
        {[1, 2, 3].map((q) => (
          <line
            key={q}
            className="ui-trend-chart__grid"
            x1={(WIDTH * q) / 4}
            x2={(WIDTH * q) / 4}
            y1={0}
            y2={HEIGHT}
          />
        ))}
        {bandPath === null ? null : (
          <path className="ui-trend-chart__band" stroke="none" d={bandPath} />
        )}
        {points.map((p) => (
          <circle
            key={p.index}
            className="ui-trend-chart__dot"
            cx={fixed(x(p.index))}
            cy={fixed(y(p.value))}
            r={2.5}
          />
        ))}
        {linePath === '' ? null : <path className="ui-trend-chart__line" d={linePath} />}
        {todayIndex === null || todayValue === undefined ? null : (
          <>
            <circle
              className="ui-trend-chart__halo"
              cx={fixed(x(todayIndex))}
              cy={fixed(y(todayValue))}
              r={9}
            />
            <circle
              className="ui-trend-chart__today"
              cx={fixed(x(todayIndex))}
              cy={fixed(y(todayValue))}
              r={5}
            />
          </>
        )}
      </svg>
      {xLabels === undefined ? null : (
        <div className="ui-trend-chart__labels">
          {xLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
      {legend === undefined ? null : (
        <figcaption className="ui-trend-chart__legend">{legend}</figcaption>
      )}
    </figure>
  );
}
