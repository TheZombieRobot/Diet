import {
  type DayState,
  equipmentKey,
  type ExerciseData,
  fillTemplate,
  isoWeekdayOf,
  joinList,
  type MoveContext,
  weekFooter,
} from '@diet/core';
import { move, moveScreen, today as todayCopy } from '@diet/core/copy/health';
import { ActionRow, Card, ChevronIcon, Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatWeekdayLong, formatWeekdayShort } from '../../format';
import { routeHref } from '../../routes';
import { dayChipText, daySentence, headlineText, templatesOf } from './moveText';
import { TodayItems } from './TodayItems';

/**
 * The week strip (UX 4a; EX-05, EX-08): seven read-only days, Monday first. On Move each day shows
 * its state; on Today only the plan, with no done or not-done marks, so the first screen of the day
 * never reads as a habit tracker (N10). A past day with nothing logged keeps an outline and says
 * "Not done. Rest counts too." to screen readers: never red, crossed or counted.
 */
export function WeekStrip({
  data,
  ctx,
  mode,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly mode: 'states' | 'plan';
}): ReactElement {
  return (
    <ol className="ui-week" aria-label={move.week.title} data-testid="week-strip">
      {ctx.days.map((day) => {
        const shown: DayState =
          mode === 'states' ? day.state : day.templateIds.length === 0 ? 'rest-day' : 'planned';
        const rows = ctx.sessions.filter((s) => s.date === day.date);
        const ids =
          shown === 'done' && rows.length > 0
            ? [...new Set(rows.map((r) => r.templateId))]
            : day.templateIds;
        const strength = templatesOf(data, ids).some((t) => t.kind === 'strength');
        const resting = shown === 'rest-day' || shown === 'rested';
        const chipClass = [
          'ui-week__chip',
          resting
            ? 'ui-week__chip--rest'
            : shown === 'not-done'
              ? 'ui-week__chip--outline'
              : strength
                ? 'ui-week__chip--strength'
                : 'ui-week__chip--beach',
          shown === 'done' ? 'ui-week__chip--done' : null,
        ]
          .filter((c) => c !== null)
          .join(' ');
        const isToday = day.date === ctx.today;
        const shownAsWalk = ctx.jogAsWalkDays.includes(isoWeekdayOf(day.date));
        return (
          <li
            key={day.date}
            className="ui-week__item"
            data-testid={`week-day-${day.date}`}
            data-state={shown}
            aria-current={isToday ? 'date' : undefined}
          >
            <span className="ui-week__day" aria-hidden="true">
              {formatWeekdayShort(day.date)}
            </span>
            <span className={chipClass} aria-hidden="true">
              {dayChipText(data, day, shown, rows).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
            <span className="ui-visually-hidden">
              {daySentence(data, { date: day.date, templateIds: ids }, shown, isToday, shownAsWalk)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * This week (UX 2 card 6, 4a; design section 1.4): one card on Move and on Today. The equipment
 * as the mock-up's aside, the fallback when the stored plan breaks the rules, today's headline
 * and sessions, the strip, and the footer lines ending "Rest and recovery count as success.".
 */
export function MoveWeekCard({
  data,
  ctx,
  storage,
  place,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
  readonly storage: AppStorage;
  readonly place: 'move' | 'today';
}): ReactElement {
  const footer = weekFooter(data, ctx.week, ctx.equipment);
  const onMove = place === 'move';
  const fallback = ctx.week.source === 'default-fallback';
  return (
    <Card
      label={onMove ? move.week.title : todayCopy.cards.movement}
      aside={
        <span className="ui-card__aside-text">{move.equipment[equipmentKey(ctx.equipment)]}</span>
      }
    >
      {fallback && onMove ? (
        <Notice tone="info">
          <p>{move.week.fallback}</p>
          <ul className="ui-plain-list">
            {ctx.week.problems.map((code) => (
              <li key={code}>{move.week.problems[code]}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {fallback && !onMove ? (
        <p className="ui-text-muted">{moveScreen.week.fallbackToday}</p>
      ) : null}
      {onMove && ctx.jogAsWalkDays.length > 0 ? (
        <p className="ui-text-muted">
          {fillTemplate(moveScreen.week.jogAsWalkDays, {
            days: joinList(
              ctx.jogAsWalkDays.map((weekday) => {
                const date = ctx.days[weekday - 1]?.date;
                return date === undefined ? '' : formatWeekdayLong(date);
              }),
              moveScreen.listComma,
              moveScreen.listAnd,
            ),
          })}
        </p>
      ) : null}
      <p className="ui-text-lead">{headlineText(data, ctx)}</p>
      <TodayItems data={data} ctx={ctx} storage={storage} links="push" />
      <WeekStrip data={data} ctx={ctx} mode={onMove ? 'states' : 'plan'} />
      {footer.strength === null ? null : (
        <p className="ui-text-muted">{fillTemplate(move.week.stripStrength, footer.strength)}</p>
      )}
      {footer.walk ? <p className="ui-text-muted">{move.week.stripWalk}</p> : null}
      {footer.jog ? <p className="ui-text-muted">{move.week.stripJog}</p> : null}
      <p className="ui-text-muted">{move.rest.general}</p>
      {onMove ? (
        <ActionRow
          href={routeHref('move-plan')}
          title={move.week.edit}
          detail={moveScreen.week.planRow}
          badge={<ChevronIcon />}
        />
      ) : (
        <p>
          <a className="ui-button ui-button--quiet" href={routeHref('move')}>
            {moveScreen.seeWeek}
          </a>
        </p>
      )}
    </Card>
  );
}
