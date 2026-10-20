import {
  addDays,
  DEFAULT_HOME_TIME_ZONE,
  fillTemplate,
  isClockTime,
  isLocalDate,
  localDateOf,
  localWallClockOf,
  parseClockTime,
  parseInstant,
  parseWeightInput,
  resolveZone,
  type WeightRecord,
  zonedWallTimeToInstant,
} from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, TextField } from '@diet/ui';
import { useId, useState, type ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatKg, formatLocalDate, formatLocalTime } from '../../format';
import { writeWeighIn } from '../../onboarding/actions';
import { WriteFailure } from './parts';
import type { WeightStatusMessage } from './stores';
import type { WeightView } from './useWeightView';
import { weightWriteMessage } from './writeErrors';

/** Weigh-ins shown at first, and added by each "Show older", in local days. */
const PAGE_DAYS = 30;

/** "HH:MM" of a minutes-after-midnight count. */
const clockTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * One weigh-in in its own recorded zone (resolved), with Edit and Delete, each described by the
 * row's own line so a screen reader tells the rows apart. An edit sends a new time only when the
 * date or time was changed, and then always with the record's own stored zone, so a kg-only or
 * note-only edit never moves the record to the device zone (W6; storage spec 3.1).
 */
function WeighInRow({
  storage,
  row,
  home,
}: {
  storage: AppStorage;
  row: WeightRecord;
  home: string;
}): ReactElement {
  const zone = resolveZone(row.timeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone;
  const clock = localWallClockOf(row.at, zone);
  const original = { date: clock.date, time: clockTime(clock.minutes) };
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [kg, setKg] = useState(formatKg(row.kg));
  const [note, setNote] = useState(row.note ?? '');
  const [when, setWhen] = useState(original);
  const [error, setError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<WeightStatusMessage | null>(null);
  const lineId = useId();

  const saveEdit = () => {
    const parsed = parseWeightInput(kg);
    if (!parsed.ok) {
      setError(
        parsed.reason === 'not-a-number' ? weight.entry.notANumber : weight.entry.outOfRange,
      );
      return;
    }
    const timeChanged = when.date !== original.date || when.time !== original.time;
    let at: string | undefined;
    if (timeChanged) {
      const ms = zonedWallTimeToInstant(when.date, parseClockTime(when.time), zone);
      if (ms > parseInstant(storage.env.now())) {
        setError(weight.entry.future);
        return;
      }
      at = new Date(ms).toISOString();
    }
    setFailure(null);
    writeWeighIn(storage, () =>
      storage.repos.weights.update(row.id, {
        kg: parsed.kg,
        note: note.trim() === '' ? null : note,
        ...(at === undefined ? {} : { at, timeZone: row.timeZone }),
      }),
    ).then(
      () => {
        setEditing(false);
      },
      (failed: unknown) => {
        setFailure(weightWriteMessage(failed, 'entry'));
      },
    );
  };

  const remove = () => {
    setFailure(null);
    writeWeighIn(storage, () => storage.repos.weights.remove(row.id)).catch((failed: unknown) => {
      setFailure(weightWriteMessage(failed, 'delete'));
    });
  };

  const whenValid = isLocalDate(when.date) && isClockTime(when.time);
  return (
    <li data-weigh-in-row="" className="ui-card__body">
      <p id={lineId}>
        {fillTemplate(weight.list.row, {
          date: formatLocalDate(row.at, zone),
          time: formatLocalTime(row.at, zone),
          kg: formatKg(row.kg),
        })}
        {row.source === 'onboarding' ? (
          <>
            {' '}
            <span className="ui-pill">{weight.list.firstWeight}</span>
          </>
        ) : null}
      </p>
      {row.note === null ? null : <p className="ui-text-muted">{row.note}</p>}
      {editing ? (
        <>
          <TextField
            label={weight.entry.fieldLabel}
            inputMode="decimal"
            autoComplete="off"
            error={error}
            value={kg}
            onChange={(event) => {
              setKg(event.currentTarget.value);
              setError(undefined);
            }}
          />
          <TextField
            label={weight.entry.dateLabel}
            type="date"
            value={when.date}
            onChange={(event) => {
              setWhen({ ...when, date: event.currentTarget.value });
            }}
          />
          <TextField
            label={weight.entry.timeLabel}
            type="time"
            value={when.time}
            onChange={(event) => {
              setWhen({ ...when, time: event.currentTarget.value });
            }}
          />
          <TextField
            label={weight.entry.noteLabel}
            autoComplete="off"
            maxLength={280}
            value={note}
            onChange={(event) => {
              setNote(event.currentTarget.value);
            }}
          />
          <ButtonRow>
            <Button variant="primary" disabled={!whenValid} onClick={saveEdit}>
              {weight.list.saveChanges}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setEditing(false);
              }}
            >
              {weight.list.cancel}
            </Button>
          </ButtonRow>
        </>
      ) : deleting ? (
        <>
          <p>{weight.list.deleteConfirm}</p>
          <ButtonRow>
            <Button variant="caution" onClick={remove}>
              {weight.list.deleteYes}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setDeleting(false);
              }}
            >
              {weight.list.cancel}
            </Button>
          </ButtonRow>
        </>
      ) : (
        <ButtonRow>
          <Button
            aria-describedby={lineId}
            onClick={() => {
              setKg(formatKg(row.kg));
              setNote(row.note ?? '');
              setWhen(original);
              setEditing(true);
            }}
          >
            {weight.list.edit}
          </Button>
          <Button
            variant="quiet"
            aria-describedby={lineId}
            onClick={() => {
              setDeleting(true);
            }}
          >
            {weight.list.delete}
          </Button>
        </ButtonRow>
      )}
      <div role="alert" className="ui-status-line">
        {failure === null ? null : <WriteFailure storage={storage} message={failure} />}
      </div>
    </li>
  );
}

/** The weigh-ins, newest first: the last 30 local days, then 30 more at a time (item 14 design section 2.6.3). */
export function WeighInsCard({
  storage,
  view,
}: {
  storage: AppStorage;
  view: WeightView;
}): ReactElement {
  const { inputs, overview } = view;
  const home = inputs.settings.homeTimeZone;
  const [days, setDays] = useState(PAGE_DAYS);
  const dated = inputs.weights
    .map((row) => ({
      row,
      date: localDateOf(row.at, resolveZone(row.timeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone),
    }))
    .sort((a, b) => parseInstant(b.row.at) - parseInstant(a.row.at));
  const from = addDays(overview.today, -(days - 1));
  const shown = dated.filter((d) => d.date >= from);
  return (
    <Card label={weight.list.label}>
      {dated.length === 0 ? (
        <p>{weight.list.empty}</p>
      ) : (
        <ul className="ui-action-list">
          {shown.map(({ row }) => (
            <WeighInRow key={row.id} storage={storage} row={row} home={home} />
          ))}
        </ul>
      )}
      {shown.length < dated.length ? (
        <Button
          variant="quiet"
          onClick={() => {
            setDays(days + PAGE_DAYS);
          }}
        >
          {weight.list.showOlder}
        </Button>
      ) : null}
    </Card>
  );
}
