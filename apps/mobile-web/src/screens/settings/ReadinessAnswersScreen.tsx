import { readiness } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { appStorageStore } from '../../db/runtime';
import { ReadinessList } from '../../onboarding/forms/ReadinessList';
import { ReadinessSummary } from '../../onboarding/ReadinessSummary';
import { useReadinessGates } from '../../onboarding/state';
import { useStore } from '../../store';

/**
 * Settings, Readiness answers (RD-06; item 13 design section 3.12): every answer can be changed,
 * and features elsewhere follow at once; logs and weigh-ins are kept (a changed answer 3 or 6 asks
 * for its confirmation again). The confirmation switches appear once, in the answers list (E67).
 * The birth-year and weight lines say where those are changed.
 */
export function ReadinessAnswersScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  const view = useReadinessGates(storage);
  if (storage === null || view === undefined) return null;
  return (
    <>
      <p>{readiness.settingsIntro}</p>
      <Card label={readiness.settingsAnswersLabel}>
        <ReadinessList storage={storage} input={view.input} />
      </Card>
      <Card label={readiness.summaryTitle}>
        <ReadinessSummary
          storage={storage}
          input={view.input}
          gates={view.gates}
          birthYear={view.state.profile.birthYear}
          showConfirmations={false}
          showWhereToChange
        />
      </Card>
    </>
  );
}
