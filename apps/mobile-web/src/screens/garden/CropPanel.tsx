import {
  checkGardenCrop,
  fillTemplate,
  findDuplicate,
  type GardenCropField,
  type GardenCropProblem,
  type GardenRecord,
  type GardenUnit,
  gardenProblemText,
  linkFor,
  LOCAL_DATE_MIN,
  type RefId,
} from '@diet/core';
import { garden, gardenScreen } from '@diet/core/copy/health';
import { Button, ButtonRow, ChoiceList, Notice, Switch, TextField } from '@diet/ui';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { focusFirstInvalid } from '../../onboarding/forms/profileErrors';
import type { PhotoPlatform } from '../../garden/preparePhoto';
import {
  GARDEN_UNIT_OPTIONS,
  type InventoryContext,
  numberText,
  type WriteProblem,
  writeProblemOf,
} from './inventory';
import { NameField, WriteProblemNotice } from './parts';
import { PhotoField } from './PhotoField';

const copy = gardenScreen.cropForm;

const isUnit = (value: string): value is GardenUnit =>
  value === 'g' || value === 'each' || value === 'bunch';

export interface CropPanelProps {
  readonly ctx: InventoryContext;
  /** The crop being edited, or null when adding one. */
  readonly row: GardenRecord | null;
  /** Every crop, for the duplicate check. */
  readonly rows: readonly GardenRecord[];
  readonly hasPhoto: boolean;
  readonly photoPlatform: PhotoPlatform;
  /** The form has unsaved typing (G30): the photo section waits until it is saved or cancelled. */
  readonly dirty: boolean;
  readonly onDirty: () => void;
  readonly onSaved: (id: string) => void;
  readonly onRemoved: () => void;
  readonly onCancel: () => void;
  /** The crop was removed in the meantime (another tab): the form closes and says so. */
  readonly onGone: () => void;
  readonly onEditExisting: (id: string) => void;
  /** Says something in the card's status line (photo kept, photo removed). */
  readonly onStatus: (text: string) => void;
}

/**
 * The crop form (design 1.5): add or edit, checked by core checkGardenCrop; the row links to a
 * food only by a picked suggestion or an exact name (G12); a duplicate is refused with a button to
 * edit the one listed (G17). In edit mode the photo section sits below the form and saves on its
 * own, and waits while the form has unsaved changes (G7).
 */
export function CropPanel({
  ctx,
  row,
  rows,
  hasPhoto,
  photoPlatform,
  dirty,
  onDirty,
  onSaved,
  onRemoved,
  onCancel,
  onGone,
  onEditExisting,
  onStatus,
}: CropPanelProps): ReactElement {
  const unitName = useId();
  const [name, setName] = useState(row?.name ?? '');
  const [picked, setPicked] = useState<RefId | null>(null);
  const [amount, setAmount] = useState(numberText(row?.amount ?? null));
  const [unit, setUnit] = useState<GardenUnit | null>(row?.unit ?? null);
  const [gramsPerUnit, setGramsPerUnit] = useState(numberText(row?.gramsPerUnit ?? null));
  const [harvestReady, setHarvestReady] = useState(row?.harvestReady ?? false);
  const [harvestedAt, setHarvestedAt] = useState(row?.harvestedAt ?? '');
  const [keepsDays, setKeepsDays] = useState(numberText(row?.perishabilityDays ?? null));
  const [problems, setProblems] = useState<Partial<Record<GardenCropField, GardenCropProblem>>>({});
  const [duplicate, setDuplicate] = useState<GardenRecord | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<WriteProblem | null>(null);
  const [refused, setRefused] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (refused > 0) focusFirstInvalid(form.current);
  }, [refused]);

  const stored = row === null ? null : { name: row.name, ingredientId: row.ingredientId };
  const linked = linkFor(ctx.catalogue, { name, picked, stored });
  const amountEntered = amount.trim() !== '';
  const countedUnit = unit === 'each' || unit === 'bunch' ? unit : null;
  const error = (field: GardenCropField) => {
    const found = problems[field];
    return found === undefined ? undefined : gardenProblemText(field, found);
  };
  const changed = (apply: () => void) => {
    apply();
    setDuplicate(null);
    setProblem(null);
    onDirty();
  };

  const save = async () => {
    setProblem(null);
    const checked = checkGardenCrop(
      {
        name,
        amount,
        unit,
        harvestReady,
        keepsDays,
        ingredientId: linked,
        gramsPerUnit,
        harvestedAt,
      },
      { today: ctx.today, previous: row },
    );
    if (!checked.ok) {
      setProblems(checked.problems);
      setRefused((n) => n + 1);
      return;
    }
    setProblems({});
    const match = findDuplicate(rows, checked.value, row?.id ?? null);
    if (match !== null) {
      setDuplicate(match);
      return;
    }
    setSaving(true);
    try {
      const saved =
        row === null
          ? await ctx.storage.repos.garden.create(checked.value)
          : await ctx.storage.repos.garden.update(row.id, checked.value);
      onSaved(saved.id);
    } catch (failed) {
      const found = writeProblemOf(failed);
      if (found === 'gone') onGone();
      else setProblem(found);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (row === null) return;
    setSaving(true);
    try {
      await ctx.storage.repos.garden.remove(row.id);
      onRemoved();
    } catch (failed) {
      setProblem(writeProblemOf(failed));
    } finally {
      setSaving(false);
    }
  };

  const title = row === null ? garden.addTitle : fillTemplate(copy.editTitle, { crop: row.name });
  return (
    <div className="ui-item-panel">
      <form
        ref={form}
        className="ui-card__body"
        aria-label={title}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3>{title}</h3>
        <NameField
          label={garden.nameLabel}
          hint={garden.nameHint}
          value={name}
          error={error('name')}
          catalogue={ctx.catalogue}
          linked={linked}
          onChange={(next) => {
            changed(() => {
              setName(next);
            });
          }}
          onPick={(entry) => {
            changed(() => {
              setName(entry.name);
              setPicked(entry.id);
            });
          }}
        />
        <TextField
          label={garden.amountLabel}
          hint={garden.amountHint}
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          error={error('amount')}
          onChange={(event) => {
            const next = event.currentTarget.value;
            changed(() => {
              setAmount(next);
            });
          }}
        />
        <ChoiceList
          legend={garden.unitLegend}
          name={unitName}
          options={GARDEN_UNIT_OPTIONS}
          value={unit}
          error={error('unit')}
          onChange={(value) => {
            changed(() => {
              setUnit(isUnit(value) ? value : null);
            });
          }}
        />
        {amountEntered && countedUnit !== null ? (
          <TextField
            label={copy.gramsPerUnit[countedUnit]}
            hint={copy.gramsPerUnitHint}
            inputMode="decimal"
            autoComplete="off"
            value={gramsPerUnit}
            error={error('gramsPerUnit')}
            onChange={(event) => {
              const next = event.currentTarget.value;
              changed(() => {
                setGramsPerUnit(next);
              });
            }}
          />
        ) : null}
        <Switch
          label={garden.readyLabel}
          checked={harvestReady}
          onChange={(on) => {
            changed(() => {
              setHarvestReady(on);
            });
          }}
        />
        <TextField
          label={copy.pickedOn}
          hint={copy.pickedOnHint}
          type="date"
          min={LOCAL_DATE_MIN}
          max={ctx.today}
          value={harvestedAt}
          error={error('harvestedAt')}
          onChange={(event) => {
            const next = event.currentTarget.value;
            changed(() => {
              setHarvestedAt(next);
            });
          }}
        />
        <TextField
          label={garden.keepsLabel}
          hint={copy.keepsHint}
          inputMode="numeric"
          autoComplete="off"
          value={keepsDays}
          error={error('keepsDays')}
          onChange={(event) => {
            const next = event.currentTarget.value;
            changed(() => {
              setKeepsDays(next);
            });
          }}
        />
        {duplicate === null ? null : (
          <Notice
            role="alert"
            actions={
              <Button
                onClick={() => {
                  onEditExisting(duplicate.id);
                }}
              >
                {fillTemplate(copy.editExisting, { crop: duplicate.name })}
              </Button>
            }
          >
            <p>{fillTemplate(copy.duplicate, { crop: duplicate.name })}</p>
          </Notice>
        )}
        <WriteProblemNotice problem={problem} />
        {confirmRemove && row !== null ? (
          <Notice
            actions={
              <ButtonRow>
                <Button
                  variant="caution"
                  disabled={saving || ctx.closed}
                  onClick={() => void remove()}
                >
                  {copy.removeYes}
                </Button>
                <Button
                  onClick={() => {
                    setConfirmRemove(false);
                  }}
                >
                  {copy.removeNo}
                </Button>
              </ButtonRow>
            }
          >
            <p>
              {fillTemplate(hasPhoto ? copy.removeConfirmWithPhoto : copy.removeConfirm, {
                crop: row.name,
              })}
            </p>
          </Notice>
        ) : (
          <ButtonRow>
            <Button type="submit" variant="primary" disabled={saving || ctx.closed}>
              {copy.save}
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              {copy.cancel}
            </Button>
            {row === null ? null : (
              <Button
                variant="caution"
                onClick={() => {
                  setConfirmRemove(true);
                }}
              >
                {copy.remove}
              </Button>
            )}
          </ButtonRow>
        )}
      </form>
      {row === null ? null : (
        <PhotoField
          ctx={ctx}
          gardenId={row.id}
          cropName={row.name}
          platform={photoPlatform}
          waitForForm={dirty}
          onStatus={onStatus}
        />
      )}
    </div>
  );
}
