import { featureGateOf, type GatedFeature, type ReadinessGates } from '@diet/core';
import { readiness } from '@diet/core/copy/health';
import { Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import { appStorageStore } from '../db/runtime';
import { routeHref } from '../routes';
import { useStore } from '../store';
import { featureOffText } from './readinessText';
import { useReadinessGates } from './state';

/**
 * A feature hidden with its reason (RD-01 to RD-05; item 13 design section 3.13). It reads the
 * live gates unless given the gates of a form being filled in (the profile step), and shows
 * nothing while the feature is available. The confirmation hint follows a diabetes-medication or
 * exercise reason. With `link` (after setup) it links to Settings, Readiness answers.
 */
export function GateNotice({
  feature,
  link,
  gates,
}: {
  readonly feature: GatedFeature;
  readonly link: boolean;
  readonly gates?: ReadinessGates | undefined;
}): ReactElement | null {
  const storage = useStore(appStorageStore);
  const live = useReadinessGates(storage);
  const current = gates ?? live?.gates;
  if (current === undefined) return null;
  const { available, reasons } = featureGateOf(current, feature);
  if (available) return null;
  return (
    <Notice tone="info">
      <p data-testid={`gate-notice-${feature}`}>{featureOffText(feature, reasons)}</p>
      {reasons.includes('diabetes-medication') ? (
        <p>{readiness.confirmationHints.prescriberAgreed}</p>
      ) : null}
      {reasons.includes('exercise-warning') ? (
        <p>{readiness.confirmationHints.gpExerciseDiscussed}</p>
      ) : null}
      {link ? (
        <p>
          <a className="ui-button ui-button--quiet" href={routeHref('readiness')}>
            {readiness.changeAnswersLink}
          </a>
        </p>
      ) : null}
    </Notice>
  );
}
