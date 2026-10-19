import { carbCeilingActive } from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import { useState, type ReactElement } from 'react';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { useStore } from '../../store';
import { GoalCard } from './GoalCard';
import { LogWeightPanel } from './LogWeightPanel';
import { WeightStatus } from './parts';
import { PhaseCard } from './PhaseCard';
import { reportStatus } from './stores';
import { TrendCard } from './TrendCard';
import { useWeightView } from './useWeightView';
import { WeightCards } from './WeightCards';
import { WeighInsCard } from './WeighInsCard';

function WeightScreenBody({ storage }: { storage: AppStorage }): ReactElement | null {
  const view = useWeightView(storage);
  const [preStartStopSign, setPreStartStopSign] = useState(false);
  if (view === undefined) return null;
  const { overview, input } = view;
  const bandCanShow =
    input.gates.projectionBandAvailable &&
    carbCeilingActive(input.profile.dietMode, input.gates) &&
    !overview.lowWeight;
  return (
    <>
      <WeightStatus storage={storage} />
      <WeightCards
        storage={storage}
        view={view}
        showStartCard={false}
        preStartStopSign={preStartStopSign}
        onPreStartStopSign={setPreStartStopSign}
      />
      <Card label={weight.card.logWeight}>
        <LogWeightPanel storage={storage} latest={overview.latest} onSaved={reportStatus} />
      </Card>
      {overview.latest === null ? null : <TrendCard view={view} />}
      <GoalCard storage={storage} view={view} />
      <PhaseCard
        storage={storage}
        view={view}
        onPreStartStopSign={() => {
          setPreStartStopSign(true);
        }}
      />
      <WeighInsCard storage={storage} view={view} />
      <Card label={weight.trend.howToReadLabel}>
        <p>{weight.trend.howToRead}</p>
        {bandCanShow ? <p>{weight.chart.aboutBand}</p> : null}
      </Card>
    </>
  );
}

/**
 * The Weight screen, #/weight (item 14 design section 2.4): the outcome line and the weight cards,
 * then Log weight, Trend, Long-term goal, Phase, Weigh-ins and How to read this. Reached from
 * Today's Weight card; not a tab.
 */
export function WeightScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  return storage === null ? null : <WeightScreenBody storage={storage} />;
}
