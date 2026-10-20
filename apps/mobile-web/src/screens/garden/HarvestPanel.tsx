import {
  amountText,
  applyHarvest,
  calendarDateText,
  checkHarvest,
  checkName,
  fillTemplate,
  findDuplicate,
  type FormProblem,
  type GardenFields,
  type GardenRecord,
  type GardenUnit,
  gardenProblemText,
  type HarvestDraft,
  harvestAsNewCrop,
  type HarvestMode,
  harvestModes,
  harvestNoticeText,
  linkFor,
  listedNowText,
  LOCAL_DATE_MIN,
  provisionalHarvest,
  type RefId,
} from '@diet/core';
import { garden, gardenScreen } from '@diet/core/copy/health';
import { Button, ButtonRow, ChoiceList, Notice, TextField } from '@diet/ui';
import { type ReactElement, type Ref, useEffect, useId, useRef, useState } from 'react';
import { focusFirstInvalid } from '../../onboarding/forms/profileErrors';
import {
  byName,
  GARDEN_UNIT_OPTIONS,
  type InventoryContext,
  numberText,
  type WriteProblem,
  writeProblemOf,
} from './inventory';
import { NameField, WriteProblemNotice } from './parts';

const copy = gardenScreen.harvest;
/** The "Another crop" choice in the crop group. */
const ANOTHER = 'another';

const isUnit = (value: string): value is GardenUnit =>
  value === 'g' || value === 'each' || value === 'bunch';

type HarvestField = keyof HarvestDraft | 'crop' | 'name';

/** Usable crops first, then the rest, each by name (design 1.6 step 1). */
function cropOrder(rows: readonly GardenRecord[]): GardenRecord[] {
  return [...rows].sort((a, b) => Number(b.harvestReady) - Number(a.harvestReady) || byName(a, b));
}

/**
 * Add harvest (design 1.6; G14): which crop, how much was picked and when, and, when an amount is
 * listed already, whether to add to it or replace it, asked with no default. Adding is offered
 * only when the listed amount was ready and is in the same unit and weight; every replace says
 * the earlier pick is treated as used up and from which day days left count.
 */
export function HarvestPanel({
  ctx,
  rows,
  firstControlRef,
  onDirty,
  onSaved,
  onCancel,
  onGone,
}: {
  readonly ctx: InventoryContext;
  readonly rows: readonly GardenRecord[];
  readonly firstControlRef?: Ref<HTMLInputElement> | undefined;
  readonly onDirty: () => void;
  readonly onSaved: (id: string, message: string) => void;
  readonly onCancel: () => void;
  readonly onGone: () => void;
}): ReactElement {
  const ids = { crop: useId(), unit: useId(), mode: useId() };
  const crops = cropOrder(rows);
  const only = crops.length === 1 ? (crops[0] ?? null) : null;
  const [choice, setChoice] = useState<string | null>(
    crops.length === 0 ? ANOTHER : (only?.id ?? null),
  );
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<RefId | null>(null);
  const [draft, setDraft] = useState<HarvestDraft>({
    amount: '',
    unit: only?.unit ?? null,
    gramsPerUnit: numberText(only?.gramsPerUnit ?? null),
    pickedOn: ctx.today,
  });
  const [mode, setMode] = useState<HarvestMode | null>(null);
  const [problems, setProblems] = useState<Partial<Record<HarvestField, FormProblem>>>({});
  const [modeError, setModeError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<GardenRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<WriteProblem | null>(null);
  const [refused, setRefused] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (refused > 0) focusFirstInvalid(form.current);
  }, [refused]);

  const row =
    choice === null || choice === ANOTHER ? null : (rows.find((r) => r.id === choice) ?? null);
  const linked = linkFor(ctx.catalogue, { name, picked, stored: null });
  const provisional = provisionalHarvest(draft, ctx.today);
  const modes = row === null ? null : harvestModes(row, provisional);
  const notices = row === null ? [] : harvestNoticeText(row, provisional, mode, ctx.today);
  const countedUnit = draft.unit === 'each' || draft.unit === 'bunch' ? draft.unit : null;

  const changed = (apply: () => void) => {
    apply();
    setDuplicate(null);
    setProblem(null);
    setModeError(null);
    onDirty();
  };
  const setField = (patch: Partial<HarvestDraft>) => {
    changed(() => {
      setDraft((d) => ({ ...d, ...patch }));
    });
  };
  const choose = (value: string) => {
    changed(() => {
      setChoice(value);
      setMode(null);
      const chosen = rows.find((r) => r.id === value);
      if (chosen !== undefined) {
        setDraft((d) => ({
          ...d,
          unit: chosen.unit ?? d.unit,
          gramsPerUnit: numberText(chosen.gramsPerUnit),
        }));
      }
    });
  };
  const error = (field: HarvestField) => {
    const found = problems[field];
    if (found === undefined) return undefined;
    if (field === 'crop') return copy.cropRequired;
    return gardenProblemText(field, found);
  };

  const write = async (target: GardenRecord | null, fields: GardenFields) => {
    setSaving(true);
    try {
      const saved =
        target === null
          ? await ctx.storage.repos.garden.create(fields)
          : await ctx.storage.repos.garden.update(target.id, fields);
      onSaved(
        saved.id,
        fillTemplate(copy.saved, { crop: saved.name, amount: amountText(saved, 'garden') }),
      );
    } catch (failed) {
      const found = writeProblemOf(failed);
      if (found === 'gone') onGone();
      else setProblem(found);
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    setProblem(null);
    setModeError(null);
    const found: Partial<Record<HarvestField, FormProblem>> = {};
    if (choice === null) found.crop = 'required';
    const nameCheck = choice === ANOTHER ? checkName(name) : null;
    if (nameCheck?.problem !== undefined) found.name = nameCheck.problem;
    const checked = checkHarvest(draft, ctx.today);
    if (!checked.ok) Object.assign(found, checked.problems);
    if (Object.keys(found).length > 0 || !checked.ok) {
      setProblems(found);
      setRefused((n) => n + 1);
      return;
    }
    setProblems({});
    if (row !== null) {
      const allowed = harvestModes(row, checked.value).modes;
      const chosenMode = allowed.length === 1 ? 'replace' : mode;
      if (chosenMode === null) {
        setModeError(copy.modeRequired);
        return;
      }
      const applied = applyHarvest(row, checked.value, chosenMode);
      if (!applied.ok) {
        setModeError(
          applied.error === 'too-much'
            ? fillTemplate(copy.tooMuch, { units: gardenScreen.unitWords[row.unit ?? 'g'] })
            : copy.modeRequired,
        );
        return;
      }
      void write(row, applied.fields);
      return;
    }
    const typed = nameCheck?.value ?? '';
    const match = findDuplicate(rows, { ingredientId: linked, name: typed }, null);
    if (match !== null) {
      setDuplicate(match);
      return;
    }
    void write(null, harvestAsNewCrop(typed, linked, checked.value));
  };

  // Adding keeps the earlier picked date (G14), so the add choice names it.
  const addDate =
    row === null || row.harvestedAt === null
      ? null
      : calendarDateText(
          row.harvestedAt < provisional.pickedOn ? row.harvestedAt : provisional.pickedOn,
          ctx.today,
        );
  return (
    <div className="ui-item-panel">
      <form
        ref={form}
        className="ui-card__body"
        aria-label={copy.title}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <h3>{copy.title}</h3>
        {crops.length === 0 ? null : (
          <ChoiceList
            legend={copy.whichCrop}
            name={ids.crop}
            options={[
              ...crops.map((c) => ({ value: c.id, label: c.name })),
              { value: ANOTHER, label: copy.anotherCrop },
            ]}
            value={choice}
            error={error('crop')}
            firstInputRef={firstControlRef}
            onChange={choose}
          />
        )}
        {choice === ANOTHER ? (
          <NameField
            label={garden.nameLabel}
            hint={garden.nameHint}
            value={name}
            error={error('name')}
            catalogue={ctx.catalogue}
            linked={linked}
            inputRef={crops.length === 0 ? firstControlRef : undefined}
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
        ) : null}
        {duplicate === null ? null : (
          <Notice
            role="alert"
            actions={
              <Button
                onClick={() => {
                  choose(duplicate.id);
                }}
              >
                {fillTemplate(copy.useExisting, { crop: duplicate.name })}
              </Button>
            }
          >
            <p>{fillTemplate(gardenScreen.cropForm.duplicate, { crop: duplicate.name })}</p>
          </Notice>
        )}
        {row === null ? null : <p className="ui-text-muted">{listedNowText(row, ctx.today)}</p>}
        <TextField
          label={copy.howMuch}
          hint={copy.howMuchHint}
          inputMode="decimal"
          autoComplete="off"
          value={draft.amount}
          error={error('amount')}
          onChange={(event) => {
            setField({ amount: event.currentTarget.value });
          }}
        />
        <ChoiceList
          legend={garden.unitLegend}
          name={ids.unit}
          options={GARDEN_UNIT_OPTIONS}
          value={draft.unit}
          error={error('unit')}
          onChange={(value) => {
            setField({ unit: isUnit(value) ? value : null });
          }}
        />
        {draft.amount.trim() !== '' && countedUnit !== null ? (
          <TextField
            label={gardenScreen.cropForm.gramsPerUnit[countedUnit]}
            hint={gardenScreen.cropForm.gramsPerUnitHint}
            inputMode="decimal"
            autoComplete="off"
            value={draft.gramsPerUnit}
            error={error('gramsPerUnit')}
            onChange={(event) => {
              setField({ gramsPerUnit: event.currentTarget.value });
            }}
          />
        ) : null}
        <TextField
          label={copy.pickedOn}
          hint={copy.pickedOnHint}
          type="date"
          min={LOCAL_DATE_MIN}
          max={ctx.today}
          value={draft.pickedOn}
          error={error('pickedOn')}
          onChange={(event) => {
            setField({ pickedOn: event.currentTarget.value });
          }}
        />
        {modes !== null && modes.modes.length === 2 ? (
          <ChoiceList
            legend={copy.modeLegend}
            name={ids.mode}
            options={[
              {
                value: 'add',
                label:
                  addDate === null
                    ? copy.modeAddNoDate
                    : fillTemplate(copy.modeAdd, { date: addDate }),
              },
              { value: 'replace', label: copy.modeReplace },
            ]}
            value={mode}
            error={modeError ?? undefined}
            onChange={(value) => {
              changed(() => {
                setMode(value === 'add' ? 'add' : 'replace');
              });
            }}
          />
        ) : modeError === null ? null : (
          <Notice role="alert">
            <p>{modeError}</p>
          </Notice>
        )}
        {notices.length === 0 ? null : (
          <Notice tone="info">
            {notices.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </Notice>
        )}
        <WriteProblemNotice problem={problem} />
        <ButtonRow>
          <Button type="submit" variant="primary" disabled={saving || ctx.closed}>
            {copy.save}
          </Button>
          <Button variant="quiet" onClick={onCancel}>
            {copy.cancel}
          </Button>
        </ButtonRow>
      </form>
    </div>
  );
}
