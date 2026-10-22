import type { DietMode, GateInput, ReadinessGates } from '@diet/core';
import { onboarding, readiness } from '@diet/core/copy/health';
import { Button } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { ReadinessSummary } from '../ReadinessSummary';

/** "What your answers change" after the seventh answer, and on resume (section 3.7). Writes nothing. */
export function SummaryStep({
  frame,
  storage,
  input,
  gates,
  birthYear,
  dietMode,
  onContinue,
  onBack,
}: {
  readonly frame: FlowFrame;
  readonly storage: AppStorage;
  readonly input: GateInput;
  readonly gates: ReadinessGates;
  readonly birthYear: number | null;
  readonly dietMode: DietMode;
  readonly onContinue: () => void;
  readonly onBack: (() => void) | null;
}): ReactElement {
  return (
    <FlowStepFrame
      frame={frame}
      heading={readiness.summaryTitle}
      footer={
        <>
          <Button variant="primary" block onClick={onContinue}>
            {onboarding.frame.continue}
          </Button>
          {onBack === null ? null : (
            <Button variant="quiet" onClick={onBack}>
              {onboarding.frame.back}
            </Button>
          )}
        </>
      }
    >
      <ReadinessSummary
        storage={storage}
        input={input}
        gates={gates}
        birthYear={birthYear}
        dietMode={dietMode}
        showConfirmations
      />
      <p className="ui-text-muted">{readiness.changeLater}</p>
    </FlowStepFrame>
  );
}
