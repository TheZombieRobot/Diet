import {
  featureGateOf,
  type GatedFeature,
  isDeficitGroupReason,
  type ReadinessGates,
  reasonStates,
} from '@diet/core';
import { readiness } from '@diet/core/copy/health';
import { Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import { appStorageStore } from '../db/runtime';
import { routeHref } from '../routes';
import { useStore } from '../store';
import { confirmationHint, featureOffReasonsText } from './readinessText';
import { useReadinessGates } from './state';

/**
 * A feature hidden with its reason (RD-01 to RD-05; item 13 design section 3.13). It reads the
 * live gates unless given the gates of a form being filled in (the profile step), and shows
 * nothing while the feature is available. The confirmation hint shows only when that confirmation
 * is the one reason left, so it never promises a feature another answer keeps off. With `link`
 * (after setup) it links to Settings, Readiness answers.
 *
 * Item 15: a reason whose question is not answered yet reads "stays off until you answer", never
 * as something the person said (C41). With linkWhen 'actionable' (the fasting screens; F41) the
 * link shows only when answering can help: never for a stated reason of the deficit group, and
 * otherwise for an unanswered question ("Answer the questions") or the diabetes reason.
 */
export function GateNotice({
  feature,
  link,
  gates,
  linkWhen = 'always',
}: {
  readonly feature: GatedFeature;
  readonly link: boolean;
  readonly gates?: ReadinessGates | undefined;
  readonly linkWhen?: 'always' | 'actionable' | undefined;
}): ReactElement | null {
  const storage = useStore(appStorageStore);
  const live = useReadinessGates(storage);
  const current = gates ?? live?.gates;
  if (current === undefined) return null;
  const { available, reasons } = featureGateOf(current, feature);
  if (available) return null;
  // Gates passed in (the profile step, after every answer) can come before the live answers.
  const { stated, unanswered } =
    live === undefined ? { stated: reasons, unanswered: [] } : reasonStates(live.input, reasons);
  const actionable =
    !stated.some(isDeficitGroupReason) &&
    (unanswered.length > 0 || stated.includes('diabetes-medication'));
  const showLink = link && (linkWhen === 'always' || actionable);
  const hint = confirmationHint(reasons);
  return (
    <Notice tone="info">
      <p data-testid={`gate-notice-${feature}`}>
        {featureOffReasonsText(feature, stated, unanswered)}
      </p>
      {hint === null ? null : <p data-testid={`gate-hint-${feature}`}>{hint}</p>}
      {showLink ? (
        <p>
          <a className="ui-button ui-button--quiet" href={routeHref('readiness')}>
            {linkWhen === 'actionable' && unanswered.length > 0
              ? readiness.answerQuestionsLink
              : readiness.changeAnswersLink}
          </a>
        </p>
      ) : null}
    </Notice>
  );
}
