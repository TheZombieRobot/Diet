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
import { routeHref, type RouteId } from '../routes';
import { ConfirmationControl } from './forms/ConfirmationControl';
import { consequenceText } from './readinessText';

/** Where a reason that is not an answer is changed, with a link there (Settings only). */
function WhereToChange({
  text,
  route,
  label,
}: {
  readonly text: string;
  readonly route: RouteId;
  readonly label: string;
}): ReactElement {
  return (
    <>
      <p>{text}</p>
      <p>
        <a className="ui-button ui-button--quiet" href={routeHref(route)}>
          {label}
        </a>
      </p>
    </>
  );
}

/**
 * "What your answers change" (UX 1c final card; item 13 design section 3.7): each yes (or missing
 * answer) in question order with what it switches off, the birth-year and weight lines when they
 * apply, and the closing line. "Nothing rules this out" is said only when nothing is switched off
 * (E8). With showConfirmations the Q3 and Q6 switches sit under their items. Every line follows
 * the gate reasons, so none restates the gate rule. In Settings (showWhereToChange) the birth-year
 * and weight lines say where those are changed, since this screen cannot change them.
 */
export function ReadinessSummary({
  storage,
  input,
  gates,
  birthYear,
  showConfirmations,
  showWhereToChange = false,
}: {
  readonly storage: AppStorage;
  readonly input: GateInput;
  readonly gates: ReadinessGates;
  readonly birthYear: number | null;
  readonly showConfirmations: boolean;
  readonly showWhereToChange?: boolean;
}): ReactElement {
  const gated = READINESS_QUESTION_IDS.filter((q) => isGated(input.answers[q]));
  // The lift date holds only while answer 1 is "no": a yes keeps the settings until it changes.
  const birthYearLine =
    gates.reasons.includes('under-18-birth-year') && !gates.reasons.includes('under-18');
  return (
    <>
      {gated.map((q) => (
        <div key={q} className="ui-card__body" data-testid={`summary-${q}`}>
          <Notice tone="info">
            <p>{consequenceText(q, input, gates)}</p>
          </Notice>
          {showConfirmations && (q === 'q3' || q === 'q6') ? (
            <ConfirmationControl storage={storage} question={q} input={input} />
          ) : null}
        </div>
      ))}
      {birthYearLine && birthYear !== null ? (
        <Notice tone="info">
          <p data-testid="summary-birth-year">
            {fillTemplate(readiness.ageCheck.summaryLine, { year: under18LiftYear(birthYear) })}
          </p>
          {showWhereToChange ? (
            <WhereToChange
              text={readiness.ageCheck.whereToChange}
              route="profile"
              label={readiness.ageCheck.profileLink}
            />
          ) : null}
        </Notice>
      ) : null}
      {gates.reasons.includes('low-current-weight') ? (
        <Notice tone="info">
          <p data-testid="summary-weight">{readiness.weightCheck.summaryLine}</p>
          {showWhereToChange ? (
            <WhereToChange
              text={readiness.weightCheck.whereToChange}
              route="weight"
              label={readiness.weightCheck.weightLink}
            />
          ) : null}
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
