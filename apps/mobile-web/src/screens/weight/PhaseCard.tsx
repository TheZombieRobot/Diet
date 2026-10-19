import { fillTemplate } from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Button, Card } from '@diet/ui';
import { useState, type ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatLocalDay } from '../../format';
import { EndKickstart } from './EndKickstart';
import { KickstartCheckPanel } from './KickstartCheckPanel';
import { PhaseNotes } from './parts';
import type { WeightView } from './useWeightView';
import { phaseChip, START_UNAVAILABLE_TEXT } from './weightText';

/**
 * The Phase card on the Weight screen (item 14 design section 2.4.1): during Kickstart its week,
 * its scheduled last day, the extensions used and End Kickstart now; in Steady, Start a Kickstart
 * when one may start (after the four questions), or the reason it may not; a Kickstart whose first
 * day has not come (a start dated ahead) says so plainly, with End Kickstart; with no phase, the
 * reason. The phase notes in every case.
 */
export function PhaseCard({
  storage,
  view,
  onPreStartStopSign,
}: {
  storage: AppStorage;
  view: WeightView;
  onPreStartStopSign: () => void;
}): ReactElement {
  const { overview } = view;
  const { phase, kickstart } = overview;
  const [checking, setChecking] = useState(false);
  const chip = phaseChip(phase);
  return (
    <Card label={weight.phase.label}>
      {chip === null ? null : <p className="ui-text-strong">{chip}</p>}
      {phase.kind === 'kickstart' ? (
        <>
          <p>
            {fillTemplate(weight.phase.kickstartDue, {
              date: formatLocalDay(phase.scheduledLastDay),
            })}
          </p>
          <p className="ui-text-muted">
            {fillTemplate(weight.phase.extensionsUsed, { used: kickstart.usage.extensions })}
          </p>
        </>
      ) : null}
      <PhaseNotes notes={overview.notes} />
      {phase.kind === 'kickstart' ? <EndKickstart storage={storage} /> : null}
      {phase.kind === 'steady' && kickstart.notStarted !== null ? (
        <>
          <p>
            {fillTemplate(weight.phase.notStartedDay1, {
              date: formatLocalDay(kickstart.notStarted.day1),
            })}
          </p>
          <EndKickstart storage={storage} />
        </>
      ) : null}
      {phase.kind === 'steady' && kickstart.start.available ? (
        <>
          <p>{weight.start.offer}</p>
          {kickstart.startWindowLine ? <p>{weight.start.offerWindow}</p> : null}
          {checking ? (
            <KickstartCheckPanel
              storage={storage}
              variant={{ kind: 'start', today: overview.today }}
              onCancel={() => {
                setChecking(false);
              }}
              onPreStartStopSign={() => {
                setChecking(false);
                onPreStartStopSign();
              }}
            />
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                setChecking(true);
              }}
            >
              {weight.start.action}
            </Button>
          )}
        </>
      ) : null}
      {phase.kind === 'steady' &&
      !kickstart.start.available &&
      START_UNAVAILABLE_TEXT[kickstart.start.reason] !== null ? (
        <p className="ui-text-muted">{START_UNAVAILABLE_TEXT[kickstart.start.reason]}</p>
      ) : null}
    </Card>
  );
}
