import { privacy, readiness } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useState } from 'react';
import { appStorageStore } from '../../db/runtime';
import { goToTab } from '../../navigation';
import { ReadinessList } from '../../onboarding/forms/ReadinessList';
import { RESTORED_HASH } from '../../onboarding/navigation';
import { ReadinessSummary } from '../../onboarding/ReadinessSummary';
import { useReadinessGates } from '../../onboarding/state';
import { routeHref } from '../../routes';
import { useStore } from '../../store';

/**
 * Once, after a restore made during setup reloads here (F28): the records are back, and the
 * restored answers are checked before Today. The mark is taken off the address at once, so a reload
 * or a later visit does not say it again.
 */
function useRestoredOnce(): [boolean, () => void] {
  const [restored, setRestored] = useState(() => window.location.hash === RESTORED_HASH);
  useEffect(() => {
    if (window.location.hash === RESTORED_HASH) {
      window.history.replaceState(window.history.state, '', routeHref('readiness'));
    }
  }, []);
  return [
    restored,
    () => {
      setRestored(false);
    },
  ];
}

/**
 * Settings, Readiness answers (RD-06; item 13 design section 3.12): every answer can be changed,
 * and features elsewhere follow at once; logs and weigh-ins are kept (a changed answer 3 or 6 asks
 * for its confirmation again). The confirmation switches appear once, in the answers list (E67).
 * The birth-year and weight lines say where those are changed. After a restore made during setup,
 * it first says the records are back, with "These still apply" to go on to Today (F28).
 */
export function ReadinessAnswersScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  const view = useReadinessGates(storage);
  const [restored, done] = useRestoredOnce();
  if (storage === null || view === undefined) return null;
  return (
    <>
      {restored ? (
        <Notice role="status">
          <p>{privacy.importBackup.restored}</p>
          <ButtonRow>
            <Button
              variant="primary"
              onClick={() => {
                done();
                goToTab('today', 'readiness');
              }}
            >
              {privacy.importBackup.restoredContinue}
            </Button>
          </ButtonRow>
        </Notice>
      ) : null}
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
          dietMode={view.state.profile.dietMode}
          showConfirmations={false}
          showWhereToChange
        />
      </Card>
    </>
  );
}
