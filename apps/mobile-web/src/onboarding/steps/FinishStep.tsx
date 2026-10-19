import { onboarding } from '@diet/core/copy/health';
import { Button } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { completeOnboarding } from '../actions';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';

/**
 * Defensive (E44): every step is done but setup has no completion time, for example in a restored
 * file. "Go to Today" completes it.
 */
export function FinishStep({
  frame,
  storage,
  onDone,
}: {
  readonly frame: FlowFrame;
  readonly storage: AppStorage;
  readonly onDone: () => void;
}): ReactElement {
  const save = useSave();
  return (
    <FlowStepFrame
      frame={frame}
      heading={onboarding.finish.title}
      footer={
        <>
          <SaveError save={save} />
          <Button
            variant="primary"
            block
            disabled={save.busy}
            onClick={() => {
              void save
                .run(() => completeOnboarding(storage))
                .then((ok) => {
                  if (ok) onDone();
                });
            }}
          >
            {onboarding.finish.start}
          </Button>
        </>
      }
    >
      <p>{onboarding.finish.body}</p>
    </FlowStepFrame>
  );
}
