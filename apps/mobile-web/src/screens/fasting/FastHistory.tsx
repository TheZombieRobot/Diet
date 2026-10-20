import {
  clockTimeFromMinutes,
  DEFAULT_HOME_TIME_ZONE,
  fillTemplate,
  formatElapsed,
  type Instant,
  localDateOf,
  localWallClockOf,
  parseClockTime,
  resolveZone,
  zonedWallTimeToInstant,
} from '@diet/core';
import { fasting, privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, TextField } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatShortDay } from '../../format';
import { deleteFast, editFast } from './actions';
import { ActionError, ProblemNotice } from './ActionError';
import { useAction } from './useAction';
import type { FastingState } from './useFasting';
import type { HistoryRow } from './view';

const history = fasting.history;

/** Rows shown at first, and added by each "Show more". */
const PAGE = 14;

interface Fields {
  readonly startDate: string;
  readonly startTime: string;
  readonly endDate: string;
  readonly endTime: string;
  readonly note: string;
}

const wallClock = (at: Instant, zone: string) => ({
  date: localDateOf(at, zone),
  time: clockTimeFromMinutes(localWallClockOf(at, zone).minutes),
});

/** One completed fast: its end day and actual length, never a planned length or a target (F18). */
function FastRow({
  storage,
  row,
  state,
}: {
  readonly storage: AppStorage;
  readonly row: HistoryRow;
  readonly state: FastingState;
}): ReactElement {
  const action = useAction();
  const { fast } = row;
  const home = resolveZone(state.inputs.settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  const startZone = resolveZone(fast.timeZone, home, DEFAULT_HOME_TIME_ZONE);
  const endZone = resolveZone(fast.endedTimeZone ?? fast.timeZone, home, DEFAULT_HOME_TIME_ZONE);
  const endedAt = fast.endedAt ?? fast.startedAt;
  const [editing, setEditing] = useState<Fields | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const initial = (): Fields => {
    const start = wallClock(fast.startedAt, startZone.timeZone);
    const end = wallClock(endedAt, endZone.timeZone);
    return {
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      note: fast.note ?? '',
    };
  };

  const save = () => {
    if (editing === null) return;
    const before = initial();
    // A field left as it was keeps the stored instant; a changed one is read in the device zone.
    const instant = (date: string, time: string, stored: Instant, same: boolean): number =>
      same
        ? Date.parse(stored)
        : zonedWallTimeToInstant(date, parseClockTime(time), state.deviceTimeZone);
    let startMs: number;
    let endMs: number;
    try {
      startMs = instant(
        editing.startDate,
        editing.startTime,
        fast.startedAt,
        editing.startDate === before.startDate && editing.startTime === before.startTime,
      );
      endMs = instant(
        editing.endDate,
        editing.endTime,
        endedAt,
        editing.endDate === before.endDate && editing.endTime === before.endTime,
      );
    } catch {
      setProblem(fasting.card.invalid);
      return;
    }
    if (startMs > state.nowMs || endMs > state.nowMs) {
      setProblem(history.future);
      return;
    }
    if (endMs <= startMs) {
      setProblem(history.endBeforeStart);
      return;
    }
    setProblem(null);
    void action
      .run(() =>
        editFast(storage, fast, {
          startedAt: startMs === Date.parse(fast.startedAt) ? fast.startedAt : iso(startMs),
          endedAt: endMs === Date.parse(endedAt) ? endedAt : iso(endMs),
          note: editing.note,
        }),
      )
      .then((done) => {
        if (done !== null) setEditing(null);
      });
  };

  const field = (key: keyof Fields, label: string, type: 'date' | 'time') =>
    editing === null ? null : (
      <TextField
        label={label}
        type={type}
        {...(type === 'time' ? { step: 60 } : {})}
        value={editing[key]}
        onChange={(event) => {
          setEditing({ ...editing, [key]: event.currentTarget.value });
        }}
      />
    );

  return (
    <li>
      <p>
        <span className="ui-text-strong">{formatShortDay(endedAt, endZone.timeZone)}</span>
        {' · '}
        {formatElapsed(row.lengthMs, 'text')}{' '}
        {row.over24 ? <span className="ui-pill">{history.over24}</span> : null}
      </p>
      {row.joined === null ? null : (
        <p className="ui-text-muted">
          {fillTemplate(history.joined, {
            gap: formatElapsed(row.joined.gapMs, 'text'),
            length: formatElapsed(row.joined.spanMs, 'text'),
          })}
        </p>
      )}
      {row.joinedFirst === null ? null : (
        <p className="ui-text-muted">
          {fillTemplate(history.joinedFirst, {
            length: formatElapsed(row.joinedFirst.spanMs, 'text'),
          })}
        </p>
      )}
      {startZone.fallback || endZone.fallback ? (
        <p className="ui-text-muted">{privacy.zoneFallback}</p>
      ) : null}
      {fast.note === null ? null : <p className="ui-text-muted">{fast.note}</p>}
      {editing === null && !confirming ? (
        <ButtonRow>
          <Button
            variant="quiet"
            onClick={() => {
              setEditing(initial());
            }}
          >
            {history.edit}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {history.delete}
          </Button>
        </ButtonRow>
      ) : null}
      {confirming ? (
        <>
          <p>{history.deleteConfirm}</p>
          <ButtonRow>
            <Button
              variant="caution"
              disabled={action.busy}
              onClick={() => {
                void action.run(() => deleteFast(storage, fast.id));
              }}
            >
              {history.deleteAction}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {history.cancel}
            </Button>
          </ButtonRow>
        </>
      ) : null}
      {editing === null ? null : (
        <>
          <div className="ui-field-pair">
            {field('startDate', history.startDate, 'date')}
            {field('startTime', history.startTime, 'time')}
          </div>
          <div className="ui-field-pair">
            {field('endDate', history.endDate, 'date')}
            {field('endTime', history.endTime, 'time')}
          </div>
          <TextField
            label={fasting.card.noteLabel}
            hint={fasting.card.noteHint}
            autoComplete="off"
            maxLength={500}
            value={editing.note}
            onChange={(event) => {
              setEditing({ ...editing, note: event.currentTarget.value });
            }}
          />
          <ProblemNotice problem={problem} />
          <ButtonRow>
            <Button variant="secondary" disabled={action.busy} onClick={save}>
              {history.save}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setEditing(null);
                setProblem(null);
              }}
            >
              {history.cancel}
            </Button>
          </ButtonRow>
        </>
      )}
      <ActionError action={action} />
    </li>
  );
}

const iso = (ms: number): Instant => new Date(ms).toISOString();

/**
 * History on the Fasting screen (item 15 design 3.8; FS-02, FS-07, C63): the streak from 2 days,
 * never a message about losing it; the completed fasts, newest first, with their actual lengths.
 */
export function FastHistory({
  storage,
  state,
}: {
  readonly storage: AppStorage;
  readonly state: FastingState;
}): ReactElement | null {
  const [shown, setShown] = useState(PAGE);
  const { view } = state;
  if (view.kind !== 'open') return null;
  const { streakDays, rows } = view.history;
  return (
    <Card label={history.label}>
      {streakDays >= 2 ? <p>{fillTemplate(history.streak, { days: streakDays })}</p> : null}
      {rows.length === 0 ? (
        <p className="ui-text-muted">{history.empty}</p>
      ) : (
        <ul className="ui-plain-list">
          {rows.slice(0, shown).map((row) => (
            <FastRow key={row.fast.id} storage={storage} row={row} state={state} />
          ))}
        </ul>
      )}
      {rows.length > shown ? (
        <Button
          variant="quiet"
          onClick={() => {
            setShown((n) => n + PAGE);
          }}
        >
          {history.showMore}
        </Button>
      ) : null}
    </Card>
  );
}
