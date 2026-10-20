/**
 * The crop form, at setup (UX 1f; item 13) and on the garden screen (UX 3d; item 19 design 2.2;
 * C57). An empty amount means "available, amount not entered" and claims no weight; the unit is
 * then stored null, as the garden validator requires (unit null iff amount null). Nothing is
 * invented: the ingredient, grams per unit and picked date stay null unless the owner gives them.
 * Item 19 adds those three optional fields and the context; item 13's callers pass none of them,
 * and get the same result as before.
 */
import { garden, gardenScreen } from '../copy/health';
import { LOCAL_DATE_MIN, normalizeText, type RefId } from '../storage/primitives';
import type { GardenRecord } from '../storage/records';
import { parseOptionalNumber } from '../util/parse';
import { type LocalDate, parseLocalDate } from '../util/time';

export type GardenUnit = 'g' | 'each' | 'bunch';

export interface GardenCropDraft {
  readonly name: string;
  readonly amount: string;
  readonly unit: GardenUnit | null;
  readonly harvestReady: boolean;
  readonly keepsDays: string;
  // Item 19: the garden screen's fields (the setup step leaves them out).
  readonly ingredientId?: RefId | null;
  readonly gramsPerUnit?: string;
  readonly harvestedAt?: string;
}

/** Item 19: what the picked date is checked against. */
export interface GardenCropContext {
  readonly today: LocalDate;
  /** The stored row being edited: an unchanged stored date is not checked again. */
  readonly previous: GardenRecord | null;
}

export type GardenCropField =
  'name' | 'amount' | 'unit' | 'keepsDays' | 'gramsPerUnit' | 'harvestedAt';
/** Item 13's problems, then item 19's date problems. */
export type FormProblem =
  'required' | 'length' | 'range' | 'not-a-number' | 'format' | 'future' | 'too-early';
export type GardenCropProblem = FormProblem;

/** A checked crop: what the garden repository stores, less the id and updatedAt. */
export type GardenFields = Pick<
  GardenRecord,
  | 'ingredientId'
  | 'name'
  | 'amount'
  | 'unit'
  | 'gramsPerUnit'
  | 'harvestReady'
  | 'harvestedAt'
  | 'perishabilityDays'
>;
/** Item 13's name for it. */
export type GardenCropValue = GardenFields;

/** The garden and pantry limits (the version-1 validators' ranges). */
export const INVENTORY_LIMITS = Object.freeze({
  nameMax: 60,
  amountMax: 100_000,
  gramsPerUnitMax: 5_000,
  keepsForMaxDays: 365,
});

/** A number field: undefined when empty, or the problem with what was typed. */
export function readNumber(raw: string): { value?: number; problem?: 'not-a-number' } {
  try {
    const value = parseOptionalNumber(raw);
    return value === undefined ? {} : { value };
  } catch {
    return { problem: 'not-a-number' };
  }
}

/** A name field (item 13's rule): trimmed, 1–60 characters. */
export function checkName(raw: string): { value: string; problem?: 'required' | 'length' } {
  const value = normalizeText(raw) as string;
  if (value === '') return { value, problem: 'required' };
  if (value.length > INVENTORY_LIMITS.nameMax) return { value, problem: 'length' };
  return { value };
}

/**
 * A picked date: empty is null; otherwise a real "YYYY-MM-DD" date from 2000 up to today. A stored
 * date the owner left unchanged is not checked again (one later than today can come only from an
 * imported file or a wrong clock), as repositories do with unchanged zones.
 */
export function checkPickedDate(
  raw: string,
  today: LocalDate | null,
  unchanged: LocalDate | null = null,
): { value: LocalDate | null; problem?: 'format' | 'future' | 'too-early' } {
  const value = raw.trim();
  if (value === '') return { value: null };
  if (unchanged !== null && value === unchanged) return { value };
  try {
    parseLocalDate(value);
  } catch {
    return { value: null, problem: 'format' };
  }
  if (value < LOCAL_DATE_MIN) return { value: null, problem: 'too-early' };
  if (today !== null && value > today) return { value: null, problem: 'future' };
  return { value };
}

/**
 * Grams per item or bunch: considered only for an amount counted in each or bunch; empty is null;
 * otherwise above 0 and at most 5,000 (the validator stores it for those units only).
 */
export function checkGramsPerUnit(
  raw: string,
  amountEntered: boolean,
  unit: GardenUnit | null,
): { value: number | null; problem?: 'not-a-number' | 'range' } {
  if (!amountEntered || (unit !== 'each' && unit !== 'bunch')) return { value: null };
  const grams = readNumber(raw);
  if (grams.problem !== undefined) return { value: null, problem: grams.problem };
  if (grams.value === undefined) return { value: null };
  if (!(grams.value > 0 && grams.value <= INVENTORY_LIMITS.gramsPerUnitMax)) {
    return { value: null, problem: 'range' };
  }
  return { value: grams.value };
}

/**
 * Nothing has been entered in the form: no name, amount or keeps-for days, and no unit chosen. The
 * step's Continue adds a crop that has been typed (and Skip discards it); an empty form adds none.
 */
export function gardenCropDraftEmpty(draft: GardenCropDraft): boolean {
  return (
    draft.name.trim() === '' &&
    draft.amount.trim() === '' &&
    draft.keepsDays.trim() === '' &&
    draft.unit === null
  );
}

export function checkGardenCrop(
  draft: GardenCropDraft,
  context?: GardenCropContext,
):
  | { readonly ok: true; readonly value: GardenFields }
  | {
      readonly ok: false;
      readonly problems: Readonly<Partial<Record<GardenCropField, GardenCropProblem>>>;
    } {
  const problems: Partial<Record<GardenCropField, GardenCropProblem>> = {};
  const name = checkName(draft.name);
  if (name.problem !== undefined) problems.name = name.problem;

  const amount = readNumber(draft.amount);
  if (amount.problem !== undefined) problems.amount = amount.problem;
  else if (
    amount.value !== undefined &&
    !(amount.value > 0 && amount.value <= INVENTORY_LIMITS.amountMax)
  ) {
    problems.amount = 'range';
  }
  const amountEntered = draft.amount.trim() !== '';
  if (amountEntered && draft.unit === null) problems.unit = 'required';

  const grams = checkGramsPerUnit(draft.gramsPerUnit ?? '', amountEntered, draft.unit);
  if (grams.problem !== undefined) problems.gramsPerUnit = grams.problem;

  const picked = checkPickedDate(
    draft.harvestedAt ?? '',
    context?.today ?? null,
    context?.previous?.harvestedAt ?? null,
  );
  if (picked.problem !== undefined) problems.harvestedAt = picked.problem;

  const keeps = readNumber(draft.keepsDays);
  if (keeps.problem !== undefined) problems.keepsDays = keeps.problem;
  else if (
    keeps.value !== undefined &&
    !(
      Number.isInteger(keeps.value) &&
      keeps.value >= 0 &&
      keeps.value <= INVENTORY_LIMITS.keepsForMaxDays
    )
  ) {
    problems.keepsDays = 'range';
  }

  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      ingredientId: draft.ingredientId ?? null,
      name: name.value,
      amount: amount.value ?? null,
      unit: amount.value === undefined ? null : draft.unit,
      gramsPerUnit: grams.value,
      harvestReady: draft.harvestReady,
      harvestedAt: picked.value,
      perishabilityDays: keeps.value ?? null,
    },
  };
}

/** Every field a garden, pantry or harvest form can name a problem for. */
export type InventoryField = GardenCropField | 'pickedOn';

/**
 * The words for a form problem (item 19 design section 4). The garden amount and the pantry amount
 * have different ranges, so `source` picks the amount wording; a number that is not plain digits
 * always gets the digits-only message (G31).
 */
export function gardenProblemText(
  field: InventoryField,
  problem: FormProblem,
  source: 'garden' | 'pantry' = 'garden',
): string {
  const errors = gardenScreen.errors;
  if (problem === 'not-a-number') return errors.digitsOnly;
  if (problem === 'format') return errors.dateFormat;
  if (problem === 'future') return errors.dateFuture;
  if (problem === 'too-early') return errors.dateTooEarly;
  switch (field) {
    case 'name':
      return problem === 'length' ? garden.errors.nameLength : garden.errors.nameRequired;
    case 'amount':
      return source === 'pantry' ? errors.pantryAmountRange : garden.errors.amount;
    case 'unit':
      return garden.errors.unitRequired;
    case 'keepsDays':
      return garden.errors.keeps;
    case 'gramsPerUnit':
      return errors.gramsPerUnitRange;
    case 'harvestedAt':
    case 'pickedOn':
      return errors.dateFormat;
  }
}
