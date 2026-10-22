import { featureGateOf, type ReadinessGates, type ReadinessReasonId } from '@diet/core';
import { move, moveScreen, readiness } from '@diet/core/copy/health';
import { Button, Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { GateNotice } from '../../onboarding/GateNotice';
import { featureOffText } from '../../onboarding/readinessText';
import { routeHref } from '../../routes';
import { SafetyRows } from '../weight/parts';
import type { MoveRead } from './useMoveContext';

/** The reasons exercise plans are off; a damaged gate value with none reads as answer 6. */
function exerciseOffReasons(gates: ReadinessGates): ReadinessReasonId[] {
  const { reasons } = featureGateOf(gates, 'exercisePlans');
  return reasons.length === 0 ? ['exercise-warning'] : reasons;
}

/**
 * RD-05: item 13's notice for exercise plans, from Move's own gate read. A damaged value that is
 * not exactly true but leaves no reason would make GateNotice show nothing, so the reason is
 * then given here.
 */
export function MoveGateNotice({ gates }: { readonly gates: ReadinessGates }): ReactElement {
  if (!featureGateOf(gates, 'exercisePlans').available) {
    return <GateNotice feature="exercisePlans" link gates={gates} />;
  }
  return (
    <Notice tone="info">
      <p data-testid="gate-notice-exercisePlans">
        {featureOffText('exercisePlans', exerciseOffReasons(gates))}
      </p>
      <p>{readiness.confirmationHints.gpExerciseDiscussed}</p>
      <p>
        <a className="ui-button ui-button--quiet" href={routeHref('readiness')}>
          {readiness.changeAnswersLink}
        </a>
      </p>
    </Notice>
  );
}

/**
 * What a Move view shows instead of itself (design section 1.2): a read error or a dataset error
 * with Reload, or RD-05's notice with the 111 and Healthline rows (unless the stop-signs card above
 * already holds them) and the line that logged sessions are kept. Nothing else of Move shows.
 */
export function MoveReadNotice({
  read,
  storage,
  safetyRows = true,
}: {
  readonly read: Exclude<MoveRead, { status: 'pending' | 'ready' }>;
  readonly storage: AppStorage;
  readonly safetyRows?: boolean;
}): ReactElement {
  if (read.status === 'blocked') {
    return (
      <>
        <MoveGateNotice gates={read.gates} />
        {safetyRows ? <SafetyRows /> : null}
        <p className="ui-text-muted">{moveScreen.blockedKept}</p>
      </>
    );
  }
  const reload = (
    <Button
      variant="primary"
      onClick={() => {
        storage.platform.reload();
      }}
    >
      {moveScreen.errors.reload}
    </Button>
  );
  return read.status === 'read-error' ? (
    <Notice role="alert">
      <p>{moveScreen.errors.readFailed}</p>
      {reload}
    </Notice>
  ) : (
    <Notice>
      <p>{move.dataError}</p>
      {reload}
    </Notice>
  );
}
