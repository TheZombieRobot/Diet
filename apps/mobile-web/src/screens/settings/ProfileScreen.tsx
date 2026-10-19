import { checkProfileForm, localDateOf, type ProfileDraft } from '@diet/core';
import { onboarding, profile as copy } from '@diet/core/copy/health';
import { Button, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { appStorageStore } from '../../db/runtime';
import { saveProfile } from '../../onboarding/actions';
import { profileDraftFrom } from '../../onboarding/drafts';
import { ProfileForm } from '../../onboarding/forms/ProfileForm';
import { focusFirstInvalid } from '../../onboarding/forms/profileErrors';
import { type ReadinessGateView, useReadinessGates } from '../../onboarding/state';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { useStore } from '../../store';
import type { AppStorage } from '../../db/runtime';

/**
 * Settings, Profile (item 13 design section 3.12): the setup form without the current weight, the
 * long-term goal and the Kickstart switch, which belong to item 14. A height that puts a stored
 * goal below the floor is saved with a note (the goal is hidden at use, never deleted; E41).
 */
export function ProfileScreen(): ReactElement | null {
  const storage = useStore(appStorageStore);
  const view = useReadinessGates(storage);
  if (storage === null || view === undefined) return null;
  return <ProfileSettings storage={storage} view={view} />;
}

function ProfileSettings({
  storage,
  view,
}: {
  readonly storage: AppStorage;
  readonly view: ReadinessGateView;
}): ReactElement {
  const { env } = storage;
  const today = localDateOf(env.now(), env.timeZone());
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    profileDraftFrom(view.state, view.gates, view.input),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [refused, setRefused] = useState(0);
  const [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const save = useSave();
  const check = checkProfileForm(draft, {
    mode: 'settings',
    readiness: view.input,
    storedWeightKg: view.state.latestWeightKg,
    today,
    storedGoalKg: view.state.profile.goalKg,
  });

  useEffect(() => {
    if (refused > 0) focusFirstInvalid(form.current);
  }, [refused]);

  const onSave = () => {
    const { value } = check;
    if (value === null) {
      setShowErrors(true);
      setSaved(false);
      setRefused((n) => n + 1);
      return;
    }
    void save.run(() => saveProfile(storage, value, 'settings')).then(setSaved);
  };

  return (
    <>
      <ProfileForm
        mode="settings"
        draft={draft}
        onDraftChange={(next) => {
          setSaved(false);
          setDraft(next);
        }}
        check={check}
        showErrors={showErrors}
        thisYear={Number(today.slice(0, 4))}
        formRef={form}
        top={
          <>
            {showErrors && check.value === null ? (
              <Notice role="alert">
                <p>{onboarding.frame.fixBelow}</p>
              </Notice>
            ) : null}
            <SaveError save={save} />
            {check.goalHiddenByHeight ? (
              <Notice>
                <p>{copy.goalHiddenAfterHeight}</p>
              </Notice>
            ) : null}
          </>
        }
      />
      {saved ? (
        <Notice tone="info" role="status">
          <p>{copy.saved}</p>
        </Notice>
      ) : null}
      <Button variant="primary" block disabled={save.busy} onClick={onSave}>
        {copy.save}
      </Button>
    </>
  );
}
