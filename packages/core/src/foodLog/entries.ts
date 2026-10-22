/**
 * Building a food log entry (item 23 design 2.3 and 2.4; FL-01, FL-02, FL-03, NN-04, C32, C67,
 * HS-23, HS-R23). Every row the app writes to food_log is built here, from the owner's label
 * figures, a recipe's live figures, or a planned meal's, for the owner's own portion.
 *
 * - A weight is stored with the state it was weighed in, and is never multiplied by figures for
 *   another state: a state the label does not offer is refused, and a weight in another state
 *   needs the weight in the label's state (C67). Cooked forms of catalogue foods are used for
 *   naming only; no yield factor is applied (cross-item ruling 20).
 * - Only an own label food can be logged by weight (no catalogue food path; item 18 1.5): a seed
 *   view is not even assignable to LabelFoodForLog.
 * - A recipe or plan entry is never Label (C32), takes the owner's serves only (HS-23), and keeps
 *   every unknown figure listed, all eight when its lines have none (schema version 2).
 */
import { NUTRIENT_KEYS, nutrientsForGrams, type Nutrients } from '../nutrition/nutrients';
import { myPortionNutrients } from '../nutrition/portion';
import { parseClockTime } from '../fasting/eatingWindow';
import { NUTRIENT_LIMITS_PER_ITEM } from '../storage/limits';
import { type Instant, isClockTime, type RefId, type TimeZone } from '../storage/primitives';
import type {
  FoodLogRecord,
  IngredientRecord,
  MealSlot,
  NutrientBasis,
  NutrientKey,
} from '../storage/records';
import { parseOptionalNumber } from '../util/parse';
import { type LocalDate, localDateOf, zonedWallTimeToInstant } from '../util/time';
import {
  BEFORE_COOKING_RATIO,
  LABEL_SERVES_MAX,
  LARGE_ENTRY,
  LOG_GRAMS_MAX,
  LOG_SERVES,
} from './constants';

/** The states the owner may say a food was weighed in, for a label's state (C67). */
export function weighingChoices(labelBasis: NutrientBasis): readonly NutrientBasis[] {
  switch (labelBasis) {
    case 'raw':
      return ['raw', 'cooked'];
    case 'as-sold':
      return ['as-sold', 'cooked'];
    case 'cooked':
      return ['cooked'];
  }
}

/** A weight in another state than the label's needs the weight in the label's state. */
export const needsLabelStateWeight = (labelBasis: NutrientBasis, weighed: NutrientBasis): boolean =>
  weighed !== labelBasis;

export type LogEntryDraft = Omit<FoodLogRecord, 'id' | 'at' | 'timeZone'>;

export type LabelAmount =
  | {
      readonly by: 'grams';
      readonly grams: number;
      readonly weighed: NutrientBasis;
      readonly gramsInLabelState: number | null;
    }
  | { readonly by: 'serves'; readonly serves: number };

export type EntryRefusal =
  | 'not-label-food'
  | 'amount-range'
  | 'weighed-not-offered'
  | 'label-state-weight-needed'
  | 'serving-size-missing'
  | 'too-much-for-one-entry';

export type DraftResult =
  | { readonly ok: true; readonly draft: LogEntryDraft }
  | { readonly ok: false; readonly refusal: EntryRefusal };

/** An own label food as the log reads it. Item 18's IngredientView (no NutritionSource) is not one. */
export type LabelFoodForLog = Pick<
  IngredientRecord,
  | 'id'
  | 'name'
  | 'source'
  | 'nutrientBasis'
  | 'nutrientsPer100g'
  | 'unknownNutrients'
  | 'servingSizeG'
>;

/** Every figure within the per-item limits the validator applies (storage 4.3). */
export function withinItemLimits(n: Nutrients): boolean {
  return NUTRIENT_KEYS.every((k) => n[k] <= NUTRIENT_LIMITS_PER_ITEM[k]);
}

const inRange = (value: number, max: number): boolean =>
  Number.isFinite(value) && value > 0 && value <= max;

/** Each listed unknown figure stored as 0 (the validator's unknown-nutrients-are-zero). */
function withUnknownsZero(n: Nutrients, unknown: readonly NutrientKey[]): Nutrients {
  const out = { ...n };
  for (const key of unknown) out[key] = 0;
  return out;
}

/** A label food's entry (FL-01, FL-03): badge Label, the weight and state as weighed. */
export function labelEntry(food: LabelFoodForLog, amount: LabelAmount): DraftResult {
  if (food.source !== 'label') return { ok: false, refusal: 'not-label-food' };
  let figureGrams: number;
  let stored: Pick<LogEntryDraft, 'grams' | 'weightBasis' | 'servings'>;
  if (amount.by === 'grams') {
    if (!inRange(amount.grams, LOG_GRAMS_MAX)) return { ok: false, refusal: 'amount-range' };
    if (!weighingChoices(food.nutrientBasis).includes(amount.weighed))
      return { ok: false, refusal: 'weighed-not-offered' };
    if (needsLabelStateWeight(food.nutrientBasis, amount.weighed)) {
      if (amount.gramsInLabelState === null || !inRange(amount.gramsInLabelState, LOG_GRAMS_MAX))
        return { ok: false, refusal: 'label-state-weight-needed' };
      figureGrams = amount.gramsInLabelState;
    } else {
      figureGrams = amount.grams;
    }
    stored = { grams: amount.grams, weightBasis: amount.weighed, servings: null };
  } else {
    if (food.servingSizeG === null) return { ok: false, refusal: 'serving-size-missing' };
    if (!inRange(amount.serves, LABEL_SERVES_MAX)) return { ok: false, refusal: 'amount-range' };
    const grams = amount.serves * food.servingSizeG;
    if (grams > LOG_GRAMS_MAX) return { ok: false, refusal: 'amount-range' };
    figureGrams = grams;
    stored = { grams, weightBasis: food.nutrientBasis, servings: amount.serves };
  }
  const nutrients = withUnknownsZero(
    nutrientsForGrams(food.nutrientsPer100g, figureGrams),
    food.unknownNutrients,
  );
  if (!withinItemLimits(nutrients)) return { ok: false, refusal: 'too-much-for-one-entry' };
  return {
    ok: true,
    draft: {
      sourceKind: 'label',
      refId: food.id,
      name: food.name,
      ...stored,
      nutrients,
      unknownNutrients: [...food.unknownNutrients],
      confidence: 'label',
    },
  };
}

/** A recipe's live figures for one serve (item 20's recipeNutrition), never its stored snapshot. */
export interface PortionFigures {
  readonly refId: RefId;
  readonly title: string;
  readonly perServe: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
  readonly confidence: 'database' | 'estimate';
}

function servesEntry(
  kind: { readonly sourceKind: 'recipe' | 'plan'; readonly refId: string },
  recipe: PortionFigures,
  serves: number,
): DraftResult {
  if (!inRange(serves, LOG_SERVES.max)) return { ok: false, refusal: 'amount-range' };
  // HS-23: the owner's serves only; household serves are not an input.
  const nutrients = myPortionNutrients({ perServe: recipe.perServe, myServes: serves });
  if (!withinItemLimits(nutrients)) return { ok: false, refusal: 'too-much-for-one-entry' };
  return {
    ok: true,
    draft: {
      ...kind,
      name: recipe.title,
      grams: null,
      weightBasis: null,
      servings: serves,
      nutrients,
      unknownNutrients: [...recipe.unknownNutrients],
      confidence: recipe.confidence,
    },
  };
}

/** A recipe eaten (FL-02): Database or Estimate, never Label (C32). */
export function recipeEntry(recipe: PortionFigures, serves: number): DraftResult {
  return servesEntry({ sourceKind: 'recipe', refId: recipe.refId }, recipe, serves);
}

/** A planned meal eaten, carrying its plan date and slot so item 15's check counts it once. */
export function planEntry(
  date: LocalDate,
  slot: MealSlot,
  recipe: PortionFigures,
  serves: number,
): DraftResult {
  return servesEntry({ sourceKind: 'plan', refId: `${date}#${slot}` }, recipe, serves);
}

export type AmountField = 'grams' | 'weighed' | 'before' | 'serves';
export type AmountProblem = 'required' | 'not-number' | 'range' | 'choose';

/** The amount step's text, read for a label in `labelBasis`. */
export function parseAmount(
  input: {
    readonly by: 'grams' | 'serves';
    readonly grams: string;
    readonly weighed: NutrientBasis | null;
    readonly before: string;
    readonly serves: string;
  },
  labelBasis: NutrientBasis,
):
  | { readonly ok: true; readonly amount: LabelAmount }
  | {
      readonly ok: false;
      readonly problems: Readonly<Partial<Record<AmountField, AmountProblem>>>;
    } {
  const problems: Partial<Record<AmountField, AmountProblem>> = {};
  const read = (field: AmountField, text: string, max: number): number | null => {
    let value: number | undefined;
    try {
      value = parseOptionalNumber(text);
    } catch {
      problems[field] = 'not-number';
      return null;
    }
    if (value === undefined) {
      problems[field] = 'required';
      return null;
    }
    if (!inRange(value, max)) {
      problems[field] = 'range';
      return null;
    }
    return value;
  };
  if (input.by === 'serves') {
    const serves = read('serves', input.serves, LABEL_SERVES_MAX);
    return serves === null
      ? { ok: false, problems }
      : { ok: true, amount: { by: 'serves', serves } };
  }
  const grams = read('grams', input.grams, LOG_GRAMS_MAX);
  // A cooked label has one state; the others ask, with nothing preselected.
  const weighed = labelBasis === 'cooked' ? 'cooked' : input.weighed;
  if (weighed === null || !weighingChoices(labelBasis).includes(weighed))
    problems.weighed = 'choose';
  const before =
    weighed !== null && needsLabelStateWeight(labelBasis, weighed)
      ? read('before', input.before, LOG_GRAMS_MAX)
      : null;
  if (grams === null || weighed === null || Object.keys(problems).length > 0)
    return { ok: false, problems };
  return { ok: true, amount: { by: 'grams', grams, weighed, gramsInLabelState: before } };
}

export type AmountCheck = 'before-weight' | 'large-amount' | 'large-protein';

/** Confirmations, not refusals: they catch a typed extra zero before it inflates a day's protein. */
export function amountChecks(input: {
  readonly amount: LabelAmount;
  readonly draft: Pick<LogEntryDraft, 'nutrients'>;
  readonly proteinTargetG: number | null;
}): AmountCheck[] {
  const { amount } = input;
  const checks: AmountCheck[] = [];
  if (amount.by === 'grams' && amount.gramsInLabelState !== null) {
    const ratio = amount.grams / amount.gramsInLabelState;
    if (ratio < BEFORE_COOKING_RATIO.min || ratio > BEFORE_COOKING_RATIO.max)
      checks.push('before-weight');
  }
  if (
    amount.by === 'grams'
      ? (amount.gramsInLabelState ?? amount.grams) > LARGE_ENTRY.grams
      : amount.serves > LARGE_ENTRY.labelServes
  )
    checks.push('large-amount');
  if (input.proteinTargetG !== null && input.draft.nutrients.proteinG > input.proteinTargetG)
    checks.push('large-protein');
  return checks;
}

/** The serves Stepper's next value: the next multiple of 0.25 up or down, within LOG_SERVES. */
export function nextServes(value: number, direction: 1 | -1): number {
  const step = LOG_SERVES.step;
  if (direction === 1) {
    const next = Math.floor(value / step + 1e-9) * step + step;
    return Math.min(LOG_SERVES.max, next);
  }
  const next = Math.ceil(value / step - 1e-9) * step - step;
  return Math.max(LOG_SERVES.min, next);
}

export type EntryTimeResult =
  | { readonly ok: true; readonly at: Instant }
  | { readonly ok: false; readonly problem: 'required' | 'format' | 'future' | 'other-day' };

/** The instant of a time typed for a date, in `zone`; never ahead of now, never on another day. */
export function entryInstant(
  date: LocalDate,
  time: string,
  zone: TimeZone,
  now: Instant,
): EntryTimeResult {
  const text = time.trim();
  if (text === '') return { ok: false, problem: 'required' };
  if (!isClockTime(text)) return { ok: false, problem: 'format' };
  const at = new Date(zonedWallTimeToInstant(date, parseClockTime(text), zone)).toISOString();
  if (at > now) return { ok: false, problem: 'future' };
  if (localDateOf(at, zone) !== date) return { ok: false, problem: 'other-day' };
  return { ok: true, at };
}
