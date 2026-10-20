import { fillTemplate, longChart, roundTo, type WeeklyChange } from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, TrendChart } from '@diet/ui';
import { useId, useState, type ReactElement } from 'react';
import { formatKg } from '../../format';
import { EmptyValue, FourWeekChartView, KgValue, Stat } from './parts';
import type { WeightView } from './useWeightView';

type ChartView = 'four-weeks' | 30 | 90;

/** "Down 0.8 kg a week", "Up …", "About level", or not enough weigh-ins: plain ink, no colour for direction (W25). */
function changeText(change: WeeklyChange | null): string {
  if (change === null) return weight.trend.notEnough;
  if (change.direction === 'level') return weight.trend.level;
  const kg = formatKg(roundTo(change.kgPerWeek, 1));
  return fillTemplate(change.direction === 'down' ? weight.trend.down : weight.trend.up, { kg });
}

/**
 * The Trend card on the Weight screen (item 14 design section 2.6.2): the 7- and 14-day averages,
 * the weekly change, and the chart over 4 weeks (with the shaded typical range and week labels),
 * 30 days or 90 days (line and dots only).
 */
export function TrendCard({ view }: { view: WeightView }): ReactElement {
  const { overview, input } = view;
  const [shown, setShown] = useState<ChartView>('four-weeks');
  const ids = { seven: useId(), fourteen: useId(), change: useId() };
  const long = shown === 'four-weeks' ? null : longChart(input, shown);
  const { chart } = overview;
  const views: readonly [ChartView, string][] = [
    ['four-weeks', weight.chart.fourWeeks],
    [30, weight.chart.days30],
    [90, weight.chart.days90],
  ];
  return (
    <Card label={weight.trend.label}>
      <div className="ui-stats">
        <Stat id={ids.seven} label={weight.card.average7}>
          {overview.average7Kg === null ? (
            <EmptyValue>{weight.card.needsShort}</EmptyValue>
          ) : (
            <KgValue kg={overview.average7Kg} />
          )}
        </Stat>
        <Stat id={ids.fourteen} label={weight.card.average14}>
          {overview.average14Kg === null ? (
            <EmptyValue>{weight.card.needsShort}</EmptyValue>
          ) : (
            <KgValue kg={overview.average14Kg} />
          )}
        </Stat>
        <Stat id={ids.change} label={weight.trend.weeklyChange}>
          <span
            className={
              overview.weeklyChange === null
                ? 'ui-stat__value ui-stat__value--empty'
                : 'ui-stat__value ui-stat__value--text'
            }
          >
            {changeText(overview.weeklyChange)}
          </span>
        </Stat>
      </div>
      {overview.average7Kg === null ? <p className="ui-text-muted">{weight.card.needs7}</p> : null}
      {overview.average14Kg === null ? (
        <p className="ui-text-muted">{weight.card.needs14}</p>
      ) : null}
      {overview.weeklyChange === null ? (
        <p className="ui-text-muted">{weight.trend.needsWeekly}</p>
      ) : null}
      <div role="group" aria-label={weight.chart.viewsLabel}>
        <ButtonRow>
          {views.map(([id, label]) => (
            <Button
              key={String(id)}
              variant="secondary"
              aria-pressed={shown === id}
              onClick={() => {
                setShown(id);
              }}
            >
              {label}
            </Button>
          ))}
        </ButtonRow>
      </div>
      {long === null ? (
        <FourWeekChartView chart={chart} />
      ) : (
        <>
          <TrendChart
            days={shown === 'four-weeks' ? 28 : shown}
            points={long.points.map((p) => ({ index: p.index, value: p.kg }))}
            line={long.line.map((p) => ({ index: p.index, value: p.kg }))}
            band={null}
            todayIndex={long.todayIndex}
            ariaLabel={fillTemplate(weight.chart.ariaLong, {
              days: shown === 'four-weeks' ? 28 : shown,
            })}
          />
          <p className="ui-text-muted">{weight.chart.trendLine}</p>
        </>
      )}
      <p className="ui-text-muted">{weight.chart.lineLegend}</p>
      {long === null && chart.band === null && chart.bandHiddenBecause === 'no-anchor' ? (
        <p className="ui-text-muted">{weight.chart.noAnchor}</p>
      ) : null}
    </Card>
  );
}
