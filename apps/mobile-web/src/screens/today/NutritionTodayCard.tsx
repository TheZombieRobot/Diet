import { privacy, targets as copy } from '@diet/core/copy/health';
import { Button, Card, Notice } from '@diet/ui';
import { type ReactElement, useMemo } from 'react';
import type { AppStorage } from '../../db/runtime';
import { useDayIntake, useDayTargets, useTargetsClock } from '../targets/useDayTargets';
import { nutritionTodayView } from './nutritionView';
import { NutritionTodayView } from './NutritionTodayView';

/** The card while the records open, or when they could not be read (with Reload; T30). */
function NutritionStatus({ failed }: { failed: boolean }): ReactElement {
  return (
    <Card label={copy.today.label}>
      {failed ? (
        <Notice role="alert">
          <p>{copy.screen.readFailed}</p>
          <Button
            onClick={() => {
              location.reload();
            }}
          >
            {privacy.backupCard.reload}
          </Button>
        </Notice>
      ) : (
        <p className="ui-text-muted">{privacy.backupCard.notReady}</p>
      )}
    </Card>
  );
}

/**
 * Today's Nutrition card (item 21 design section 2.3): the engine's figures for today against
 * the calendar day's food and drinks, live. It re-renders on any write to the records it reads and
 * at local midnight; the fasting preset and the eating window change nothing on it (HS-22).
 */
export function NutritionTodayCard({ storage }: { readonly storage: AppStorage }): ReactElement {
  const clock = useTargetsClock(storage);
  const targets = useDayTargets(storage, clock);
  const intake = useDayIntake(storage, clock.today);
  const model = useMemo(
    () =>
      targets.status === 'ready' && intake.status === 'ready'
        ? nutritionTodayView(
            targets.view,
            intake.intake,
            intake.entries,
            targets.records.profile.dietMode,
          )
        : null,
    [targets, intake],
  );
  if (model !== null) return <NutritionTodayView model={model} />;
  return <NutritionStatus failed={targets.status === 'error' || intake.status === 'error'} />;
}
