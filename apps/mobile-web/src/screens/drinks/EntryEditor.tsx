/**
 * Editing one logged drink (item 28 design 2.6; A21), from Logged today and from the Trends day
 * rows: how many, and the date and time in the entry's own zone, the zone its row shows the time
 * in, so a drink logged in Sydney is corrected in Sydney time and keeps its zone (the repository
 * keeps it). Only a changed date or time is sent, so editing the count alone never moves the drink;
 * a time still to come is refused. To change the drink itself, the owner deletes the entry and
 * logs it again. Save and Delete stay focusable while they write (aria-disabled).
 */
import {
  DEFAULT_HOME_TIME_ZONE,
  type DrinkLogRecord,
  localWallClockOf,
  resolveZone,
  type TimeZone,
} from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { Button, ButtonRow, TextField } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { WriteError } from '../today/WriteError';
import { useDrinksWrite } from './useDrinksWrite';
import { readCount, readEarlier, type WhenProblems } from './drinkForm';

const a = alcohol.log;

const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function EntryEditor({
  storage,
  entry,
  homeTimeZone,
  maxDate,
  onClose,
}: {
  readonly storage: AppStorage;
  readonly entry: DrinkLogRecord;
  /** settings.homeTimeZone, for an entry whose zone this device does not know (D6). */
  readonly homeTimeZone: TimeZone;
  readonly maxDate: string;
  readonly onClose: () => void;
}): ReactElement {
  const { env, repos } = storage;
  const zone = resolveZone(entry.timeZone, homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  const [initial] = useState(() => {
    const wall = localWallClockOf(entry.at, zone);
    return { count: String(entry.count), date: wall.date, time: clock(wall.minutes) };
  });
  const [draft, setDraft] = useState(initial);
  const [problems, setProblems] = useState<WhenProblems>({});
  const [confirming, setConfirming] = useState(false);
  const write = useDrinksWrite();

  const save = async (): Promise<void> => {
    const count = readCount(draft.count);
    const moved = draft.date !== initial.date || draft.time !== initial.time;
    const earlier = moved ? readEarlier(draft.date, draft.time, env, zone) : null;
    const found: WhenProblems = {};
    if (count === null) found.count = a.errors.count;
    if (earlier !== null && 'problem' in earlier) found.time = earlier.problem;
    setProblems(found);
    if (count === null || found.time !== undefined) return;
    const changes = earlier !== null && 'at' in earlier ? { count, at: earlier.at } : { count };
    if ((await write.run(() => repos.drinks.update(entry.id, changes))) !== null) onClose();
  };

  return (
    <div className="ui-subpanel">
      <TextField
        label={a.countLabel}
        inputMode="numeric"
        autoComplete="off"
        value={draft.count}
        error={problems.count}
        onChange={(event) => {
          setDraft({ ...draft, count: event.currentTarget.value });
        }}
      />
      <div className="ui-field-pair">
        <TextField
          label={a.dateLabel}
          type="date"
          autoComplete="off"
          max={maxDate}
          value={draft.date}
          onChange={(event) => {
            setDraft({ ...draft, date: event.currentTarget.value });
          }}
        />
        <TextField
          label={a.timeLabel}
          type="time"
          autoComplete="off"
          value={draft.time}
          error={problems.time}
          onChange={(event) => {
            setDraft({ ...draft, time: event.currentTarget.value });
          }}
        />
      </div>
      {confirming ? (
        <>
          <p>{a.deleteConfirm}</p>
          <ButtonRow>
            <Button
              variant="caution"
              aria-disabled={write.busy}
              onClick={() => {
                void write
                  .run(() => repos.drinks.remove(entry.id))
                  .then((done) => {
                    if (done !== null) onClose();
                  });
              }}
            >
              {a.delete}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setConfirming(false);
                write.clear();
              }}
            >
              {a.cancel}
            </Button>
          </ButtonRow>
        </>
      ) : (
        <ButtonRow>
          <Button variant="primary" aria-disabled={write.busy} onClick={() => void save()}>
            {a.save}
          </Button>
          <Button
            variant="caution"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {a.delete}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {a.cancel}
          </Button>
        </ButtonRow>
      )}
      <WriteError write={write} />
    </div>
  );
}
