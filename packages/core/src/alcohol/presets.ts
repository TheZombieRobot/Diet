/**
 * Drink presets: the editor's state and what it saves, the label checks, and the one-line summary
 * (AL-02, NN-01, C31, C92, D42; item 28 design 3.4, A17, A18, A39, A40, A42).
 *
 * The label figures always belong to the size and strength they were filled or typed for (A42):
 * changing either clears them at once, changing back refills them from the stored label, and
 * figures typed for one measure are never saved against another. No function here ever works an
 * energy figure out from the ABV (NN-01, C11).
 */
import { kjToKcal } from '../nutrition/nutrients';
import type { BeverageRecord, StoredDrinkLabel } from '../storage/records';
import { parseOptionalNumber } from '../util/parse';
import { roundTo } from '../util/round';
import {
  type DrinkMeasure,
  drinkEnergy,
  MAX_LABEL_KCAL,
  MAX_LABEL_STANDARD_DRINKS,
  MAX_SERVE_ML,
  standardDrinks,
} from './standardDrinks';

/** A preset's name: 1 to 60 characters (the beverages validator). */
export const PRESET_NAME_MAX = 60;
/** The kJ field's largest value: 5,000 kcal (the stored energyAsEntered range). */
export const MAX_LABEL_KJ = 20920;

export interface PresetFormState {
  readonly name: string;
  readonly volumeText: string;
  readonly abvText: string;
  readonly energyText: string;
  readonly energyUnit: 'kcal' | 'kJ';
  readonly stdText: string;
  /** The measure the label fields' contents were prefilled or typed for; null while both are empty. */
  readonly labelFor: DrinkMeasure | null;
  /** The measure of label figures that a size or strength change cleared, or of a stored label that does not apply. */
  readonly clearedFor: DrinkMeasure | null;
  /** A label field was typed in, cleared, or had its unit changed since the fields were last filled or cleared. */
  readonly labelTyped: boolean;
  /** "They match my can's label" was tapped, and neither the measure nor a label field has changed since. */
  readonly labelConfirmed: boolean;
}

export type PresetFormEvent =
  | { readonly kind: 'name' | 'volume' | 'abv' | 'energy' | 'std'; readonly text: string }
  | { readonly kind: 'unit'; readonly unit: 'kcal' | 'kJ' }
  | { readonly kind: 'confirm' };

const sameMeasure = (a: DrinkMeasure | null, b: DrinkMeasure | null): boolean =>
  a !== null && b !== null && a.volumeMl === b.volumeMl && a.abvPercent === b.abvPercent;

const measureOfLabel = (label: StoredDrinkLabel): DrinkMeasure => ({
  volumeMl: label.volumeMl,
  abvPercent: label.abvPercent,
});

/** A number typed into a field, or null when it is empty, not a plain number, or outside [min, max]. */
function fieldNumber(text: string, min: number, max: number): number | null {
  try {
    const value = parseOptionalNumber(text);
    return value !== undefined && value >= min && value <= max ? value : null;
  } catch {
    return null;
  }
}

/** The size (1 to 3,000 mL) and strength (0 to 100%) typed, or null while either is not valid. */
export function formMeasure(volumeText: string, abvText: string): DrinkMeasure | null {
  const volumeMl = fieldNumber(volumeText, 1, MAX_SERVE_ML);
  const abvPercent = fieldNumber(abvText, 0, 100);
  return volumeMl === null || abvPercent === null ? null : { volumeMl, abvPercent };
}

/** The label fields filled from a stored label (its energy as typed, in the unit typed; C31). */
function filledFrom(
  label: StoredDrinkLabel,
): Pick<PresetFormState, 'energyText' | 'energyUnit' | 'stdText'> {
  return {
    energyText: label.energyAsEntered === null ? '' : String(label.energyAsEntered.value),
    energyUnit: label.energyAsEntered?.unit ?? 'kcal',
    stdText: label.standardDrinks === null ? '' : String(label.standardDrinks),
  };
}

export function presetFormInit(stored: BeverageRecord | null): PresetFormState {
  const empty: PresetFormState = {
    name: '',
    volumeText: '',
    abvText: '',
    energyText: '',
    energyUnit: 'kcal',
    stdText: '',
    labelFor: null,
    clearedFor: null,
    labelTyped: false,
    labelConfirmed: false,
  };
  if (stored === null) return empty;
  const base = {
    ...empty,
    name: stored.name,
    volumeText: String(stored.volumeMl),
    abvText: String(stored.abvPercent),
  };
  const { label } = stored;
  if (label === null) return base;
  const measure: DrinkMeasure = { volumeMl: stored.volumeMl, abvPercent: stored.abvPercent };
  if (sameMeasure(measureOfLabel(label), measure)) {
    return { ...base, ...filledFrom(label), labelFor: measure };
  }
  // A stored label for another measure no longer counts: the "were for" line shows from the start.
  return {
    ...base,
    energyUnit: label.energyAsEntered?.unit ?? 'kcal',
    clearedFor: measureOfLabel(label),
  };
}

/** Typing in a label field (or changing the unit of a filled energy field). */
function typedLabel(state: PresetFormState): PresetFormState {
  const empty = state.energyText.trim() === '' && state.stdText.trim() === '';
  return {
    ...state,
    labelTyped: true,
    labelConfirmed: false,
    clearedFor: null,
    labelFor: empty ? null : formMeasure(state.volumeText, state.abvText),
  };
}

export function presetFormStep(
  state: PresetFormState,
  event: PresetFormEvent,
  stored: BeverageRecord | null,
): PresetFormState {
  switch (event.kind) {
    case 'name':
      return { ...state, name: event.text };
    case 'volume':
    case 'abv': {
      let next: PresetFormState =
        event.kind === 'volume'
          ? { ...state, volumeText: event.text }
          : { ...state, abvText: event.text };
      const measure = formMeasure(next.volumeText, next.abvText);
      if (next.labelFor !== null && !sameMeasure(measure, next.labelFor)) {
        next = {
          ...next,
          energyText: '',
          stdText: '',
          clearedFor: next.labelFor,
          labelFor: null,
          labelTyped: false,
          labelConfirmed: false,
        };
      }
      // Back to the stored label's measure: its figures come back, unless the owner cleared them.
      const label = stored?.label ?? null;
      if (
        label !== null &&
        !next.labelTyped &&
        next.energyText === '' &&
        next.stdText === '' &&
        sameMeasure(measure, measureOfLabel(label))
      ) {
        next = { ...next, ...filledFrom(label), labelFor: measure, clearedFor: null };
      }
      return next;
    }
    case 'energy':
      return typedLabel({ ...state, energyText: event.text });
    case 'std':
      return typedLabel({ ...state, stdText: event.text });
    case 'unit': {
      const next = { ...state, energyUnit: event.unit };
      return next.energyText.trim() === '' ? next : typedLabel(next);
    }
    case 'confirm':
      return presetFormView(state, stored).canConfirm ? { ...state, labelConfirmed: true } : state;
  }
}

export interface PresetFormView {
  /** The size and strength typed, or null; the label fields are disabled while null. */
  readonly measure: DrinkMeasure | null;
  /** Show "These figures came with the app" and "They match my can's label". */
  readonly canConfirm: boolean;
  /** Show "The label figures were for ..." with this measure. */
  readonly labelWasFor: DrinkMeasure | null;
}

export function presetFormView(
  state: PresetFormState,
  stored: BeverageRecord | null,
): PresetFormView {
  const measure = formMeasure(state.volumeText, state.abvText);
  const label = stored?.label ?? null;
  const canConfirm =
    label !== null &&
    label.origin === 'preset-default' &&
    sameMeasure(state.labelFor, measureOfLabel(label)) &&
    sameMeasure(measure, state.labelFor) &&
    !state.labelTyped &&
    !state.labelConfirmed;
  const labelWasFor =
    state.labelFor === null && state.clearedFor !== null && !sameMeasure(measure, state.clearedFor)
      ? state.clearedFor
      : null;
  return { measure, canConfirm, labelWasFor };
}

export type PresetFieldProblem = 'name' | 'volume' | 'abv' | 'number' | 'energy' | 'std';

/** Why the form cannot be saved yet, field by field (empty when it can). */
export function presetFormProblems(
  state: PresetFormState,
): Partial<Record<'name' | 'volume' | 'abv' | 'energy' | 'std', PresetFieldProblem>> {
  const problems: Partial<
    Record<'name' | 'volume' | 'abv' | 'energy' | 'std', PresetFieldProblem>
  > = {};
  const name = state.name.trim();
  if (name === '' || name.length > PRESET_NAME_MAX) problems.name = 'name';
  const check = (
    key: 'volume' | 'abv' | 'energy' | 'std',
    text: string,
    min: number,
    max: number,
    required: boolean,
  ) => {
    let value: number | undefined;
    try {
      value = parseOptionalNumber(text);
    } catch {
      problems[key] = 'number';
      return;
    }
    if (value === undefined ? required : value < min || value > max) problems[key] = key;
  };
  check('volume', state.volumeText, 1, MAX_SERVE_ML, true);
  check('abv', state.abvText, 0, 100, true);
  check(
    'energy',
    state.energyText,
    0,
    state.energyUnit === 'kcal' ? MAX_LABEL_KCAL : MAX_LABEL_KJ,
    false,
  );
  check('std', state.stdText, 0, MAX_LABEL_STANDARD_DRINKS, false);
  return problems;
}

/**
 * The fields to save (A17, A42), in this order: "They match my can's label" keeps the stored label
 * as the owner's; both label fields cleared stores no label; figures typed for the current measure
 * are stored for that measure; otherwise the stored label stays as it was (it no longer applies when
 * the measure changed, and the editor says so). Call only when presetFormProblems is empty.
 */
export function presetFields(
  stored: BeverageRecord | null,
  state: PresetFormState,
): Pick<BeverageRecord, 'name' | 'volumeMl' | 'abvPercent' | 'label'> {
  const measure = formMeasure(state.volumeText, state.abvText);
  if (measure === null) throw new RangeError('The size and strength are not valid numbers');
  const fields = { name: state.name.trim(), ...measure };
  const storedLabel = stored?.label ?? null;
  if (state.labelConfirmed && storedLabel !== null) {
    return { ...fields, label: { ...storedLabel, origin: 'owner' } };
  }
  const energy = parseOptionalNumber(state.energyText) ?? null;
  const std = parseOptionalNumber(state.stdText) ?? null;
  if (state.labelTyped && energy === null && std === null) return { ...fields, label: null };
  if (state.labelTyped && state.labelFor !== null && sameMeasure(state.labelFor, measure)) {
    return {
      ...fields,
      label: {
        ...state.labelFor,
        standardDrinks: std,
        kcal: energy === null ? null : state.energyUnit === 'kcal' ? energy : kjToKcal(energy),
        energyAsEntered: energy === null ? null : { value: energy, unit: state.energyUnit },
        origin: 'owner',
      },
    };
  }
  return { ...fields, label: storedLabel };
}

export interface LabelCheck {
  /** The calculation, 2 dp, for the message. */
  readonly calculatedStd: number;
  /** standardDrinks(...).labelDisagrees: more than 0.1 or 10% away from the calculation. */
  readonly stdDisagrees: boolean;
  /** drinkEnergy(...).labelImplausible: below 90% of the alcohol's own energy. */
  readonly kcalImplausible: boolean;
}

/** The checks before a label is saved (A18). Never returns an energy worked out from the ABV. */
export function labelCheck(
  measure: DrinkMeasure,
  labelStandardDrinks: number | null,
  labelKcal: number | null,
): LabelCheck {
  const beverage = {
    ...measure,
    label: { ...measure, standardDrinks: labelStandardDrinks, kcal: labelKcal },
  };
  return {
    calculatedStd: roundTo(standardDrinks(measure).exact, 2),
    stdDisagrees: labelStandardDrinks !== null && standardDrinks(beverage).labelDisagrees,
    kcalImplausible: labelKcal !== null && drinkEnergy(beverage).labelImplausible,
  };
}

export interface PresetSummary {
  /** The per-serve figure shown (the label figure, or the calculation), to 1 dp (C94: per-preset labels only). */
  readonly std1dp: number;
  /** The label kcal, rounded; null when unknown or implausibly low (NN-01, A40). */
  readonly kcal: number | null;
  /** A stored label no longer applies to the preset's size and strength (C92). */
  readonly labelIgnored: boolean;
  /** The seeded label, not yet checked by the owner (D42). */
  readonly presetDefault: boolean;
  /** The calculation, 2 dp, when a label standard-drinks figure is used and disagrees with it (A39). */
  readonly labelDiffersFrom: number | null;
  /** The label energy is implausibly low (A40). */
  readonly kcalLooksLow: boolean;
}

export function presetSummary(
  b: Pick<BeverageRecord, 'volumeMl' | 'abvPercent' | 'label'>,
): PresetSummary {
  const std = standardDrinks(b);
  const energy = drinkEnergy(b);
  const labelIgnored = std.labelIgnored || energy.labelIgnored;
  const applies = b.label !== null && sameMeasure(measureOfLabel(b.label), b);
  return {
    std1dp: roundTo(std.exact, 1),
    kcal: energy.kcal === null || energy.labelImplausible ? null : Math.round(energy.kcal),
    labelIgnored,
    presetDefault: applies && b.label?.origin === 'preset-default',
    labelDiffersFrom:
      std.source === 'label' && std.labelDisagrees
        ? roundTo(standardDrinks({ volumeMl: b.volumeMl, abvPercent: b.abvPercent }).exact, 2)
        : null,
    kcalLooksLow: energy.labelImplausible,
  };
}
