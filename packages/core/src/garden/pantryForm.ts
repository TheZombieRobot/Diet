/**
 * The pantry form (UX 3d; item 19 design 2.2; G29). An empty amount means "some, not measured"
 * and 0 means none left; the unit is required whenever an amount is entered, including 0, as the
 * version-1 pantry validator requires (unit null iff amount null).
 */
import type { RefId } from '../storage/primitives';
import type { PantryRecord } from '../storage/records';
import { checkName, type FormProblem, INVENTORY_LIMITS, readNumber } from './cropForm';

export type PantryUnit = 'g' | 'ml' | 'each';

export interface PantryItemDraft {
  readonly name: string;
  readonly ingredientId: RefId | null;
  readonly amount: string;
  readonly unit: PantryUnit | null;
}

export type PantryField = 'name' | 'amount' | 'unit';

/** A checked pantry item: what the pantry repository stores, less the id and updatedAt. */
export type PantryFields = Pick<PantryRecord, 'ingredientId' | 'name' | 'amount' | 'unit'>;

export function checkPantryItem(
  draft: PantryItemDraft,
):
  | { readonly ok: true; readonly value: PantryFields }
  | { readonly ok: false; readonly problems: Readonly<Partial<Record<PantryField, FormProblem>>> } {
  const problems: Partial<Record<PantryField, FormProblem>> = {};
  const name = checkName(draft.name);
  if (name.problem !== undefined) problems.name = name.problem;
  const amount = readNumber(draft.amount);
  if (amount.problem !== undefined) problems.amount = amount.problem;
  else if (
    amount.value !== undefined &&
    !(amount.value >= 0 && amount.value <= INVENTORY_LIMITS.amountMax)
  ) {
    problems.amount = 'range';
  }
  if (draft.amount.trim() !== '' && draft.unit === null) problems.unit = 'required';
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      ingredientId: draft.ingredientId,
      name: name.value,
      amount: amount.value ?? null,
      unit: amount.value === undefined ? null : draft.unit,
    },
  };
}
