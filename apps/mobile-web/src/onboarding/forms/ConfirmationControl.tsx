import type { GateInput, ReadinessConfirmationId } from '@diet/core';
import { readiness } from '@diet/core/copy/health';
import { Button, Notice, Switch } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { reanswerAfterChange, setConfirmation } from '../actions';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';

const CONFIRMATION_OF = {
  q3: 'prescriberAgreed',
  q6: 'gpExerciseDiscussed',
} as const satisfies Record<'q3' | 'q6', ReadinessConfirmationId>;

/**
 * The confirmation under a yes to question 3 or 6 (D29; E53): a switch that shows what is stored,
 * with the note that changing the answer asks again, and, while confirmed, the "has changed"
 * button that writes a fresh yes and lapses the confirmation.
 */
export function ConfirmationControl({
  storage,
  question,
  input,
}: {
  readonly storage: AppStorage;
  readonly question: 'q3' | 'q6';
  readonly input: GateInput;
}): ReactElement {
  const id = CONFIRMATION_OF[question];
  const confirmed = input.confirmations[id];
  const save = useSave();
  const [changedDone, setChangedDone] = useState(false);
  return (
    <div className="ui-card__body">
      <Switch
        label={readiness.confirmations[id]}
        hint={readiness.confirmationLapses}
        checked={confirmed}
        disabled={save.busy}
        onChange={(on) => {
          setChangedDone(false);
          void save.run(() => setConfirmation(storage, id, on ? 'yes' : 'no'));
        }}
      />
      {confirmed ? (
        <Button
          disabled={save.busy}
          onClick={() => {
            void save
              .run(() => reanswerAfterChange(storage, question))
              .then((ok) => {
                setChangedDone(ok);
              });
          }}
        >
          {readiness.changed[question]}
        </Button>
      ) : null}
      {changedDone && !confirmed ? (
        <Notice tone="info" role="status">
          <p>{readiness.changedDone[question]}</p>
        </Notice>
      ) : null}
      <SaveError save={save} />
    </div>
  );
}
