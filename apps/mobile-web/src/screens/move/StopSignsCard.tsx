import { move, moveScreen, readiness } from '@diet/core/copy/health';
import { Button, Card } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { reanswerAfterChange } from '../../onboarding/actions';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { SafetyRows } from '../weight/parts';

/**
 * The stop signs, first on every state of the session route (HS-28; design section 1.6): the
 * five red flags word for word, the 111 line, and 111 and Healthline to tap. It needs no records,
 * so it never waits or goes away with a read. While exercise plans are on, it also offers item
 * 13's "My symptoms have changed", so a red flag can be reported where it is read (N30): a fresh
 * yes to question 6, which closes exercise plans at once.
 */
export function StopSignsCard({
  storage,
  canReport,
  onReported,
}: {
  readonly storage: AppStorage | null;
  readonly canReport: boolean;
  readonly onReported: () => void;
}): ReactElement {
  const { stopRules } = move.safety;
  const save = useSave();
  return (
    <Card label={stopRules.title}>
      <p>{stopRules.body}</p>
      <p className="ui-text-strong">{stopRules.emergency}</p>
      <SafetyRows />
      {canReport && storage !== null ? (
        <>
          <p className="ui-text-muted">{moveScreen.safety.changedLine}</p>
          <Button
            variant="quiet"
            disabled={save.busy}
            onClick={() => {
              void save
                .run(() => reanswerAfterChange(storage, 'q6'))
                .then((ok) => {
                  if (ok) onReported();
                });
            }}
          >
            {readiness.changed.q6}
          </Button>
          <SaveError save={save} />
        </>
      ) : null}
    </Card>
  );
}
