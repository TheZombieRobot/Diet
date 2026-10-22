/**
 * The food log's words for amounts, badges and refusals (item 23 design 1.4 and 4.3). Every string
 * comes from health.ts; numbers through item 18's formatNumber.
 */
import {
  type AmountProblem,
  type Confidence,
  entryAmount,
  type EntryTimeResult,
  fillTemplate,
  type FoodLogRecord,
  formatNumber,
  type LabelField,
  type LabelProblem,
  NUTRIENT_LIMITS_PER_100G,
  roundTo,
} from '@diet/core';
import { foodLog, foods, privacy, today } from '@diet/core/copy/health';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';

const copy = foodLog;

/** Item 21's tag tones: Label teal, Database neutral, Estimate amber. */
export const TAG_TONES: Readonly<Record<Confidence, 'teal' | 'neutral' | 'amber'>> = {
  label: 'teal',
  database: 'neutral',
  estimate: 'amber',
};

export const badgeTag = (badge: Confidence | null) =>
  badge === null ? null : { tone: TAG_TONES[badge], text: foods.badges[badge] };

/** Grams as an entry shows them: one decimal below 10 g, whole from 10 g. */
const gramsText = (g: number): string => formatNumber(g < 10 ? roundTo(g, 1) : roundTo(g, 0));
const servesText = (n: number): string => formatNumber(roundTo(n, 2));

/** "150 g cooked", "1.5 serves", "2 serves (340 g)". */
export function entryAmountText(
  row: Pick<FoodLogRecord, 'sourceKind' | 'grams' | 'weightBasis' | 'servings'>,
): string {
  const amount = entryAmount(row);
  const e = copy.entries;
  switch (amount.kind) {
    case 'grams':
      return fillTemplate(e.amountGrams, {
        grams: gramsText(amount.grams),
        state: copy.amount.states[amount.state],
      });
    case 'label-serves':
      return amount.serves === 1
        ? fillTemplate(e.amountLabelServesOne, { grams: gramsText(amount.grams) })
        : fillTemplate(e.amountLabelServes, {
            serves: servesText(amount.serves),
            grams: gramsText(amount.grams),
          });
    case 'serves':
      return amount.serves === 1
        ? e.amountServesOne
        : fillTemplate(e.amountServes, { serves: servesText(amount.serves) });
  }
}

/** The serves Stepper's value: "1 serve", "0.33 serves". */
export const servesValue = (n: number): string =>
  n === 1
    ? copy.recipe.servesOne
    : fillTemplate(copy.recipe.servesValue, { serves: servesText(n) });

/** A label form problem as the field shows it. */
export function labelProblemText(problem: LabelProblem): string {
  const errors = copy.label.errors;
  if (problem === 'energy-too-high')
    return fillTemplate(errors[problem], { max: formatNumber(NUTRIENT_LIMITS_PER_100G.energyKj) });
  if (problem === 'sodium-too-high')
    return fillTemplate(errors[problem], { max: formatNumber(NUTRIENT_LIMITS_PER_100G.sodiumMg) });
  return errors[problem];
}

export type LabelFieldErrors = Partial<Record<LabelField, string>>;

const AMOUNT_ERRORS = {
  grams: { required: 'gramsRequired', 'not-number': 'notNumber', range: 'gramsRange' },
  before: { required: 'beforeNeeded', 'not-number': 'notNumber', range: 'beforeRange' },
  serves: { required: 'servesRequired', 'not-number': 'notNumber', range: 'servesRange' },
} as const;

/** An amount problem as its field shows it. */
export function amountProblemText(
  field: 'grams' | 'before' | 'serves' | 'weighed',
  problem: AmountProblem,
): string {
  if (field === 'weighed') return copy.amount.errors.weighedNeeded;
  const key = AMOUNT_ERRORS[field][problem as 'required' | 'not-number' | 'range'];
  return copy.amount.errors[key];
}

/** A time problem as the time field shows it. */
export function timeProblemText(
  problem: Extract<EntryTimeResult, { ok: false }>['problem'],
): string {
  const e = copy.amount.errors;
  return {
    required: e.timeRequired,
    format: e.timeFormat,
    future: e.timeFuture,
    'other-day': e.timeOtherDay,
  }[problem];
}

/** A refused write as the card's notice says it (design 4.3). */
export function writeFailureText(
  error: unknown,
  context: 'label' | 'recipe' | 'plan' | 'change',
): string {
  if (error instanceof StorageFullError) return privacy.storageFull;
  if (error instanceof StorageClosedError) return privacy.backupCard.closed;
  if (!(error instanceof StorageRuleError)) return today.saveFailed;
  switch (error.rule) {
    case 'food-source-missing':
      return context === 'plan'
        ? copy.plan.recipeMissing
        : context === 'change'
          ? copy.entries.cannotRebuild
          : copy.add.sourceMissing;
    case 'entry-other-day':
      return copy.amount.errors.timeOtherDay;
    case 'future-time':
      return copy.amount.errors.timeFuture;
    case 'plan-not-found':
      return copy.plan.mealGone;
    case 'plan-slot-logged':
      return copy.plan.alreadyLogged;
    case 'not-found':
      return copy.entries.gone;
    case 'entry-refused':
      if (error.reason === 'too-much-for-one-entry') return copy.amount.errors.tooMuch;
      if (error.reason === 'weighed-not-offered') return copy.amount.errors.weighedNeeded;
      if (error.reason === 'label-state-weight-needed') return copy.amount.errors.beforeNeeded;
      if (error.reason === 'amount-range')
        return context === 'label' ? copy.amount.errors.gramsRange : copy.amount.errors.servesRange;
      return today.saveFailed;
    case 'label-refused':
      return error.reason === null || error.reason === 'unconfirmed'
        ? copy.label.errors.confirmNeeded
        : labelProblemText(error.reason as LabelProblem);
    default:
      return today.saveFailed;
  }
}
