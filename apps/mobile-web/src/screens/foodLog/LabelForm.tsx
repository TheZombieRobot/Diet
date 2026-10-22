/**
 * The label form and the amount step (item 23 design 1.3.3 to 1.3.5; C01, C11, C31, C67, C68,
 * H23c, HS-32). Every figure field starts empty and names its measure ("Protein, g per 100 g");
 * nothing is preselected for what the label describes or how the food was weighed. Names from
 * the app's food list fill only the name, never a figure. Core's parseLabelForm and parseAmount
 * decide every problem and check; the repository runs the same rules again.
 */
import {
  type AmountCheck,
  type AmountField,
  type AmountProblem,
  type Catalogue,
  type FoodDataOk,
  type LabelField,
  type LabelFormCheck,
  type LabelFormInput,
  type LabelPer,
  type NutrientBasis,
  parseOptionalNumber,
  searchFoods,
  twinOf,
  weighingChoices,
  fillTemplate,
  formatNumber,
  roundTo,
} from '@diet/core';
import { foodLog } from '@diet/core/copy/health';
import { Button, CheckList, Checkbox, ChoiceList, Notice, Switch, TextField } from '@diet/ui';
import { Fragment, type ReactElement, useId } from 'react';
import type { AmountInput } from './logContext';
import { amountProblemText, type LabelFieldErrors } from './text';

const label = foodLog.label;
const amountCopy = foodLog.amount;

const FIGURES = [
  ['energy', 'energy'],
  ['proteinG', 'protein'],
  ['fatG', 'fat'],
  ['saturatedFatG', 'saturatedFat'],
  ['carbsG', 'carbs'],
  ['sugarsG', 'sugars'],
] as const;

const BASES: readonly NutrientBasis[] = ['raw', 'as-sold', 'cooked'];

/** "Protein, g per 100 g", "Energy, kcal per serve". */
function fieldLabel(name: string, unit: string, per: LabelPer): string {
  return fillTemplate(label.fieldLabel, { name, unit, measure: label.measures[per] });
}

/** A figure field's "= 30 g per 250 g serve" hint, worked out live, in the change form. */
function perServeHint(text: string, unit: string, serving: string): string | undefined {
  try {
    const value = parseOptionalNumber(text);
    const size = parseOptionalNumber(serving);
    if (value === undefined || size === undefined || size <= 0) return undefined;
    return fillTemplate(label.perServeHint, {
      value: `${formatNumber(roundTo((value * size) / 100, 1))} ${unit}`,
      serving: formatNumber(size),
    });
  } catch {
    return undefined;
  }
}

export function LabelFields({
  value,
  onChange,
  errors,
  changeForm,
  catalogue,
  data,
  disabled,
}: {
  readonly value: LabelFormInput;
  readonly onChange: (next: LabelFormInput) => void;
  readonly errors: LabelFieldErrors;
  /** The change form: per 100 g in kJ, and switching Per or the energy unit clears the figures. */
  readonly changeForm: boolean;
  /** Item 18's catalogue, for names only; null while it loads. */
  readonly catalogue: Catalogue | null;
  readonly data: FoodDataOk | null;
  readonly disabled: boolean;
}): ReactElement {
  const id = useId();
  const set = (patch: Partial<LabelFormInput>) => {
    onChange({ ...value, ...patch, confirmed: [] });
  };
  /** Switching Per or the unit on the change form clears every figure (nothing is rescaled). */
  const switchMeasure = (patch: Partial<LabelFormInput>) => {
    set(
      changeForm
        ? {
            ...patch,
            energy: '',
            proteinG: '',
            fatG: '',
            saturatedFatG: '',
            carbsG: '',
            sugarsG: '',
            fibreG: '',
            sodiumMg: '',
          }
        : patch,
    );
  };
  const typed = value.name.trim();
  const suggestions =
    changeForm || catalogue === null || typed.length < 2
      ? []
      : searchFoods(catalogue.entries, typed, { limit: 6 }).filter((e) => e.id.startsWith('seed:'));
  const picked = catalogue?.entries.find((e) => e.id.startsWith('seed:') && e.name === typed);
  const twin = picked !== undefined && data !== null ? twinOf(data, picked.id) : null;
  const unitG = label.units.g;
  const hintFor = (text: string, unit: string) =>
    changeForm && value.per === '100g' ? perServeHint(text, unit, value.servingSizeG) : undefined;
  const figureField = (field: LabelField & keyof LabelFormInput, name: string, unit: string) => (
    <TextField
      key={field}
      label={fieldLabel(name, unit, value.per)}
      inputMode="decimal"
      autoComplete="off"
      value={value[field] as string}
      error={errors[field]}
      hint={hintFor(value[field] as string, unit)}
      disabled={disabled}
      onChange={(e) => {
        set({ [field]: e.currentTarget.value });
      }}
    />
  );
  return (
    <>
      {changeForm ? <p className="ui-text-muted">{label.changeShownPer100}</p> : null}
      <p className="ui-text-muted">{label.lessThanHint}</p>
      <TextField
        label={label.name}
        hint={label.nameHint}
        autoComplete="off"
        value={value.name}
        error={errors.name}
        disabled={disabled}
        onChange={(e) => {
          set({ name: e.currentTarget.value });
        }}
      />
      {suggestions.length === 0 ? null : (
        <div>
          <p className="ui-text-muted">{label.nameMatches}</p>
          {suggestions.map((s) => (
            <Button
              key={s.id}
              variant="quiet"
              onClick={() => {
                // The name only: the figures always come from the owner's label (H23c).
                set({ name: s.name });
              }}
            >
              {s.name}
            </Button>
          ))}
          <p className="ui-text-muted">{label.figuresYours}</p>
        </div>
      )}
      {twin === null ? null : <p className="ui-text-muted">{label.twinHint}</p>}
      <ChoiceList
        legend={label.describes}
        name={`${id}-describes`}
        options={BASES.map((b) => ({
          value: b,
          label: label.describesOptions[b],
          detail: label.describesDetails[b],
        }))}
        value={value.describes}
        error={errors.describes}
        disabled={disabled}
        onChange={(v) => {
          set({ describes: v as NutrientBasis });
        }}
      />
      <ChoiceList
        legend={label.per}
        name={`${id}-per`}
        hint={label.perHint}
        layout="inline"
        options={(['100g', 'serve'] as const).map((p) => ({
          value: p,
          label: label.perOptions[p],
        }))}
        value={value.per}
        disabled={disabled}
        onChange={(v) => {
          switchMeasure({ per: v as LabelPer });
        }}
      />
      <TextField
        label={label.servingSize}
        hint={label.servingSizeHint}
        inputMode="decimal"
        autoComplete="off"
        value={value.servingSizeG}
        error={errors.servingSizeG}
        disabled={disabled}
        onChange={(e) => {
          set({ servingSizeG: e.currentTarget.value });
        }}
      />
      {changeForm && value.servingSizeG !== '' ? (
        <p className="ui-text-muted">{label.servingChangeNote}</p>
      ) : null}
      <ChoiceList
        legend={label.energyUnit}
        name={`${id}-unit`}
        layout="inline"
        options={(['kJ', 'kcal'] as const).map((u) => ({ value: u, label: label.energyUnits[u] }))}
        value={value.energyUnit}
        disabled={disabled}
        onChange={(v) => {
          switchMeasure({ energyUnit: v as 'kJ' | 'kcal' });
        }}
      />
      {FIGURES.map(([field, name]) =>
        figureField(field, label.names[name], field === 'energy' ? value.energyUnit : unitG),
      )}
      <Switch
        label={label.overseas}
        hint={label.overseasHint}
        checked={value.overseas}
        disabled={disabled}
        onChange={(on) => {
          set({ overseas: on });
        }}
      />
      {value.fibreNotOnLabel ? null : figureField('fibreG', label.names.fibre, unitG)}
      <Checkbox
        label={label.fibreNotOnLabel}
        checked={value.fibreNotOnLabel}
        disabled={disabled}
        onChange={(on) => {
          set({ fibreNotOnLabel: on, fibreG: '' });
        }}
      />
      <p className="ui-field__hint">{label.fibreHint}</p>
      {figureField('sodiumMg', label.names.sodium, label.units.mg)}
      <p className="ui-field__hint">{label.sodiumHint}</p>
      <TextField
        label={label.packSize}
        hint={label.packSizeHint}
        inputMode="decimal"
        autoComplete="off"
        value={value.packSizeG}
        error={errors.packSizeG}
        disabled={disabled}
        onChange={(e) => {
          set({ packSizeG: e.currentTarget.value });
        }}
      />
      {errors.form === undefined ? null : (
        <Notice tone="amber" role="alert">
          <p>{errors.form}</p>
        </Notice>
      )}
    </>
  );
}

/** One tick for one group of label checks (design 1.3.3). */
export function LabelChecks({
  checks,
  confirmed,
  onConfirm,
  showErrors,
  onUseEarlier,
}: {
  readonly checks: readonly LabelFormCheck[];
  readonly confirmed: readonly LabelFormCheck['kind'][];
  readonly onConfirm: (kinds: LabelFormCheck['kind'][], on: boolean) => void;
  readonly showErrors: boolean;
  readonly onUseEarlier: (id: string) => void;
}): ReactElement | null {
  if (checks.length === 0) return null;
  const groups: {
    readonly kinds: LabelFormCheck['kind'][];
    readonly lines: string[];
    readonly legend: string;
    readonly box: string;
    readonly extra?: ReactElement;
  }[] = [];
  for (const check of checks) {
    if (check.kind === 'energy-mismatch') {
      groups.push({
        kinds: ['energy-mismatch'],
        lines: [
          fillTemplate(label.checkEnergy, {
            computed: formatNumber(check.computed),
            entered: formatNumber(check.entered),
            unit: check.unit,
            measure: label.measures[check.per],
          }),
        ],
        legend: label.checkEnergyLegend,
        box: label.confirmEnergy,
      });
    }
  }
  const parts = checks.filter(
    (c) => c.kind === 'sat-fat-over-fat' || c.kind === 'sugars-over-carbs',
  );
  if (parts.length > 0)
    groups.push({
      kinds: parts.map((c) => c.kind),
      lines: parts.map((c) =>
        c.kind === 'sat-fat-over-fat' ? label.checkSatFat : label.checkSugars,
      ),
      legend: label.checkPartsLegend,
      box: label.confirmParts,
    });
  if (checks.some((c) => c.kind === 'sounds-like-alcohol'))
    groups.push({
      kinds: ['sounds-like-alcohol'],
      lines: [label.checkAlcohol],
      legend: label.checkAlcoholLegend,
      box: label.confirmFood,
    });
  const same = checks.find((c) => c.kind === 'same-name');
  if (same?.kind === 'same-name')
    groups.push({
      kinds: ['same-name'],
      lines: [fillTemplate(label.checkSameName, { name: same.otherName })],
      legend: label.checkSameNameLegend,
      box: label.confirmNewFood,
      extra: (
        <Button
          variant="secondary"
          onClick={() => {
            onUseEarlier(same.otherId);
          }}
        >
          {label.useEarlier}
        </Button>
      ),
    });
  return (
    <>
      {groups.map((g) => {
        const ticked = g.kinds.every((k) => confirmed.includes(k));
        return (
          <Fragment key={g.legend}>
            <Notice tone="amber">
              {g.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {g.extra}
            </Notice>
            <CheckList
              legend={g.legend}
              options={[{ value: 'ok', label: g.box }]}
              values={ticked ? ['ok'] : []}
              error={showErrors && !ticked ? label.errors.confirmNeeded : undefined}
              onChange={(values) => {
                onConfirm(g.kinds, values.includes('ok'));
              }}
            />
          </Fragment>
        );
      })}
    </>
  );
}

/** The amount step of a label food (design 1.3.5): how it was weighed is always asked. */
export function AmountFields({
  value,
  onChange,
  basis,
  servingSizeG,
  problems,
  disabled,
}: {
  readonly value: AmountInput;
  readonly onChange: (next: AmountInput) => void;
  readonly basis: NutrientBasis | null;
  readonly servingSizeG: number | null;
  readonly problems: Readonly<Partial<Record<AmountField, AmountProblem>>>;
  readonly disabled: boolean;
}): ReactElement {
  const id = useId();
  const set = (patch: Partial<AmountInput>) => {
    onChange({ ...value, ...patch });
  };
  const err = (field: AmountField) => {
    const p = problems[field];
    return p === undefined ? undefined : amountProblemText(field, p);
  };
  const choices = basis === null ? [] : weighingChoices(basis);
  const needsBefore = basis !== null && value.weighed !== null && value.weighed !== basis;
  return (
    <>
      {servingSizeG === null ? null : (
        <ChoiceList
          legend={amountCopy.by}
          name={`${id}-by`}
          layout="inline"
          options={(['grams', 'serves'] as const).map((b) => ({
            value: b,
            label: amountCopy.byOptions[b],
          }))}
          value={value.by}
          disabled={disabled}
          onChange={(v) => {
            set({ by: v as 'grams' | 'serves' });
          }}
        />
      )}
      {value.by === 'serves' && servingSizeG !== null ? (
        <TextField
          label={amountCopy.serves}
          hint={fillTemplate(amountCopy.servesHint, { grams: formatNumber(servingSizeG) })}
          inputMode="decimal"
          autoComplete="off"
          value={value.serves}
          error={err('serves')}
          disabled={disabled}
          onChange={(e) => {
            set({ serves: e.currentTarget.value });
          }}
        />
      ) : (
        <>
          <TextField
            label={amountCopy.grams}
            inputMode="decimal"
            autoComplete="off"
            value={value.grams}
            error={err('grams')}
            disabled={disabled}
            onChange={(e) => {
              set({ grams: e.currentTarget.value });
            }}
          />
          {basis === 'cooked' ? (
            <p className="ui-text-muted">{amountCopy.weighedOnlyCooked}</p>
          ) : (
            <ChoiceList
              legend={amountCopy.weighed}
              name={`${id}-weighed`}
              hint={amountCopy.weighedHint}
              options={choices.map((c) => ({ value: c, label: amountCopy.weighedOptions[c] }))}
              value={value.weighed}
              error={err('weighed')}
              disabled={disabled}
              onChange={(v) => {
                set({ weighed: v as NutrientBasis });
              }}
            />
          )}
          {needsBefore ? (
            <TextField
              label={amountCopy.before}
              hint={fillTemplate(amountCopy.beforeHint, { state: amountCopy.states[basis] })}
              inputMode="decimal"
              autoComplete="off"
              value={value.before}
              error={err('before')}
              disabled={disabled}
              onChange={(e) => {
                set({ before: e.currentTarget.value });
              }}
            />
          ) : null}
        </>
      )}
    </>
  );
}

/** The amount checks' notice and tick (design 1.3.3). */
export function AmountChecks({
  checks,
  ticked,
  onTick,
  showError,
}: {
  readonly checks: readonly AmountCheck[];
  readonly ticked: boolean;
  readonly onTick: (on: boolean) => void;
  readonly showError: boolean;
}): ReactElement | null {
  if (checks.length === 0) return null;
  const text: Readonly<Record<AmountCheck, string>> = {
    'before-weight': amountCopy.checkBefore,
    'large-amount': amountCopy.checkLarge,
    'large-protein': amountCopy.checkProtein,
  };
  return (
    <>
      <Notice tone="amber">
        {checks.map((c) => (
          <p key={c}>{text[c]}</p>
        ))}
      </Notice>
      <CheckList
        legend={amountCopy.checkLegend}
        options={[{ value: 'ok', label: amountCopy.confirmAmount }]}
        values={ticked ? ['ok'] : []}
        error={showError && !ticked ? label.errors.confirmNeeded : undefined}
        onChange={(values) => {
          onTick(values.includes('ok'));
        }}
      />
    </>
  );
}
