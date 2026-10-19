/**
 * The first-run guard (item 13 design section 3.1; HS-20, C41, C53). Until setup is finished, the
 * flow replaces the app whatever the address says: no tabs, no gear, no Today or Settings, no
 * backup reminder, no restore before the alcohol notice. The decision comes only from stored
 * records, read live, so a reload, a deep link, the back button or another tab all land in the
 * flow. While the records open, a neutral screen with nothing to tap is shown.
 */
import { missingReadinessAnswers, type ReadinessQuestionId } from '@diet/core';
import { type ReactElement, type ReactNode, useState } from 'react';
import { appStorageStore } from '../db/runtime';
import { routeHref } from '../routes';
import { useStore } from '../store';
import { OnboardingFlow } from './OnboardingFlow';
import { OpeningScreen } from './OpeningScreen';
import { deriveOnboarding, useOnboardingState } from './state';

export function OnboardingGate({ children }: { readonly children: ReactNode }): ReactElement {
  const storage = useStore(appStorageStore);
  const read = useOnboardingState(storage);
  // Repair mode (E7, E56): the questions missing when the guard first saw a finished setup with
  // answers (or the acknowledgement) missing. It stays until the summary's Continue, even once the
  // last answer makes setup whole again, so the last answer's consequence and the summary show.
  const [repairList, setRepairList] = useState<readonly ReadinessQuestionId[] | null>(null);

  const derived =
    storage !== null && read?.ok === true ? deriveOnboarding(read.state, storage.env) : null;
  if (derived !== null && derived.mode === 'repair' && repairList === null) {
    setRepairList(missingReadinessAnswers(derived.input));
  }

  if (storage === null || read === undefined) return <OpeningScreen />;
  if (!read.ok || derived === null) return <OpeningScreen failed />;
  if (repairList !== null) {
    return (
      <OnboardingFlow
        key="repair"
        storage={storage}
        state={read.state}
        derived={derived}
        repairList={repairList}
        onRepairDone={() => {
          setRepairList(null);
          window.location.replace(routeHref('today'));
        }}
      />
    );
  }
  if (derived.step === 'done') return <>{children}</>;
  return (
    <OnboardingFlow
      key="setup"
      storage={storage}
      state={read.state}
      derived={derived}
      repairList={null}
      onRepairDone={() => undefined}
    />
  );
}
