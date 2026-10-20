/**
 * Drink presets (UX 5a "Edit presets"; item 28 design 2.4; AL-02, NN-01, C31, C92, D42; A17 to
 * A19, A42). The form's state is core's PresetFormState, so the label figures always belong to the
 * size and strength they were filled or typed for: changing either clears them at once and says
 * what they were for. A label figure that disagrees with the calculation, or energy lower than
 * the alcohol alone would give, needs a second tap ("Save anyway"); no message ever shows an
 * energy figure worked out from the ABV. Presets are hidden, never deleted (A19). A form that
 * opens takes focus on its first field, and hands it back to its Edit button when it closes.
 */
import {
  type BeverageRecord,
  fillTemplate,
  type LabelCheck,
  labelCheck,
  type PresetFieldProblem,
  presetFields,
  presetFormInit,
  type PresetFormEvent,
  presetFormProblems,
  type PresetFormState,
  presetFormStep,
  presetFormView,
  presetSummary,
} from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, Notice, SegmentedControl, TextField } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatMeasure, formatStd2 } from '../../format';
import { WriteError } from '../today/WriteError';
import { figureNotes, presetSummaryText } from './drinksText';
import { nextSortOrder } from './drinkForm';
import { useFocusNext } from './focus';
import { useDrinksWrite } from './useDrinksWrite';
import type { DrinksView } from './view';

const p = alcohol.presets;

function problemText(problem: PresetFieldProblem, unit: 'kcal' | 'kJ'): string {
  switch (problem) {
    case 'name':
      return p.errors.name;
    case 'volume':
      return alcohol.log.errors.volume;
    case 'abv':
      return alcohol.log.errors.abv;
    case 'number':
      return alcohol.log.errors.number;
    case 'energy':
      return unit === 'kcal' ? p.errors.energyKcal : p.errors.energyKj;
    case 'std':
      return p.errors.std;
  }
}

/** The checks on the label a save would store, when that label counts for the saved measure. */
function checksOf(stored: BeverageRecord | null, state: PresetFormState): LabelCheck | null {
  const fields = presetFields(stored, state);
  const { label } = fields;
  if (
    label === null ||
    label.volumeMl !== fields.volumeMl ||
    label.abvPercent !== fields.abvPercent
  ) {
    return null;
  }
  return labelCheck(
    { volumeMl: fields.volumeMl, abvPercent: fields.abvPercent },
    label.standardDrinks,
    label.kcal,
  );
}

function PresetForm({
  storage,
  stored,
  sortOrder,
  onSaved,
  onCancel,
}: {
  readonly storage: AppStorage;
  readonly stored: BeverageRecord | null;
  readonly sortOrder: number;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const write = useDrinksWrite();
  const [state, setState] = useState(() => presetFormInit(stored));
  const [problems, setProblems] = useState<ReturnType<typeof presetFormProblems>>({});
  const [warned, setWarned] = useState(false);
  const view = presetFormView(state, stored);
  const step = (event: PresetFormEvent): void => {
    setState((s) => presetFormStep(s, event, stored));
    setWarned(false);
  };
  const nameField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameField.current?.focus();
  }, []);
  const checks = warned ? checksOf(stored, state) : null;
  const flagged = checks !== null && (checks.stdDisagrees || checks.kcalImplausible);

  const save = async (): Promise<void> => {
    const found = presetFormProblems(state);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    const check = checksOf(stored, state);
    if (!warned && check !== null && (check.stdDisagrees || check.kcalImplausible)) {
      setWarned(true);
      return;
    }
    const fields = presetFields(stored, state);
    const done = await write.run(() =>
      stored === null
        ? storage.repos.beverages.create({ ...fields, sortOrder, archived: false })
        : storage.repos.beverages.update(stored.id, fields),
    );
    if (done !== null) onSaved();
  };

  const error = (key: keyof typeof problems): string | undefined => {
    const problem = problems[key];
    return problem === undefined ? undefined : problemText(problem, state.energyUnit);
  };
  const noMeasure = view.measure === null;
  return (
    <div className="ui-subpanel">
      <TextField
        ref={nameField}
        label={p.nameLabel}
        autoComplete="off"
        value={state.name}
        error={error('name')}
        onChange={(event) => {
          step({ kind: 'name', text: event.currentTarget.value });
        }}
      />
      <div className="ui-field-pair">
        <TextField
          label={p.volumeLabel}
          inputMode="decimal"
          autoComplete="off"
          value={state.volumeText}
          error={error('volume')}
          onChange={(event) => {
            step({ kind: 'volume', text: event.currentTarget.value });
          }}
        />
        <TextField
          label={p.abvLabel}
          inputMode="decimal"
          autoComplete="off"
          value={state.abvText}
          error={error('abv')}
          onChange={(event) => {
            step({ kind: 'abv', text: event.currentTarget.value });
          }}
        />
      </div>
      <fieldset className="ui-subpanel">
        <legend className="ui-field__label">{p.labelTitle}</legend>
        <p className="ui-text-muted">{p.labelIntro}</p>
        <TextField
          label={p.energyLabel}
          inputMode="decimal"
          autoComplete="off"
          disabled={noMeasure}
          value={state.energyText}
          error={error('energy')}
          onChange={(event) => {
            step({ kind: 'energy', text: event.currentTarget.value });
          }}
        />
        <SegmentedControl
          legend={p.energyUnit}
          options={[
            { value: 'kcal', label: p.kcal },
            { value: 'kJ', label: p.kj },
          ]}
          value={state.energyUnit}
          disabled={noMeasure}
          onChange={(unit) => {
            step({ kind: 'unit', unit });
          }}
        />
        <TextField
          label={p.stdLabel}
          inputMode="decimal"
          autoComplete="off"
          disabled={noMeasure}
          value={state.stdText}
          error={error('std')}
          onChange={(event) => {
            step({ kind: 'std', text: event.currentTarget.value });
          }}
        />
        {view.canConfirm ? (
          <>
            <p className="ui-text-muted">{p.presetDefault}</p>
            <Button
              variant="quiet"
              onClick={() => {
                step({ kind: 'confirm' });
              }}
            >
              {p.matchesLabel}
            </Button>
          </>
        ) : null}
        {state.labelConfirmed ? <p>{p.confirmed}</p> : null}
        {view.labelWasFor === null ? null : (
          <p data-testid="label-was-for">
            {fillTemplate(p.labelWasFor, {
              volume: formatMeasure(view.labelWasFor.volumeMl),
              abv: formatMeasure(view.labelWasFor.abvPercent),
            })}
          </p>
        )}
      </fieldset>
      {checks?.stdDisagrees === true ? (
        <Notice role="alert">
          <p>{fillTemplate(p.stdDisagrees, { calculated: formatStd2(checks.calculatedStd) })}</p>
        </Notice>
      ) : null}
      {checks?.kcalImplausible === true ? (
        <Notice role="alert">
          <p>{p.kcalImplausible}</p>
        </Notice>
      ) : null}
      <ButtonRow>
        <Button variant="primary" aria-disabled={write.busy} onClick={() => void save()}>
          {flagged ? p.saveAnyway : p.save}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            write.clear();
            onCancel();
          }}
        >
          {p.cancel}
        </Button>
      </ButtonRow>
      <WriteError write={write} />
    </div>
  );
}

export function PresetEditor({
  storage,
  view,
  onDone,
}: {
  readonly storage: AppStorage;
  readonly view: DrinksView;
  readonly onDone: () => void;
}): ReactElement {
  const write = useDrinksWrite();
  const focusNext = useFocusNext();
  const [editing, setEditing] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [saved, setSaved] = useState(false);
  const openers = useRef(new Map<string, HTMLButtonElement>());
  const sortOrder = nextSortOrder([...view.presets, ...view.hiddenPresets]);
  const archive = (preset: BeverageRecord, archived: boolean): void => {
    void write.run(() => storage.repos.beverages.update(preset.id, { archived }));
  };
  const closeForm = (didSave: boolean) => () => {
    const opener = editing;
    setEditing(null);
    setSaved(didSave);
    if (opener !== null) focusNext(() => openers.current.get(opener));
  };
  const form = (stored: BeverageRecord | null) => (
    <PresetForm
      key={stored?.id ?? 'new'}
      storage={storage}
      stored={stored}
      sortOrder={sortOrder}
      onSaved={closeForm(true)}
      onCancel={closeForm(false)}
    />
  );
  return (
    <Card label={p.cardLabel}>
      <ul className="ui-drinks-entries">
        {view.presets.map((preset) => (
          <li key={preset.id}>
            <p className="ui-text-strong">{presetSummaryText(preset)}</p>
            {[
              ...(presetSummary(preset).presetDefault ? [p.presetDefault] : []),
              ...figureNotes(presetSummary(preset)),
            ].map((note) => (
              <p key={note} className="ui-text-muted">
                {note}
              </p>
            ))}
            {editing === preset.id ? (
              form(preset)
            ) : (
              <ButtonRow>
                <Button
                  ref={(button) => {
                    if (button === null) openers.current.delete(preset.id);
                    else openers.current.set(preset.id, button);
                  }}
                  aria-label={fillTemplate(p.editFor, { name: preset.name })}
                  onClick={() => {
                    setEditing(preset.id);
                    setSaved(false);
                  }}
                >
                  {p.edit}
                </Button>
                <Button
                  variant="quiet"
                  aria-label={fillTemplate(p.hideFor, { name: preset.name })}
                  aria-disabled={write.busy}
                  onClick={() => {
                    archive(preset, true);
                  }}
                >
                  {p.hide}
                </Button>
              </ButtonRow>
            )}
          </li>
        ))}
      </ul>
      <p className="ui-text-muted">{p.hiddenNote}</p>
      {editing === 'new' ? (
        form(null)
      ) : (
        <Button
          ref={(button) => {
            if (button === null) openers.current.delete('new');
            else openers.current.set('new', button);
          }}
          onClick={() => {
            setEditing('new');
            setSaved(false);
          }}
        >
          {p.add}
        </Button>
      )}
      {view.hiddenPresets.length === 0 ? null : (
        <Button
          variant="quiet"
          aria-expanded={showHidden}
          onClick={() => {
            setShowHidden((open) => !open);
          }}
        >
          {p.showHidden}
        </Button>
      )}
      {showHidden && view.hiddenPresets.length > 0 ? (
        <>
          <h3 className="ui-text-strong">{p.hiddenTitle}</h3>
          <ul className="ui-drinks-entries">
            {view.hiddenPresets.map((preset) => (
              <li key={preset.id} className="ui-drinks-entry">
                <span>{presetSummaryText(preset)}</span>
                <Button
                  variant="quiet"
                  aria-disabled={write.busy}
                  onClick={() => {
                    archive(preset, false);
                  }}
                >
                  {p.unhide}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p role="status" className="ui-status-line">
        {saved ? p.saved : ''}
      </p>
      <WriteError write={write} />
      <Button variant="primary" onClick={onDone}>
        {p.done}
      </Button>
    </Card>
  );
}
