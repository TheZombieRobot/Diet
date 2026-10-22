import {
  checkGardenCrop,
  duplicateOnSave,
  fillTemplate,
  type GardenCropDraft,
  gardenCropDraftEmpty,
  type GardenCropField,
  type GardenCropProblem,
  type GardenCropValue,
  type GardenRecord,
  gardenProblemText,
  gardenRowView,
  linkFor,
  localDateOf,
  PLAN_AND_LIST_BUILT,
} from '@diet/core';
import { garden, gardenScreen, onboarding } from '@diet/core/copy/health';
import { Button, Card, ChoiceList, CloseIcon, IconButton, Switch, TextField } from '@diet/ui';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { useFoodCatalogue } from '../../foods/useFoods';
import { addCrop, finishGarden, removeCrop } from '../actions';
import { EMPTY_CROP } from '../drafts';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { focusFirstInvalid } from '../forms/profileErrors';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';

/** The row seeded at database creation (storage spec section 6; C57). Item 19 edits it. */
const SEEDED_SILVERBEET = 'seed:silverbeet';

const readGarden = (storage: AppStorage): Promise<GardenRecord[]> => storage.repos.garden.list();

/**
 * "Available, amount not entered · Ready to use", "2 bunches · Not ready yet · Keeps about 1 day":
 * item 19's row text (core gardenRowView), so setup and the garden screen say the same thing. The
 * "Updated" part and the notes mean nothing during setup and are left out.
 */
function cropDetail(crop: GardenRecord, storage: AppStorage): string {
  const view = gardenRowView(crop, {
    today: localDateOf(storage.env.now(), storage.env.timeZone()),
    zone: storage.env.timeZone(),
    hasDataset: false,
    planAndListBuilt: PLAN_AND_LIST_BUILT,
  });
  return [view.value, view.readyText, view.freshness]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function cropError(
  field: GardenCropField,
  problem: GardenCropProblem | undefined,
): string | undefined {
  return problem === undefined ? undefined : gardenProblemText(field, problem);
}

/**
 * The garden step (UX 1f; C57; item 13 design section 3.11). Silverbeet is listed already and is
 * not removed here; crops added here are written at once and can be removed. Continue and "Skip
 * for now" both finish setup (E24). Continue first adds a crop typed in "Add a crop" (or shows what
 * it needs, and stays); only Skip leaves a typed crop unsaved.
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
  const catalogue = useFoodCatalogue(storage);
  const [problems, setProblems] = useState<Partial<Record<GardenCropField, GardenCropProblem>>>({});
  /** The name of a listed crop the typed one would duplicate (G17). */
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const addForm = useRef<HTMLDivElement>(null);
  const [refused, setRefused] = useState(0);
  const skipHintId = useId();
  const addSave = useSave();
  const removeSave = useSave();
  const finishSave = useSave();
  const set = (patch: Partial<GardenCropDraft>) => {
    setDuplicateOf(null);
    onDraftChange({ ...draft, ...patch });
  };

  // A refused Continue moves focus to the first field of the typed crop that needs a look.
  useEffect(() => {
    if (refused > 0) focusFirstInvalid(addForm.current);
  }, [refused]);
  /**
   * The typed crop, linked as the garden screen links it (item 19 G12: a name that exactly matches
   * one food), or null with what it needs: a crop listed already is refused (G17), as on the garden
   * screen, so setup never makes a pair.
   */
  const checkTyped = (): GardenCropValue | null => {
    const ingredientId = linkFor(catalogue, { name: draft.name, picked: null, stored: null });
    const checked = checkGardenCrop({ ...draft, ingredientId });
    if (!checked.ok) {
      setProblems(checked.problems);
      setDuplicateOf(null);
      return null;
    }
    setProblems({});
    const match = duplicateOnSave(crops ?? [], checked.value, null);
    setDuplicateOf(match?.name ?? null);
    return match === null ? checked.value : null;
  };
  const add = () => {
    const crop = checkTyped();
    if (crop === null) return;
    void addSave
      .run(() => addCrop(storage, crop))
      .then((ok) => {
        if (!ok) return;
        onDraftChange(EMPTY_CROP);
        nameField.current?.focus();
      });
  };
  const finish = (addTyped: boolean) => {
    let crop: GardenCropValue | null = null;
    if (addTyped && !gardenCropDraftEmpty(draft)) {
      crop = checkTyped();
      if (crop === null) {
        setRefused((n) => n + 1);
        return;
      }
    }
    let completed = false;
    void finishSave
      .run(async () => {
        if (crop !== null) {
          await addCrop(storage, crop);
          onDraftChange(EMPTY_CROP);
        }
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
          <Button
            variant="primary"
            block
            disabled={finishSave.busy}
            onClick={() => {
              finish(true);
            }}
          >
            {garden.continue}
          </Button>
          <Button
            variant="quiet"
            disabled={finishSave.busy}
            aria-describedby={skipHintId}
            onClick={() => {
              finish(false);
            }}
          >
            {garden.skip}
          </Button>
          <p id={skipHintId} className="ui-text-muted ui-text-center">
            {garden.skipHint}
          </p>
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
                <span className="ui-text-muted">{cropDetail(crop, storage)}</span>
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
      <div ref={addForm}>
        <Card label={garden.addTitle}>
          <TextField
            ref={nameField}
            label={garden.nameLabel}
            hint={garden.nameHint}
            autoComplete="off"
            value={draft.name}
            error={
              duplicateOf === null
                ? cropError('name', problems.name)
                : fillTemplate(gardenScreen.cropForm.duplicate, { crop: duplicateOf })
            }
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
      </div>
    </FlowStepFrame>
  );
}
