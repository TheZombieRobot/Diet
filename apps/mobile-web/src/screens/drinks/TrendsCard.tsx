/**
 * Trends (UX 5b; item 28 design 2.8; C21, HS-19; A13 to A15, A29). The last 28 drinking days and
 * the last 8 Monday-start weeks, with a "Show as a list" alternative to the charts. Today and the
 * current week are drawn outlined, as not complete; a day not tracked has no bar; kcal bars count
 * only label energy. The 4-week average is a solid line, and a milestone the owner entered is a
 * dotted line labelled only "your milestone": the owner's own words for it are never drawn. No
 * guidance figure is ever drawn (the chart has no such input).
 */
import {
  type DailyPoint,
  type DrinkLogRecord,
  drinkingDayOfRow,
  fillTemplate,
  instantMs,
  isoWeekdayOf,
  type WeekPoint,
} from '@diet/core';
import { alcohol, privacy } from '@diet/core/copy/health';
import { BarChart, type BarChartBar, Button, Card, SegmentedControl } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatDayMonth, formatDayNumber, formatShortDate, formatStd2 } from '../../format';
import { drinksCount, energyText, entryText, freeDaysText } from './drinksText';
import { EntryEditor } from './EntryEditor';
import type { DrinksView } from './view';

const t = alcohol.trends;

type Metric = 'std' | 'drinks' | 'kcal';

const METRIC_LABEL: Readonly<Record<Metric, string>> = {
  std: t.metricStd,
  drinks: t.metricDrinks,
  kcal: t.metricKcal,
};

function dailyBar(point: DailyPoint, metric: Metric): BarChartBar {
  const tick = point.isToday
    ? t.todayTick
    : isoWeekdayOf(point.day) === 1
      ? formatDayNumber(point.day)
      : undefined;
  if (!point.tracked) return { key: point.day, value: null, tick };
  if (metric !== 'kcal') {
    return {
      key: point.day,
      value: metric === 'std' ? point.std : point.drinks,
      partial: point.isToday,
      tick,
    };
  }
  const { energy } = point;
  const value = energy.kind === 'known' || energy.kind === 'partial' ? energy.kcal : null;
  return { key: point.day, value, partial: point.isToday || energy.kind === 'partial', tick };
}

function dayValue(point: DailyPoint, metric: Metric): string {
  if (!point.tracked) return t.notTracked;
  if (point.drinks === 0) return t.noneLogged;
  if (metric === 'std') return fillTemplate(t.valueStd, { std: formatStd2(point.std) });
  if (metric === 'drinks') return drinksCount(point.drinks);
  return energyText(point.energy, true) ?? t.noneLogged;
}

function weekValue(week: WeekPoint): string {
  if (!week.tracked) return t.notTracked;
  const value =
    week.drinks === 0
      ? t.noneLogged
      : fillTemplate(t.weekValue, {
          drinks: drinksCount(week.drinks),
          std: formatStd2(week.std),
          energy: energyText(week.energy, true) ?? '',
        });
  return week.countedDays > 0
    ? fillTemplate(t.weekFree, { value, free: freeDaysText(week.alcoholFreeDays) })
    : value;
}

/** The entries of one drinking day, newest first, each with Edit (design 2.6). */
function DayEntries({
  storage,
  view,
  entries,
}: {
  readonly storage: AppStorage;
  readonly view: DrinksView;
  readonly entries: readonly DrinkLogRecord[];
}): ReactElement {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ul className="ui-drinks-entries">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div className="ui-drinks-entry">
            <span>{entryText(entry)}</span>
            <Button
              variant="quiet"
              aria-expanded={editing === entry.id}
              onClick={() => {
                setEditing((open) => (open === entry.id ? null : entry.id));
              }}
            >
              {alcohol.log.edit}
            </Button>
          </div>
          {editing === entry.id ? (
            <EntryEditor
              storage={storage}
              entry={entry}
              maxDate={view.noteToday}
              onClose={() => {
                setEditing(null);
              }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function TrendsCard({
  storage,
  view,
}: {
  readonly storage: AppStorage;
  readonly view: DrinksView;
}): ReactElement {
  const [metric, setMetric] = useState<Metric>('std');
  const [list, setList] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  if (view.drinks.length === 0) {
    return (
      <Card label={t.cardLabel}>
        <p>{t.empty}</p>
      </Card>
    );
  }
  const line = view.weekly.map((w) => w.rollingAverageStd);
  const reference = view.weekly.map((w) => w.milestone?.weeklyStdDrinks ?? null);
  const entriesOn = (day: string) =>
    view.drinks
      .filter((d) => drinkingDayOfRow(d, view.ctx).day === day)
      .sort((a, b) => instantMs(b.at) - instantMs(a.at));
  return (
    <Card label={t.cardLabel}>
      <h3 className="ui-text-strong">{t.dailyTitle}</h3>
      <SegmentedControl
        legend={t.metric}
        options={(['std', 'drinks', 'kcal'] as const).map((m) => ({
          value: m,
          label: METRIC_LABEL[m],
        }))}
        value={metric}
        onChange={setMetric}
      />
      <BarChart
        label={fillTemplate(t.dailyChart, { metric: METRIC_LABEL[metric] })}
        bars={view.daily.map((point) => dailyBar(point, metric))}
      />
      <p className="ui-text-muted">{metric === 'kcal' ? t.kcalNote : t.outlinedToday}</p>
      <Button
        variant="quiet"
        aria-expanded={list}
        onClick={() => {
          setList((open) => !open);
        }}
      >
        {list ? t.hideList : t.showList}
      </Button>
      {list ? (
        <ul className="ui-drinks-entries" data-testid="drinks-day-list">
          {[...view.daily].reverse().map((point) => {
            const text = fillTemplate(point.isToday ? t.dayToday : t.dayRow, {
              date: formatShortDate(point.day),
              value: dayValue(point, metric),
            });
            return (
              <li key={point.day}>
                {point.drinks > 0 ? (
                  <Button
                    variant="quiet"
                    className="ui-drinks-day"
                    aria-expanded={openDay === point.day}
                    onClick={() => {
                      setOpenDay((open) => (open === point.day ? null : point.day));
                    }}
                  >
                    {text}
                  </Button>
                ) : (
                  <span>{text}</span>
                )}
                {openDay === point.day ? (
                  <DayEntries storage={storage} view={view} entries={entriesOn(point.day)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {view.daily.some((p) => p.tracked) && view.todayTotals.zoneFallback ? (
        <p className="ui-text-muted">{privacy.zoneFallback}</p>
      ) : null}
      <h3 className="ui-text-strong">{t.weeklyTitle}</h3>
      <BarChart
        label={t.weeklyChart}
        bars={view.weekly.map((week) => ({
          key: week.weekStart,
          value: week.tracked ? week.std : null,
          partial: week.current,
          tick: week.current ? t.thisWeekTick : formatDayMonth(week.weekStart),
        }))}
        {...(line.some((v) => v !== null) ? { line, lineLabel: t.rollingLine } : {})}
        {...(reference.some((v) => v !== null)
          ? { reference, referenceLabel: t.milestoneLine }
          : {})}
      />
      <ul className="ui-plain-list" data-testid="drinks-week-list">
        {[...view.weekly].reverse().map((week) => (
          <li key={week.weekStart}>
            {week.current
              ? fillTemplate(t.weekRowCurrent, { value: weekValue(week) })
              : fillTemplate(t.weekRow, {
                  date: formatShortDate(week.weekStart),
                  value: weekValue(week),
                })}
          </li>
        ))}
      </ul>
      {line.every((v) => v === null) ? <p className="ui-text-muted">{t.rollingNote}</p> : null}
      <p className="ui-text-muted">{alcohol.summary.freeNote}</p>
    </Card>
  );
}
