/**
 * The "Add a crop" form at setup (UX 1f; C57). An empty amount means "available, amount not
 * entered" and claims no weight; the unit is then stored null, as the garden validator requires
 * (unit null iff amount null). Nothing is invented: the ingredient, grams per unit and harvest
 * date stay null until item 19's editor.
 */
import { normalizeText } from '../storage/primitives';
import { parseOptionalNumber } from '../util/parse';

export type GardenUnit = 'g' | 'each' | 'bunch';

export interface GardenCropDraft {
  readonly name: string;
  readonly amount: string;
  readonly unit: GardenUnit | null;
  readonly harvestReady: boolean;
  readonly keepsDays: string;
}

export type GardenCropField = 'name' | 'amount' | 'unit' | 'keepsDays';
export type GardenCropProblem = 'required' | 'length' | 'range' | 'not-a-number';

export interface GardenCropValue {
  readonly name: string;
  readonly amount: number | null;
  readonly unit: GardenUnit | null;
  readonly harvestReady: boolean;
  readonly perishabilityDays: number | null;
}

const NAME_MAX = 60;
const AMOUNT_MAX = 100_000;
const KEEPS_MAX_DAYS = 365;

/** A number field: undefined when empty, or the problem with what was typed. */
function readNumber(raw: string): { value?: number; problem?: 'not-a-number' } {
  try {
    const value = parseOptionalNumber(raw);
    return value === undefined ? {} : { value };
  } catch {
    return { problem: 'not-a-number' };
  }
}

export function checkGardenCrop(draft: GardenCropDraft):
  | { readonly ok: true; readonly value: GardenCropValue }
  | {
      readonly ok: false;
      readonly problems: Readonly<Partial<Record<GardenCropField, GardenCropProblem>>>;
    } {
  const problems: Partial<Record<GardenCropField, GardenCropProblem>> = {};
  const name = normalizeText(draft.name) as string;
  if (name === '') problems.name = 'required';
  else if (name.length > NAME_MAX) problems.name = 'length';

  const amount = readNumber(draft.amount);
  if (amount.problem !== undefined) problems.amount = amount.problem;
  else if (amount.value !== undefined && !(amount.value > 0 && amount.value <= AMOUNT_MAX)) {
    problems.amount = 'range';
  }
  const amountEntered = draft.amount.trim() !== '';
  if (amountEntered && draft.unit === null) problems.unit = 'required';

  const keeps = readNumber(draft.keepsDays);
  if (keeps.problem !== undefined) problems.keepsDays = keeps.problem;
  else if (
    keeps.value !== undefined &&
    !(Number.isInteger(keeps.value) && keeps.value >= 0 && keeps.value <= KEEPS_MAX_DAYS)
  ) {
    problems.keepsDays = 'range';
  }

  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      name,
      amount: amount.value ?? null,
      unit: amount.value === undefined ? null : draft.unit,
      harvestReady: draft.harvestReady,
      perishabilityDays: keeps.value ?? null,
    },
  };
}
