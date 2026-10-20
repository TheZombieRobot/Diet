/**
 * How you felt: the next-day note (HEALTH_SAFETY.md section 5; UX 5c; item 28 design 2.10; AL-08,
 * C05; A24). One note per calendar date, today or earlier. A ticked note brings up the help card's
 * text and help rows under the form, and the Talk to someone card at the top of the screen (its
 * withdrawal-tick trigger). Saving with neither text nor tick removes the note.
 */
import { type AlcoholDayNoteRecord, fillTemplate, isLocalDate } from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, Checkbox, TextArea, TextField } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatShortDate } from '../../format';
import { NoticeHelpRows } from '../../onboarding/NoticeHelpRows';
import { WriteError } from '../today/WriteError';
import { useDrinksWrite } from './useDrinksWrite';
import { type DrinksView, recentNotes } from './view';

const d = alcohol.dayNote;

/** The longest note the store keeps (alcohol_day_notes.note). */
const NOTE_MAX = 1000;
const PREVIEW = 80;

interface Draft {
  readonly date: string;
  readonly note: string;
  readonly tick: boolean;
}

const draftOf = (date: string, stored: AlcoholDayNoteRecord | undefined): Draft => ({
  date,
  note: stored?.note ?? '',
  tick: stored?.withdrawalTick ?? false,
});

export function DayNoteCard({
  storage,
  view,
}: {
  readonly storage: AppStorage;
  readonly view: DrinksView;
}): ReactElement {
  const { repos } = storage;
  const write = useDrinksWrite();
  const [date, setDate] = useState(view.noteToday);
  const [edited, setEdited] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const stored = view.notes.find((n) => n.date === date);
  const draft = edited !== null && edited.date === date ? edited : draftOf(date, stored);
  const recent = recentNotes(view);

  const open = (next: string): void => {
    setDate(next);
    setEdited(null);
    setProblem(null);
    setStatus('');
  };

  const save = async (): Promise<void> => {
    const note = draft.note.trim();
    if (!isLocalDate(date) || date > view.noteToday) {
      setProblem(d.errors.future);
      return;
    }
    if (note.length > NOTE_MAX) {
      setProblem(d.errors.long);
      return;
    }
    if (note === '' && !draft.tick && stored === undefined) {
      setProblem(d.errors.empty);
      return;
    }
    setProblem(null);
    const fields = { note: note === '' ? null : note, withdrawalTick: draft.tick };
    const remove = note === '' && !draft.tick;
    const done = await write.run<unknown>(() =>
      remove
        ? repos.alcoholDayNotes.remove(date)
        : stored === undefined
          ? repos.alcoholDayNotes.create({ date, ...fields })
          : repos.alcoholDayNotes.update(date, fields),
    );
    if (done === null) return;
    setEdited(null);
    setStatus(remove ? d.removed : d.saved);
  };

  return (
    <Card label={d.cardLabel}>
      <p>{d.intro}</p>
      <TextField
        label={d.dayLabel}
        type="date"
        autoComplete="off"
        max={view.noteToday}
        value={date}
        error={problem === d.errors.future ? problem : undefined}
        onChange={(event) => {
          open(event.currentTarget.value);
        }}
      />
      <TextArea
        label={d.noteLabel}
        autoComplete="off"
        value={draft.note}
        error={problem === d.errors.long ? problem : undefined}
        onChange={(event) => {
          setEdited({ ...draft, note: event.currentTarget.value });
        }}
      />
      <Checkbox
        label={d.withdrawalTick}
        checked={draft.tick}
        onChange={(tick) => {
          setEdited({ ...draft, tick });
        }}
      />
      {problem === d.errors.empty ? (
        <p className="ui-field__error" role="alert">
          {problem}
        </p>
      ) : null}
      <ButtonRow>
        <Button variant="primary" disabled={write.busy} onClick={() => void save()}>
          {d.save}
        </Button>
        {stored === undefined ? null : (
          <Button
            variant="quiet"
            disabled={write.busy}
            onClick={() => {
              void write
                .run(() => repos.alcoholDayNotes.remove(date))
                .then((done) => {
                  if (done === null) return;
                  setEdited(null);
                  setStatus(d.removed);
                });
            }}
          >
            {d.remove}
          </Button>
        )}
      </ButtonRow>
      <p role="status" className="ui-status-line">
        {status}
      </p>
      <WriteError write={write} />
      {stored?.withdrawalTick === true ? (
        <div data-testid="day-note-help">
          <p>{alcohol.helpCard}</p>
          <NoticeHelpRows />
        </div>
      ) : null}
      {recent.length === 0 ? null : (
        <>
          <h3 className="ui-text-strong">{d.recentTitle}</h3>
          <ul className="ui-action-list">
            {recent.map((note) => (
              <li key={note.date}>
                <Button
                  block
                  className="ui-drinks-day"
                  aria-label={fillTemplate(d.open, { date: formatShortDate(note.date) })}
                  onClick={() => {
                    open(note.date);
                  }}
                >
                  {[
                    formatShortDate(note.date),
                    note.note === null ? null : note.note.slice(0, PREVIEW),
                    note.withdrawalTick ? d.ticked : null,
                  ]
                    .filter((part): part is string => part !== null)
                    .join(' · ')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
