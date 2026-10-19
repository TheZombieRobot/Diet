import { general, helpNumbers, onboarding } from '@diet/core/copy/health';
import { Button, Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { HelpNumberList } from '../../screens/HelpNumbers';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';

/**
 * Welcome (UX 1a): the not-a-medical-device sentence, what setup asks, privacy, and every help
 * number (C41, E61), so the numbers are reachable before the notice without a link out of the
 * flow. Nothing is written.
 */
export function WelcomeStep({
  frame,
  onContinue,
}: {
  readonly frame: FlowFrame;
  readonly onContinue: () => void;
}): ReactElement {
  return (
    <FlowStepFrame
      frame={frame}
      heading={onboarding.welcome.title}
      footer={
        <Button variant="primary" block onClick={onContinue}>
          {onboarding.frame.continue}
        </Button>
      }
    >
      <p className="ui-text-lead">{general.welcome}</p>
      <p>{onboarding.welcome.next}</p>
      <p>{general.privacy}</p>
      <Card label={onboarding.welcome.helpTitle}>
        <p className="ui-text-muted">{helpNumbers.intro}</p>
        <HelpNumberList />
      </Card>
    </FlowStepFrame>
  );
}
