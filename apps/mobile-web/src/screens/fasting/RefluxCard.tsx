import {
  clockTimeFromMinutes,
  DEFAULT_HOME_TIME_ZONE,
  fillTemplate,
  formatClockRange,
  formatClockTime,
  localDateOf,
  localWallClockOf,
  parseClockTime,
  resolveZone,
  type SymptomRecord,
  zonedWallTimeToInstant,
} from '@diet/core';
import { fasting, privacy, reflux } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, ChoiceList, Notice, Switch, TextField } from '@diet/ui';
import { type ReactElement, type Ref, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatLocalTime, formatShortDay } from '../../format';
import {
  clearDayWindow,
  deleteSymptom,
  dismissNudge,
  logSymptom,
  noteValue,
  setDayWindows,
  setRefluxPreference,
  updateSymptom,
} from './actions';
import { HelpRows } from './HelpRows';
import { ActionError } from './ActionError';
import { useAction } from './useAction';
import type { FastingState } from './useFasting';
import type { RefluxOptionsView } from './view';

const SYMPTOMS: readonly SymptomRecord['symptom'][] = ['heartburn', 'night-cough', 'regurgitation'];
const SEVERITIES = ['1', '2', '3'] as const;
const NOT_RATED = 'none';

/** The rating's word, or null when it is not rated. */
function severityText(severity: number | null): string | null {
  const key = SEVERITIES.find((s) => Number(s) === severity);
  return key === undefined ? null : reflux.severity[key];
}

/**
 * The earlier-dinner and split-meal options for the upcoming date (C47, C104; FL-11, FL-15). On
 * Today they are compact (no "why"), and only after a symptom. When the date already has its own
 * change, only that line and its Undo show, if the per-day limit allows the Undo. With
 * `snackOffered`, the meal check above already has "Add 5 pm snack" for the date, so the split
 * line has no button of its own.
 */
export function RefluxOptions({
  storage,
  options,
  compact,
  snackOffered = false,
}: {
  readonly storage: AppStorage;
  readonly options: RefluxOptionsView;
  readonly compact: boolean;
  readonly snackOffered?: boolean | undefined;
}): ReactElement {
  const action = useAction();
  const copy = reflux.options;
  const { day, earlier, split, changed } = options;
  // "Eat 1 hour earlier" moves the date's window, and may open the next day's earlier (C30).
  const moved = earlier?.changes[0]?.window ?? null;
  const nextDay = earlier?.changes[1]?.window ?? null;
  const write = (changes: Parameters<typeof setDayWindows>[1]) => {
    void action.run(() => setDayWindows(storage, changes));
  };
  return (
    <div data-testid="reflux-options">
      <p className="ui-text-strong">{copy.title[day]}</p>
      {compact ? null : <p>{copy.why}</p>}
      {changed !== null ? (
        <>
          <p>
            {fillTemplate(copy.changed[day], {
              range: formatClockRange(changed.window.start, changed.window.end),
            })}
          </p>
          {changed.undoAllowed ? (
            <Button
              variant="quiet"
              disabled={action.busy}
              onClick={() => {
                void action.run(() => clearDayWindow(storage, options.date));
              }}
            >
              {copy.undo}
            </Button>
          ) : (
            <p className="ui-text-muted">{copy.keepsFastShort}</p>
          )}
        </>
      ) : (
        <>
          {earlier === null || moved === null ? null : (
            <>
              <p>
                {fillTemplate(copy.earlier, { range: formatClockRange(moved.start, moved.end) })}
                {nextDay === null
                  ? null
                  : ` ${fillTemplate(copy.earlierNextDay, { time: formatClockTime(nextDay.start) })}`}
              </p>
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() => {
                  write(earlier.changes);
                }}
              >
                {copy.earlierAction}
              </Button>
            </>
          )}
          {split === 'already' ? <p>{copy.splitAlready}</p> : null}
          {split !== null && split !== 'already' ? (
            <>
              <p>{copy.split}</p>
              {snackOffered ? null : (
                <Button
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    write(split.changes);
                  }}
                >
                  {copy.splitAction}
                </Button>
              )}
            </>
          ) : null}
        </>
      )}
      <ActionError action={action} />
    </div>
  );
}

/** The symptom just logged on this screen: rate it, add a note, or undo it. */
function LoggedSymptom({
  storage,
  row,
  onDone,
}: {
  readonly storage: AppStorage;
  readonly row: SymptomRecord;
  readonly onDone: () => void;
}): ReactElement {
  const action = useAction();
  const [note, setNote] = useState<string | null>(null);
  return (
    <Notice tone="info" role="status">
      <p>
        {fillTemplate(reflux.logged, {
          symptom: reflux.symptoms[row.symptom],
          time: formatLocalTime(row.at, row.timeZone),
        })}
      </p>
      <p>{reflux.severityQuestion}</p>
      <ButtonRow>
        {SEVERITIES.map((value) => (
          <Button
            key={value}
            variant="secondary"
            aria-pressed={row.severity === Number(value)}
            disabled={action.busy}
            onClick={() => {
              void action.run(() => updateSymptom(storage, row.id, { severity: Number(value) }));
            }}
          >
            {reflux.severity[value]}
          </Button>
        ))}
      </ButtonRow>
      {note === null ? (
        <ButtonRow>
          <Button
            variant="quiet"
            onClick={() => {
              setNote(row.note ?? '');
            }}
          >
            {reflux.addNote}
          </Button>
          <Button
            variant="quiet"
            disabled={action.busy}
            onClick={() => {
              void action
                .run(() => deleteSymptom(storage, row.id))
                .then((done) => {
                  if (done !== null) onDone();
                });
            }}
          >
            {reflux.undo}
          </Button>
        </ButtonRow>
      ) : (
        <>
          <TextField
            label={reflux.noteLabel}
            hint={reflux.noteHint}
            autoComplete="off"
            maxLength={280}
            value={note}
            onChange={(event) => {
              setNote(event.currentTarget.value);
            }}
          />
          <ButtonRow>
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() => {
                void action
                  .run(() => updateSymptom(storage, row.id, { note: noteValue(note) }))
                  .then((done) => {
                    if (done !== null) setNote(null);
                  });
              }}
            >
              {reflux.save}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setNote(null);
              }}
            >
              {reflux.cancel}
            </Button>
          </ButtonRow>
        </>
      )}
      <ActionError action={action} />
    </Notice>
  );
}

/** A symptom's date and time in a zone, for the edit fields. */
function wallClock(row: SymptomRecord, zone: string): { date: string; time: string } {
  return {
    date: localDateOf(row.at, zone),
    time: clockTimeFromMinutes(localWallClockOf(row.at, zone).minutes),
  };
}

/** One row of the last 14 days, with Edit and Delete. */
function SymptomRow({
  storage,
  row,
  state,
}: {
  readonly storage: AppStorage;
  readonly row: SymptomRecord;
  readonly state: FastingState;
}): ReactElement {
  const action = useAction();
  const home = resolveZone(state.inputs.settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  const zone = resolveZone(row.timeZone, home, DEFAULT_HOME_TIME_ZONE);
  const [editing, setEditing] = useState<{
    date: string;
    time: string;
    symptom: SymptomRecord['symptom'];
    severity: string;
    note: string;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const severity = severityText(row.severity);
  const values = {
    day: formatShortDay(row.at, zone.timeZone),
    time: formatLocalTime(row.at, zone.timeZone),
    symptom: reflux.symptoms[row.symptom],
  };

  const save = () => {
    if (editing === null) return;
    const before = wallClock(row, zone.timeZone);
    const moved = editing.date !== before.date || editing.time !== before.time;
    let at: number | null = null;
    if (moved) {
      try {
        at = zonedWallTimeToInstant(
          editing.date,
          parseClockTime(editing.time),
          state.deviceTimeZone,
        );
      } catch {
        setProblem(fasting.card.invalid);
        return;
      }
      if (at > state.nowMs) {
        setProblem(reflux.future);
        return;
      }
    }
    setProblem(null);
    void action
      .run(() =>
        updateSymptom(storage, row.id, {
          ...(at === null
            ? {}
            : { at: new Date(at).toISOString(), timeZone: state.deviceTimeZone }),
          symptom: editing.symptom,
          severity: editing.severity === NOT_RATED ? null : Number(editing.severity),
          note: noteValue(editing.note),
        }),
      )
      .then((done) => {
        if (done !== null) setEditing(null);
      });
  };

  return (
    <li>
      <p>
        {severity === null
          ? fillTemplate(reflux.recentRowUnrated, values)
          : fillTemplate(reflux.recentRow, { ...values, severity })}
      </p>
      {zone.fallback ? <p className="ui-text-muted">{privacy.zoneFallback}</p> : null}
      {row.note === null ? null : <p className="ui-text-muted">{row.note}</p>}
      {editing === null && !confirming ? (
        <ButtonRow>
          <Button
            variant="quiet"
            onClick={() => {
              setEditing({
                ...wallClock(row, zone.timeZone),
                symptom: row.symptom,
                severity: row.severity === null ? NOT_RATED : String(row.severity),
                note: row.note ?? '',
              });
            }}
          >
            {reflux.edit}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {reflux.delete}
          </Button>
        </ButtonRow>
      ) : null}
      {confirming ? (
        <>
          <p>{reflux.deleteConfirm}</p>
          <ButtonRow>
            <Button
              variant="caution"
              disabled={action.busy}
              onClick={() => {
                void action.run(() => deleteSymptom(storage, row.id));
              }}
            >
              {reflux.delete}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {reflux.cancel}
            </Button>
          </ButtonRow>
        </>
      ) : null}
      {editing === null ? null : (
        <>
          <div className="ui-field-pair">
            <TextField
              label={reflux.dateLabel}
              type="date"
              value={editing.date}
              onChange={(event) => {
                setEditing({ ...editing, date: event.currentTarget.value });
              }}
            />
            <TextField
              label={reflux.timeLabel}
              type="time"
              step={60}
              value={editing.time}
              onChange={(event) => {
                setEditing({ ...editing, time: event.currentTarget.value });
              }}
            />
          </div>
          <ChoiceList
            legend={reflux.symptomLabel}
            name={`symptom-${row.id}`}
            options={SYMPTOMS.map((s) => ({ value: s, label: reflux.symptoms[s] }))}
            value={editing.symptom}
            onChange={(value) => {
              const symptom = SYMPTOMS.find((s) => s === value);
              if (symptom !== undefined) setEditing({ ...editing, symptom });
            }}
          />
          <ChoiceList
            legend={reflux.severityLabel}
            name={`severity-${row.id}`}
            options={[
              { value: NOT_RATED, label: reflux.notRated },
              ...SEVERITIES.map((value) => ({ value, label: reflux.severity[value] })),
            ]}
            value={editing.severity}
            onChange={(value) => {
              setEditing({ ...editing, severity: value });
            }}
          />
          <TextField
            label={reflux.noteLabel}
            hint={reflux.noteHint}
            autoComplete="off"
            maxLength={280}
            value={editing.note}
            onChange={(event) => {
              setEditing({ ...editing, note: event.currentTarget.value });
            }}
          />
          {problem === null ? null : (
            <Notice role="alert">
              <p>{problem}</p>
            </Notice>
          )}
          <ButtonRow>
            <Button variant="secondary" disabled={action.busy} onClick={save}>
              {reflux.save}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setEditing(null);
                setProblem(null);
              }}
            >
              {reflux.cancel}
            </Button>
          </ButtonRow>
        </>
      )}
      <ActionError action={action} />
    </li>
  );
}

/**
 * The Reflux card on the Fasting screen (item 15 design 3.6; HEALTH_SAFETY.md section 3; C47,
 * C104; FL-11, FL-15, FL-16): one-tap symptom buttons, the chest-pain line with 111 and
 * Healthline, the GP lines, the GP nudge, the options and the two switches (only while fasting is
 * open), and the last 14 days. While fasting is switched off the log, the help and the GP lines
 * stay; nothing is deleted.
 */
export function RefluxCard({
  storage,
  state,
  containerRef,
}: {
  readonly storage: AppStorage;
  readonly state: FastingState;
  readonly containerRef?: Ref<HTMLDivElement> | undefined;
}): ReactElement {
  const { view } = state;
  const { reflux: refluxView } = view;
  const log = useAction();
  const nudgeAction = useAction();
  const switchAction = useAction();
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const logged = state.inputs.symptoms.find((s) => s.id === loggedId) ?? null;
  const { nudge } = refluxView;
  const open = view.kind === 'open';

  return (
    <div ref={containerRef}>
      <Card label={reflux.label}>
        <p>{reflux.intro}</p>
        {SYMPTOMS.map((symptom) => (
          <Button
            key={symptom}
            variant="secondary"
            block
            disabled={log.busy}
            onClick={() => {
              void log
                .run(() => logSymptom(storage, symptom))
                .then((done) => {
                  if (done !== null) setLoggedId(done.value.id);
                });
            }}
          >
            {reflux.symptoms[symptom]}
          </Button>
        ))}
        <ActionError action={log} />
        {logged === null ? null : (
          <LoggedSymptom
            key={logged.id}
            storage={storage}
            row={logged}
            onDone={() => {
              setLoggedId(null);
            }}
          />
        )}
        <p className="ui-text-strong">{reflux.chestPain}</p>
        <HelpRows />
        <p className="ui-text-strong">{reflux.gpLine}</p>
        <p className="ui-text-muted">{reflux.noDiagnosis}</p>
        {nudge.visible ? (
          <Notice role="status">
            {nudge.days >= 3 ? (
              <p>{fillTemplate(reflux.nudge.days, { days: nudge.days })}</p>
            ) : null}
            {nudge.stronger ? <p>{reflux.nudge.stronger}</p> : null}
            <p>{reflux.nudge.action}</p>
            <Button
              variant="quiet"
              disabled={nudgeAction.busy}
              onClick={() => {
                void nudgeAction.run(() => dismissNudge(storage));
              }}
            >
              {reflux.nudge.notNow}
            </Button>
            <ActionError action={nudgeAction} />
          </Notice>
        ) : null}
        {open && refluxView.options !== null ? (
          <RefluxOptions storage={storage} options={refluxView.options} compact={false} />
        ) : null}
        {open ? (
          <>
            <Switch
              label={reflux.options.preferEarlier}
              checked={refluxView.preferEarlier}
              disabled={switchAction.busy}
              onChange={(on) => {
                void switchAction.run(() =>
                  setRefluxPreference(storage, 'refluxPreferEarlier', on),
                );
              }}
            />
            <Switch
              label={reflux.options.preferSplit}
              checked={refluxView.preferSplit}
              disabled={switchAction.busy}
              onChange={(on) => {
                void switchAction.run(() => setRefluxPreference(storage, 'refluxPreferSplit', on));
              }}
            />
            <ActionError action={switchAction} />
          </>
        ) : null}
        <p className="ui-text-strong">{reflux.recentTitle}</p>
        {refluxView.recent.length === 0 ? (
          <p className="ui-text-muted">{reflux.none}</p>
        ) : (
          <ul className="ui-plain-list">
            {refluxView.recent.map((row) => (
              <SymptomRow key={row.id} storage={storage} row={row} state={state} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
