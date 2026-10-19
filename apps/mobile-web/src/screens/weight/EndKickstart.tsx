import { weight } from '@diet/core/copy/health';
import { Button, ButtonRow } from '@diet/ui';
import { useState, type ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { endKickstart } from './kickstartActions';
import { reportStatus, weightStatusStore } from './stores';
import { useFocusWhen } from './weightText';
import { weightWriteMessage } from './writeErrors';

/**
 * "End Kickstart now" with its confirmation (item 14 design section 2.4.3, W24): always available
 * while a Kickstart runs or has not started yet (a start dated ahead), and the primary button on the
 * stop-sign card after a stop-sign answer.
 */
export function EndKickstart({
  storage,
  primary = false,
}: {
  readonly storage: AppStorage;
  readonly primary?: boolean;
}): ReactElement {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmRef = useFocusWhen<HTMLParagraphElement>(confirming);
  if (!confirming) {
    return (
      <Button
        variant={primary ? 'primary' : 'secondary'}
        onClick={() => {
          setConfirming(true);
        }}
      >
        {weight.end.action}
      </Button>
    );
  }
  return (
    <div className="ui-card__body">
      <p ref={confirmRef} tabIndex={-1} className="ui-step-start">
        {weight.end.confirm}
      </p>
      <ButtonRow>
        <Button
          variant="caution"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            endKickstart(storage, 'user-ended').then(
              () => {
                reportStatus(weight.end.ended);
              },
              (error: unknown) => {
                weightStatusStore.set(weightWriteMessage(error, 'end'));
                setBusy(false);
                setConfirming(false);
              },
            );
          }}
        >
          {weight.end.yes}
        </Button>
        <Button
          variant="quiet"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
          }}
        >
          {weight.end.cancel}
        </Button>
      </ButtonRow>
    </div>
  );
}
