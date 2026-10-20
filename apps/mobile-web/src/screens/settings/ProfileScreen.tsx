import { checkProfileForm, localDateOf, type ProfileDraft } from '@diet/core';
import { onboarding, profile as copy, readiness } from '@diet/core/copy/health';
import { Button, ButtonRow, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { appStorageStore } from '../../db/runtime';
import { saveProfile } from '../../onboarding/actions';
import { profileDraftFrom } from '../../onboarding/drafts';
import { ProfileForm } from '../../onboarding/forms/ProfileForm';
import { focusFirstInvalid } from '../../onboarding/forms/profileErrors';
import { gateWeightKgOf, type ReadinessGateView, useReadinessGates } from '../../onboarding/state';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { useStore } from '../../store';
import type { AppStorage } from '../../db/runtime';

/**
 * Settings, Profile (item 13 design section 3.12): the setup form without the current weight, the
 * long-term goal and the Kickstart switch, which belong to item 14. A height that puts a stored
 * goal below the floor is saved with a note (the goal is hidden at use, never deleted; E41). A
 * birth year or height that would end a running Kickstart is saved only after "Save and end
 * Kickstart", since a typing slip is the likely cause (F23).
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
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const title = useRef<HTMLParagraphElement>(null);
  const save = useSave();
  const check = checkProfileForm(draft, {
    mode: 'settings',
    readiness: view.input,
    storedWeightKg: gateWeightKgOf(view.state, env),
    today,
    storedGoalKg: view.state.profile.goalKg,
  });

  useEffect(() => {
    if (refused > 0) focusFirstInvalid(form.current);
  }, [refused]);
  useEffect(() => {
    if (confirming) title.current?.focus();
  }, [confirming]);

  const onSave = (endKickstart: boolean) => {
    const { value } = check;
    if (value === null) {
      setShowErrors(true);
      setSaved(false);
      setConfirming(false);
      setRefused((n) => n + 1);
      return;
    }
    let asked = false;
    void save
      .run(async () => {
        const result = await saveProfile(storage, value, 'settings', {
          askBeforeEndingKickstart: !endKickstart,
        });
        asked = result.kickstartEndNeedsConfirm;
      })
      .then((ok) => {
        setConfirming(ok && asked);
        setSaved(ok && !asked);
      });
  };

  return (
    <>
      <ProfileForm
        mode="settings"
        draft={draft}
        onDraftChange={(next) => {
          setSaved(false);
          setConfirming(false);
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
      {confirming ? (
        <Notice>
          <p ref={title} tabIndex={-1} className="ui-text-strong ui-step-start">
            {readiness.endsKickstart.title}
          </p>
          <p>{readiness.endsKickstart.profile}</p>
          <ButtonRow>
            <Button
              variant="caution"
              aria-disabled={save.busy}
              onClick={() => {
                onSave(true);
              }}
            >
              {readiness.endsKickstart.confirm}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {readiness.endsKickstart.cancel}
            </Button>
          </ButtonRow>
        </Notice>
      ) : null}
      {/* aria-disabled while saving keeps focus on the button; useSave refuses a second tap. */}
      <Button
        variant="primary"
        block
        aria-disabled={save.busy || confirming}
        onClick={() => {
          if (!confirming) onSave(false);
        }}
      >
        {copy.save}
      </Button>
    </>
  );
}
