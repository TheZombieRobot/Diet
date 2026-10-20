import {
  DIET_MODES,
  type DietMode,
  type DayTargetsView,
  fillTemplate,
  isDietMode,
} from '@diet/core';
import { targets as copy } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, ChoiceList, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { StorageRuleError } from '../../db/errors';
import type { AppStorage } from '../../db/runtime';
import { featureOffReasonsFor } from '../../onboarding/readinessText';
import { switchDietMode } from './dietModeActions';
import { useCardWrite } from './form';
import { ReadinessLink, WriteStatus } from './parts';

/** A switch the repository refused because leaving keto ends a Kickstart (C56). */
const needsConfirmation = (error: unknown): boolean =>
  error instanceof StorageRuleError && error.rule === 'kickstart-confirm-needed';

/**
 * The Diet mode card (item 21 design section 2.2.1; FL-04, C56, T29): pick, then confirm. A radio
 * only sets the pending mode, so arrow keys never write; "Change diet mode" commits it. Whether
 * leaving keto needs the owner's confirmation is decided by the repository from the records, so a
 * stale screen can neither end a Kickstart unseen nor skip a switch the owner confirmed.
 */
export function DietModeCard({
  storage,
  view,
  stored,
  disabled,
}: {
  readonly storage: AppStorage;
  readonly view: DayTargetsView;
  readonly stored: DietMode;
  readonly disabled: boolean;
}): ReactElement {
  const [pending, setPending] = useState<DietMode | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [switched, setSwitched] = useState<DietMode | null>(null);
  const write = useCardWrite(copy.dietMode.failed);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const radioRef = useRef<HTMLInputElement>(null);
  /** Set by "Keep keto": focus returns to the checked radio after the next render. */
  const returnFocus = useRef(false);
  const ceilingOff = !view.gates.ketoCeilingAvailable;

  useEffect(() => {
    if (confirming) titleRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (!returnFocus.current) return;
    returnFocus.current = false;
    radioRef.current?.focus();
  });

  const commit = (mode: DietMode, endKickstart: boolean) => {
    setSwitched(null);
    write.run(() =>
      switchDietMode(storage, mode, { endKickstart }).then(
        () => {
          setConfirming(false);
          setPending(null);
          setSwitched(mode);
        },
        (error: unknown) => {
          if (!needsConfirmation(error)) throw error;
          setConfirming(true);
        },
      ),
    );
  };

  const busy = disabled || write.busy;
  const details = copy.dietMode.details;
  return (
    <Card label={copy.dietMode.label}>
      <ChoiceList
        legend={copy.dietMode.legend}
        name="diet-mode"
        options={DIET_MODES.map((mode) => ({
          value: mode,
          label: copy.dietMode.names[mode],
          detail: mode !== 'balanced' && ceilingOff ? details.ceilingOff : details[mode],
        }))}
        value={pending ?? stored}
        firstInputRef={radioRef}
        disabled={busy}
        onChange={(value) => {
          if (!isDietMode(value)) return;
          write.clear();
          setSwitched(null);
          const next = value === stored ? null : value;
          setPending(next);
          // Back on the stored mode there is nothing to confirm.
          if (next === null) setConfirming(false);
        }}
      />
      {confirming && pending !== null ? (
        <Notice>
          <p ref={titleRef} tabIndex={-1} className="ui-text-strong ui-step-start">
            {copy.dietMode.leaveKickstart.title}
          </p>
          <p>{copy.dietMode.leaveKickstart.body}</p>
          <ButtonRow>
            <Button
              variant="caution"
              disabled={busy}
              onClick={() => {
                commit(pending, true);
              }}
            >
              {copy.dietMode.leaveKickstart.confirm}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setPending(null);
                returnFocus.current = true;
              }}
            >
              {copy.dietMode.leaveKickstart.cancel}
            </Button>
          </ButtonRow>
        </Notice>
      ) : null}
      <Button
        variant="primary"
        block
        disabled={busy || pending === null || confirming}
        onClick={() => {
          if (pending !== null) commit(pending, false);
        }}
      >
        {copy.dietMode.change}
      </Button>
      <WriteStatus
        state={write.state.kind === 'saved' ? { kind: 'idle' } : write.state}
        saving={copy.dietMode.saving}
      />
      {switched === null ? null : (
        <Notice tone="info" role="status">
          <p>{fillTemplate(copy.dietMode.switched, { mode: copy.dietMode.names[switched] })}</p>
        </Notice>
      )}
      <p className="ui-text-muted">{copy.dietMode.switchNote}</p>
      {ceilingOff ? (
        <>
          <p>{`${featureOffReasonsFor('ketoCeiling', view.gateInput, view.gates)} ${copy.carbs.offShown}`}</p>
          <ReadinessLink />
        </>
      ) : null}
    </Card>
  );
}
