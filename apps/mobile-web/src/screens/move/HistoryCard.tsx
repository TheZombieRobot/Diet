import {
  type ExerciseData,
  fillTemplate,
  historyRows,
  type MoveContext,
  templateById,
} from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { Button, Card } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import { formatDayMonth } from '../../format';
import { movementLines } from './moveText';

const PAGE = 10;

/**
 * Recent sessions (EX-04; design section 1.13): the latest rows with work or a rest, newest
 * first, with what was ticked, the ratings and the note. Read-only; a rest reads as rested.
 */
export function HistoryCard({
  data,
  ctx,
}: {
  readonly data: ExerciseData;
  readonly ctx: MoveContext;
}): ReactElement {
  const [shown, setShown] = useState(PAGE);
  const rows = historyRows(ctx.sessions, ctx.today, shown + 1);
  const { history } = moveScreen;
  const rating = (n: number | null) => (n === null ? history.notRated : String(n));
  return (
    <Card label={history.title}>
      {rows.length === 0 ? <p className="ui-text-muted">{history.empty}</p> : null}
      <ul className="ui-rows">
        {rows.slice(0, shown).map((row) => {
          const state =
            row.status === 'rested' || row.status === 'skipped'
              ? move.rest.rested
              : row.status === 'planned' && row.date === ctx.today
                ? moveScreen.today.inProgress
                : move.week.dayDone;
          const name = templateById(data, row.templateId)?.name ?? moveScreen.today.unknownTemplate;
          return (
            <li key={row.id} className="ui-move-item" data-testid={`history-${row.id}`}>
              <p className="ui-text-strong">
                {[formatDayMonth(row.date), name, state].join(' · ')}
              </p>
              {movementLines(data, row).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {row.status === 'done' ? (
                <p className="ui-text-muted">
                  {fillTemplate(history.ratings, {
                    exertion: rating(row.exertion),
                    soreness: rating(row.soreness),
                    energy: rating(row.energy),
                  })}
                </p>
              ) : null}
              {row.note === null ? null : (
                <p className="ui-text-muted">{fillTemplate(history.note, { note: row.note })}</p>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > shown ? (
        <Button
          variant="quiet"
          onClick={() => {
            setShown((n) => n + PAGE);
          }}
        >
          {history.more}
        </Button>
      ) : null}
    </Card>
  );
}
