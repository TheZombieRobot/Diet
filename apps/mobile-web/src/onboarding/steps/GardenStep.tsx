import {
  checkGardenCrop,
  fillTemplate,
  type GardenCropDraft,
  type GardenCropField,
  type GardenCropProblem,
  type GardenRecord,
} from '@diet/core';
import { garden, onboarding } from '@diet/core/copy/health';
import { Button, Card, ChoiceList, CloseIcon, IconButton, Switch, TextField } from '@diet/ui';
import { type ReactElement, useRef, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { addCrop, finishGarden, removeCrop } from '../actions';
import { EMPTY_CROP } from '../drafts';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';

/** The row seeded at database creation (storage spec section 6; C57). Item 19 edits it. */
const SEEDED_SILVERBEET = 'seed:silverbeet';

const readGarden = (storage: AppStorage): Promise<GardenRecord[]> => storage.repos.garden.list();

/** "Silverbeet — Available, amount not entered", "Spinach — 2 bunches · Ready to harvest · …". */
function cropDetail(crop: GardenRecord): string {
  const parts: string[] = [];
  if (crop.amount === null || crop.unit === null) {
    parts.push(garden.available);
  } else {
    const unit =
      crop.unit === 'bunch'
        ? crop.amount === 1
          ? garden.unitNames.bunchOne
          : garden.unitNames.bunch
        : garden.unitNames[crop.unit];
    parts.push(fillTemplate(garden.amount, { amount: crop.amount, unit }));
  }
  parts.push(crop.harvestReady ? garden.ready : garden.notReady);
  if (crop.perishabilityDays !== null) {
    parts.push(
      crop.perishabilityDays === 1
        ? garden.keepsForOne
        : fillTemplate(garden.keepsFor, { days: crop.perishabilityDays }),
    );
  }
  return parts.join(' · ');
}

function cropError(
  field: GardenCropField,
  problem: GardenCropProblem | undefined,
): string | undefined {
  if (problem === undefined) return undefined;
  switch (field) {
    case 'name':
      return problem === 'required' ? garden.errors.nameRequired : garden.errors.nameLength;
    case 'amount':
      return garden.errors.amount;
    case 'unit':
      return garden.errors.unitRequired;
    case 'keepsDays':
      return garden.errors.keeps;
  }
}

/**
 * The garden step (UX 1f; C57; item 13 design section 3.11). Silverbeet is listed already and is
 * not removed here; crops added here are written at once and can be removed. Continue and "Skip
 * for now" both finish setup (E24).
 */
export function GardenStep({
  frame,
  storage,
  draft,
  onDraftChange,
  onFinished,
  onBack,
}: {
  readonly frame: FlowFrame;
  readonly storage: AppStorage;
  readonly draft: GardenCropDraft;
  readonly onDraftChange: (draft: GardenCropDraft) => void;
  readonly onFinished: (completed: boolean) => void;
  readonly onBack: () => void;
}): ReactElement {
  const crops = useLiveQuery(storage, readGarden);
  const [problems, setProblems] = useState<Partial<Record<GardenCropField, GardenCropProblem>>>({});
  const nameField = useRef<HTMLInputElement>(null);
  const addSave = useSave();
  const removeSave = useSave();
  const finishSave = useSave();
  const set = (patch: Partial<GardenCropDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };
  const add = () => {
    const checked = checkGardenCrop(draft);
    if (!checked.ok) {
      setProblems(checked.problems);
      return;
    }
    setProblems({});
    void addSave
      .run(() => addCrop(storage, checked.value))
      .then((ok) => {
        if (!ok) return;
        onDraftChange(EMPTY_CROP);
        nameField.current?.focus();
      });
  };
  const finish = () => {
    let completed = false;
    void finishSave
      .run(async () => {
        completed = (await finishGarden(storage)).completed;
      })
      .then((ok) => {
        if (ok) onFinished(completed);
      });
  };
  const hasSilverbeet = crops?.some((c) => c.ingredientId === SEEDED_SILVERBEET) ?? false;

  return (
    <FlowStepFrame
      frame={frame}
      heading={garden.title}
      footer={
        <>
          <SaveError save={finishSave} />
          <Button variant="primary" block disabled={finishSave.busy} onClick={finish}>
            {garden.continue}
          </Button>
          <Button variant="quiet" disabled={finishSave.busy} onClick={finish}>
            {garden.skip}
          </Button>
          <p className="ui-text-muted">{garden.skipHint}</p>
          <Button variant="quiet" onClick={onBack}>
            {onboarding.frame.back}
          </Button>
        </>
      }
    >
      <p>{garden.intro}</p>
      {hasSilverbeet ? <p>{garden.silverbeetListed}</p> : null}
      {crops === undefined ? null : crops.length === 0 ? (
        <p className="ui-text-muted">{garden.empty}</p>
      ) : (
        <ul className="ui-rows" data-testid="garden-list">
          {crops.map((crop) => (
            <li key={crop.id} className="ui-row">
              <span className="ui-row__text">
                <span className="ui-text-strong">{crop.name}</span>
                <span className="ui-text-muted">{cropDetail(crop)}</span>
              </span>
              {crop.ingredientId === SEEDED_SILVERBEET ? null : (
                <IconButton
                  label={fillTemplate(garden.remove, { name: crop.name })}
                  icon={<CloseIcon size={18} />}
                  disabled={removeSave.busy}
                  onClick={() => {
                    void removeSave.run(() => removeCrop(storage, crop.id));
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <SaveError save={removeSave} />
      <Card label={garden.addTitle}>
        <TextField
          ref={nameField}
          label={garden.nameLabel}
          hint={garden.nameHint}
          autoComplete="off"
          value={draft.name}
          error={cropError('name', problems.name)}
          onChange={(event) => {
            set({ name: event.currentTarget.value });
          }}
        />
        <TextField
          label={garden.amountLabel}
          hint={garden.amountHint}
          inputMode="decimal"
          autoComplete="off"
          value={draft.amount}
          error={cropError('amount', problems.amount)}
          onChange={(event) => {
            set({ amount: event.currentTarget.value });
          }}
        />
        <ChoiceList
          legend={garden.unitLegend}
          name="garden-unit"
          options={[
            { value: 'g', label: garden.unitOptions.g },
            { value: 'each', label: garden.unitOptions.each },
            { value: 'bunch', label: garden.unitOptions.bunch },
          ]}
          value={draft.unit}
          error={cropError('unit', problems.unit)}
          onChange={(value) => {
            set({ unit: value === 'g' || value === 'each' || value === 'bunch' ? value : null });
          }}
        />
        <Switch
          label={garden.readyLabel}
          checked={draft.harvestReady}
          onChange={(on) => {
            set({ harvestReady: on });
          }}
        />
        <TextField
          label={garden.keepsLabel}
          inputMode="numeric"
          autoComplete="off"
          value={draft.keepsDays}
          error={cropError('keepsDays', problems.keepsDays)}
          onChange={(event) => {
            set({ keepsDays: event.currentTarget.value });
          }}
        />
        <SaveError save={addSave} />
        <Button disabled={addSave.busy} onClick={add}>
          {garden.add}
        </Button>
      </Card>
    </FlowStepFrame>
  );
}
