import { type ExerciseData, finishPatch, type FinishValues, type SessionRecord } from '@diet/core';
import { move, moveScreen } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, TextField } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { RatingGroups } from './RatingGroups';
import { MoveWriteRefused, moveSaveMessage, writeSession } from './sessionWrites';
import { ratingsNote } from './moveText';

const valuesOf = (row: SessionRecord): FinishValues => ({
  exertion: row.exertion,
  soreness: row.soreness,
  energy: row.energy,
  note: row.note ?? '',
});

/**
 * "How did it go?" (UX 4c; EX-04; design section 1.10): effort, soreness and energy, each
 * optional, and a note, kept on the screen until Save. Save stores status done (the repository
 * stamps the time) through item 26's write check, so a row with no check is never finished. In
 * 'log', a session with nothing ticked can also be turned into a rest, and "Back to the session"
 * returns to the sets; in 'done' (today's checked session) the same card changes what was saved.
 */
export function FinishCard({
  data,
  storage,
  row,
  mode,
  saved,
  onSaved,
  onEdited,
  onBack,
  onRest,
  restDisabled = false,
}: {
  readonly data: ExerciseData;
  readonly storage: AppStorage;
  readonly row: SessionRecord;
  readonly mode: 'log' | 'finish-only' | 'done';
  /** "Saved." shows until the next change. */
  readonly saved: boolean;
  readonly onSaved: () => void;
  readonly onEdited: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly onRest?: (() => void) | undefined;
  readonly restDisabled?: boolean | undefined;
}): ReactElement {
  const [values, setValues] = useState<FinishValues>(() => valuesOf(row));
  const save = useSave(moveSaveMessage);
  const note = ratingsNote(data, row.templateId);
  const ticked = row.movements.some((m) => m.done.length > 0);
  const { finish } = moveScreen;
  return (
    <Card label={move.finish.title}>
      <RatingGroups
        rowId={row.id}
        values={values}
        disabled={save.busy}
        onRate={(field, value) => {
          setValues((v) => ({ ...v, [field]: value }));
          onEdited();
        }}
      />
      {note === null ? null : <p className="ui-text-muted">{note}</p>}
      {ticked ? null : <p className="ui-text-muted">{finish.noTicks}</p>}
      {!ticked && mode === 'log' && onRest !== undefined ? (
        <Button variant="quiet" disabled={restDisabled} onClick={onRest}>
          {move.choices.skip}
        </Button>
      ) : null}
      <TextField
        label={finish.noteLabel}
        hint={finish.noteHint}
        maxLength={500}
        autoComplete="off"
        value={values.note}
        onChange={(event) => {
          const text = event.currentTarget.value;
          setValues((v) => ({ ...v, note: text }));
          onEdited();
        }}
      />
      <ButtonRow stacked>
        <Button
          variant="primary"
          block
          disabled={save.busy}
          onClick={() => {
            void save
              .run(async () => {
                const result = finishPatch(data, row, values);
                if (!result.ok) throw new MoveWriteRefused(result.problem);
                await writeSession(storage, data, row.id, result.patch);
              })
              .then((ok) => {
                if (ok) onSaved();
              });
          }}
        >
          {mode === 'done' ? finish.saveChanges : finish.save}
        </Button>
        {mode === 'log' && onBack !== undefined ? (
          <Button variant="quiet" block onClick={onBack}>
            {finish.back}
          </Button>
        ) : null}
      </ButtonRow>
      <SaveError save={save} />
      <p role="status" className="ui-text-muted">
        {saved ? finish.saved : ''}
      </p>
    </Card>
  );
}
