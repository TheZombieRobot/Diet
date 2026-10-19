import { onboarding } from '@diet/core/copy/health';
import { Button } from '@diet/ui';
import type { ReactElement } from 'react';
import { ROUTE_TITLES } from '../../routes';
import { AboutScreen } from '../../screens/AboutScreen';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';

/** About inside setup, after the notice (C41; E2): the About screen with a way back to the step. */
export function AboutInFlow({
  frame,
  onBack,
}: {
  readonly frame: FlowFrame;
  readonly onBack: () => void;
}): ReactElement {
  return (
    <FlowStepFrame
      frame={frame}
      heading={ROUTE_TITLES.about}
      footer={
        <Button variant="primary" block onClick={onBack}>
          {onboarding.frame.backToSetup}
        </Button>
      }
    >
      <AboutScreen />
    </FlowStepFrame>
  );
}
