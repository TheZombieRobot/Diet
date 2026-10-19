import { privacy, targets as copy } from '@diet/core/copy/health';
import { Button, Card, Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { useStore } from '../../store';
import { useGateOpen } from '../backup/focus';
import { DietModeCard } from './DietModeCard';
import { EnergyCard } from './EnergyCard';
import { ReadinessLink } from './parts';
import { CarbsCard, GuidesCard, ProteinCard, SaturatedFatCard } from './TargetCards';
import { useDayTargets, useTargetsClock } from './useDayTargets';

const reload = () => {
  location.reload();
};

/** The screen while the records open, or when they could not be read (T30): no form controls. */
function TargetsStatus({ failed }: { readonly failed: boolean }): ReactElement {
  return (
    <Card label={copy.screen.title}>
      {failed ? (
        <Notice role="alert">
          <p>{copy.screen.readFailed}</p>
          <Button onClick={reload}>{privacy.backupCard.reload}</Button>
        </Notice>
      ) : (
        <p className="ui-text-muted">{privacy.backupCard.notReady}</p>
      )}
    </Card>
  );
}

function TargetsBody({ storage }: { readonly storage: AppStorage }): ReactElement {
  const clock = useTargetsClock(storage);
  const state = useDayTargets(storage, clock);
  const gateOpen = useGateOpen(storage.gate);
  if (state.status !== 'ready') return <TargetsStatus failed={state.status === 'error'} />;
  const { records, view } = state;
  const cardProps = { storage, view, records, disabled: !gateOpen };
  return (
    <>
      {gateOpen ? null : (
        <Notice role="status">
          <p>{privacy.backupCard.closed}</p>
          <Button onClick={reload}>{privacy.backupCard.reload}</Button>
        </Notice>
      )}
      {view.display.missingAnswers.length === 0 ? null : (
        <>
          <Notice role="status">
            <p>{copy.screen.missingAnswers}</p>
          </Notice>
          <ReadinessLink />
        </>
      )}
      <p>{copy.screen.intro}</p>
      <DietModeCard
        storage={storage}
        view={view}
        stored={records.profile.dietMode}
        disabled={!gateOpen}
      />
      <EnergyCard {...cardProps} />
      <ProteinCard {...cardProps} />
      <CarbsCard {...cardProps} />
      <SaturatedFatCard {...cardProps} />
      <GuidesCard {...cardProps} />
    </>
  );
}

/**
 * Settings, Diet and targets (UX_SCREENS section 7; item 21 design section 2.2): the diet mode and
 * every figure the planner and the Nutrition card use, from the one targets engine, live. A
 * weigh-in, a readiness change or a saved target re-renders it at once (RD-06).
 */
export function TargetsScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  return storage === null ? <TargetsStatus failed={false} /> : <TargetsBody storage={storage} />;
}
