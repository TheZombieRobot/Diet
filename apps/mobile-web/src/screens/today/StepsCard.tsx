import { fillTemplate, type LocalDate, parseStepCount, type StepsRecord } from '@diet/core';
import { today as copy } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, TextField } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatLocalTime, formatSteps } from '../../format';
import { useTodayWrite } from './useWrite';
import { WriteError } from './WriteError';

const steps = copy.steps;

/**
 * Steps typed in by hand (UX_SCREENS section 2, card 5; design section 1.7). "Same as yesterday"
 * shows only while today has no entry, so it never overwrites one (T9). The editor is a form, so
 * the keyboard's Done saves; while it is open the card has the full width (T25). No steps goal or
 * target is shown. Focus goes to Edit after a save, and to Enter steps after a removal, once the
 * stored row has come back.
 */
export function StepsCard({
  storage,
  date,
  todayRow,
  repeat,
  editing,
  onEditing,
}: {
  readonly storage: AppStorage;
  readonly date: LocalDate;
  readonly todayRow: StepsRecord | null;
  readonly repeat: number | null;
  readonly editing: boolean;
  readonly onEditing: (editing: boolean) => void;
}): ReactElement {
  const write = useTodayWrite();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  /** The button to focus once it is on screen (after the write has come back). */
  const focusNext = useRef<'edit' | 'enter' | null>(null);
  /**
   * The date "Same as yesterday" was saved for, until the stored row comes back: a second tap in
   * between would try to add the same day again and fail, next to a count that was saved.
   */
  const [repeatSavedFor, setRepeatSavedFor] = useState<LocalDate | null>(null);
  if (repeatSavedFor !== null && todayRow !== null) setRepeatSavedFor(null);
  const repeatWaiting = write.busy || repeatSavedFor === date;

  useEffect(() => {
    const target = focusNext.current === 'edit' ? editRef.current : enterRef.current;
    if (focusNext.current === null || target === null) return;
    focusNext.current = null;
    target.focus();
  });
  useEffect(() => {
    if (editing) fieldRef.current?.focus();
  }, [editing]);

  const close = (focus: 'edit' | 'enter') => {
    focusNext.current = focus;
    setProblem(null);
    onEditing(false);
  };
  const open = () => {
    setText(todayRow === null ? '' : String(todayRow.steps));
    setProblem(null);
    onEditing(true);
  };
  const save = () => {
    const parsed = parseStepCount(text);
    if (!parsed.ok) {
      setProblem(steps.errors[parsed.reason]);
      fieldRef.current?.focus();
      return;
    }
    void write
      .run(() =>
        todayRow === null
          ? storage.repos.steps.create({ date, steps: parsed.steps, source: 'manual' })
          : storage.repos.steps.update(date, { steps: parsed.steps }),
      )
      .then((done) => {
        if (done !== null) close('edit');
      });
  };
  const remove = () => {
    void write
      .run(() => storage.repos.steps.remove(date))
      .then((done) => {
        if (done !== null) close('enter');
      });
  };
  const sameAsYesterday = (count: number) => {
    if (repeatSavedFor === date) return;
    void write
      .run(() => storage.repos.steps.create({ date, steps: count, source: 'manual' }))
      .then((done) => {
        if (done === null) return;
        focusNext.current = 'edit';
        setRepeatSavedFor(date);
      });
  };

  const figure =
    todayRow === null ? (
      <p className="ui-stat__value ui-stat__value--empty" data-testid="steps-today">
        {steps.none}
      </p>
    ) : (
      <>
        <p className="ui-stat__value ui-stat__value--large" data-testid="steps-today">
          {formatSteps(todayRow.steps)}
        </p>
        <p className="ui-stat__caption">
          {fillTemplate(steps.enteredAt, {
            time: formatLocalTime(todayRow.updatedAt, storage.env.timeZone()),
          })}
        </p>
      </>
    );

  if (editing) {
    return (
      <Card label={copy.cards.steps}>
        {figure}
        <form
          className="ui-card__body"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <TextField
            ref={fieldRef}
            label={steps.field}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            value={text}
            error={problem ?? undefined}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
          />
          <ButtonRow stacked>
            <Button type="submit" variant="primary" aria-disabled={write.busy}>
              {steps.save}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                close(todayRow === null ? 'enter' : 'edit');
              }}
            >
              {steps.cancel}
            </Button>
            {todayRow === null ? null : (
              <Button variant="quiet" aria-disabled={write.busy} onClick={remove}>
                {steps.remove}
              </Button>
            )}
          </ButtonRow>
          <WriteError write={write} />
        </form>
      </Card>
    );
  }

  return (
    <Card label={copy.cards.steps}>
      {figure}
      {todayRow === null && repeat !== null ? (
        <Button
          variant="quiet"
          block
          aria-disabled={repeatWaiting}
          onClick={() => {
            sameAsYesterday(repeat);
          }}
        >
          {fillTemplate(steps.sameAsYesterday, { steps: formatSteps(repeat) })}
        </Button>
      ) : null}
      {todayRow === null ? (
        <Button ref={enterRef} variant="secondary" block onClick={open}>
          {steps.enter}
        </Button>
      ) : (
        <Button ref={editRef} variant="secondary" block onClick={open}>
          {steps.edit}
        </Button>
      )}
      <WriteError write={write} />
    </Card>
  );
}
