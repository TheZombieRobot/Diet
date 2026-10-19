import {
  fillTemplate,
  type GateInput,
  isGated,
  READINESS_QUESTION_IDS,
  type ReadinessGates,
  under18LiftYear,
} from '@diet/core';
import { general, readiness } from '@diet/core/copy/health';
import { Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../db/runtime';
import { ConfirmationControl } from './forms/ConfirmationControl';
import { consequenceText } from './readinessText';

/**
 * "What your answers change" (UX 1c final card; item 13 design section 3.7): each yes (or missing
 * answer) in question order with what it switches off, the birth-year and weight lines when they
 * apply, and the closing line. "Nothing rules this out" is said only when nothing is switched off
 * (E8). With showConfirmations the Q3 and Q6 switches sit under their items.
 */
export function ReadinessSummary({
  storage,
  input,
  gates,
  birthYear,
  showConfirmations,
}: {
  readonly storage: AppStorage;
  readonly input: GateInput;
  readonly gates: ReadinessGates;
  readonly birthYear: number | null;
  readonly showConfirmations: boolean;
}): ReactElement {
  const gated = READINESS_QUESTION_IDS.filter((q) => isGated(input.answers[q]));
  const under18Year = input.minimumAgeYears !== null && input.minimumAgeYears < 18;
  return (
    <>
      {gated.map((q) => (
        <div key={q} className="ui-card__body" data-testid={`summary-${q}`}>
          <Notice tone="info">
            <p>{consequenceText(q, input)}</p>
          </Notice>
          {showConfirmations && (q === 'q3' || q === 'q6') ? (
            <ConfirmationControl storage={storage} question={q} input={input} />
          ) : null}
        </div>
      ))}
      {under18Year && birthYear !== null ? (
        <Notice tone="info">
          <p>
            {fillTemplate(readiness.ageCheck.summaryLine, { year: under18LiftYear(birthYear) })}
          </p>
        </Notice>
      ) : null}
      {input.lowWeight ? (
        <Notice tone="info">
          <p>{readiness.weightCheck.summaryLine}</p>
        </Notice>
      ) : null}
      {gates.reasons.length === 0 ? (
        <>
          <p className="ui-text-strong">{readiness.summaryNone}</p>
          <p>{general.readinessOutcome}</p>
        </>
      ) : (
        <p className="ui-text-strong">{readiness.summarySome}</p>
      )}
    </>
  );
}
