import {
  checkPantryItem,
  fillTemplate,
  findDuplicate,
  type FormProblem,
  gardenProblemText,
  linkFor,
  type PantryField,
  type PantryRecord,
  type PantryUnit,
  type RefId,
} from '@diet/core';
import { gardenScreen } from '@diet/core/copy/health';
import { Button, ButtonRow, ChoiceList, Notice, TextField } from '@diet/ui';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { focusFirstInvalid } from '../../onboarding/forms/profileErrors';
import {
  type InventoryContext,
  numberText,
  PANTRY_UNIT_OPTIONS,
  type WriteProblem,
  writeProblemOf,
} from './inventory';
import { NameField, WriteProblemNotice } from './parts';

const copy = gardenScreen.pantryForm;

const isUnit = (value: string): value is PantryUnit =>
  value === 'g' || value === 'ml' || value === 'each';

/**
 * A pantry item (design 1.7; G29): an empty amount is "some, not measured", 0 is none left, and
 * the unit is required whenever an amount is entered, including 0. No photo for pantry items (G7).
 */
export function PantryForm({
  ctx,
  row,
  rows,
  onDirty,
  onSaved,
  onRemoved,
  onCancel,
  onGone,
  onEditExisting,
}: {
  readonly ctx: InventoryContext;
  readonly row: PantryRecord | null;
  readonly rows: readonly PantryRecord[];
  readonly onDirty: () => void;
  readonly onSaved: (id: string) => void;
  readonly onRemoved: () => void;
  readonly onCancel: () => void;
  readonly onGone: () => void;
  readonly onEditExisting: (id: string) => void;
}): ReactElement {
  const unitName = useId();
  const [name, setName] = useState(row?.name ?? '');
  const [picked, setPicked] = useState<RefId | null>(null);
  const [amount, setAmount] = useState(numberText(row?.amount ?? null));
  const [unit, setUnit] = useState<PantryUnit | null>(row?.unit ?? null);
  const [problems, setProblems] = useState<Partial<Record<PantryField, FormProblem>>>({});
  const [duplicate, setDuplicate] = useState<PantryRecord | null>(null);
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
  const error = (field: PantryField) => {
    const found = problems[field];
    return found === undefined ? undefined : gardenProblemText(field, found, 'pantry');
  };
  const changed = (apply: () => void) => {
    apply();
    setDuplicate(null);
    setProblem(null);
    onDirty();
  };

  const save = async () => {
    setProblem(null);
    const checked = checkPantryItem({ name, ingredientId: linked, amount, unit });
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
          ? await ctx.storage.repos.pantry.create(checked.value)
          : await ctx.storage.repos.pantry.update(row.id, checked.value);
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
      await ctx.storage.repos.pantry.remove(row.id);
      onRemoved();
    } catch (failed) {
      setProblem(writeProblemOf(failed));
    } finally {
      setSaving(false);
    }
  };

  const title = row === null ? copy.addTitle : fillTemplate(copy.editTitle, { item: row.name });
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
          label={copy.name}
          hint={copy.nameHint}
          value={name}
          error={error('name')}
          catalogue={ctx.catalogue}
          linked={linked}
          gardenFirst={false}
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
          label={copy.amount}
          hint={copy.amountHint}
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
          legend={copy.unitLegend}
          name={unitName}
          options={PANTRY_UNIT_OPTIONS}
          value={unit}
          error={error('unit')}
          onChange={(value) => {
            changed(() => {
              setUnit(isUnit(value) ? value : null);
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
                {fillTemplate(copy.editExisting, { item: duplicate.name })}
              </Button>
            }
          >
            <p>{fillTemplate(copy.duplicate, { item: duplicate.name })}</p>
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
            <p>{fillTemplate(copy.removeConfirm, { item: row.name })}</p>
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
    </div>
  );
}
