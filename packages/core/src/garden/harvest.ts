/**
 * Add harvest (checklist item 19; design 2.4; G14; C57). A harvest either adds to the amount
 * already listed or replaces it, and the owner chooses (no default). Adding is offered only when
 * the listed amount was ready and is in the same unit with the same weight for each one, and it
 * keeps the earlier picked date, so days left are never overstated. A replace says the earlier
 * pick is treated as used up and from which day days left count. A harvest with no amount is
 * "available, amount not entered", never a weight. Saving a harvest always marks the crop ready.
 */
import { gardenScreen } from '../copy/health';
import { fillTemplate } from '../copy/template';
import type { RefId } from '../storage/primitives';
import type { GardenRecord } from '../storage/records';
import { roundTo } from '../util/round';
import type { LocalDate } from '../util/time';
import {
  checkGramsPerUnit,
  checkPickedDate,
  type FormProblem,
  type GardenFields,
  type GardenUnit,
  INVENTORY_LIMITS,
  readNumber,
} from './cropForm';
import { amountText, calendarDateText } from './rows';

export interface HarvestInput {
  readonly amount: number | null;
  readonly unit: GardenUnit | null;
  readonly gramsPerUnit: number | null;
  readonly pickedOn: LocalDate;
}

export interface HarvestDraft {
  readonly amount: string;
  readonly unit: GardenUnit | null;
  readonly gramsPerUnit: string;
  readonly pickedOn: string;
}

/** The amount, unit and grams-per rules of checkGardenCrop; the picked date is required, from 2000 to today. */
export function checkHarvest(
  draft: HarvestDraft,
  today: LocalDate,
):
  | { readonly ok: true; readonly value: HarvestInput }
  | {
      readonly ok: false;
      readonly problems: Readonly<Partial<Record<keyof HarvestDraft, FormProblem>>>;
    } {
  const problems: Partial<Record<keyof HarvestDraft, FormProblem>> = {};
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
  const grams = checkGramsPerUnit(draft.gramsPerUnit, amountEntered, draft.unit);
  if (grams.problem !== undefined) problems.gramsPerUnit = grams.problem;
  const picked = checkPickedDate(draft.pickedOn, today);
  if (picked.problem !== undefined) problems.pickedOn = picked.problem;
  else if (picked.value === null) problems.pickedOn = 'format';

  if (Object.keys(problems).length > 0 || picked.value === null) return { ok: false, problems };
  return {
    ok: true,
    value: {
      amount: amount.value ?? null,
      unit: amount.value === undefined ? null : draft.unit,
      gramsPerUnit: grams.value,
      pickedOn: picked.value,
    },
  };
}

/**
 * The harvest as typed so far, for showing the choices before Save: a figure that does not read
 * as a number counts as not entered, and a date that is not usable as today.
 */
export function provisionalHarvest(draft: HarvestDraft, today: LocalDate): HarvestInput {
  const amount = readNumber(draft.amount).value ?? null;
  const unit = amount === null ? null : draft.unit;
  const grams = checkGramsPerUnit(draft.gramsPerUnit, amount !== null, unit);
  const picked = checkPickedDate(draft.pickedOn, today);
  return {
    amount,
    unit,
    gramsPerUnit: grams.value,
    pickedOn: picked.problem === undefined && picked.value !== null ? picked.value : today,
  };
}

export type HarvestMode = 'add' | 'replace';
export type ReplaceOnlyReason =
  'nothing-listed' | 'not-ready-before' | 'no-amount-picked' | 'unit-differs' | 'weight-differs';

const BOTH: readonly HarvestMode[] = Object.freeze(['add', 'replace']);
const REPLACE_ONLY: readonly HarvestMode[] = Object.freeze(['replace']);

/**
 * Whether a harvest may add to the amount listed, first reason that applies: nothing is listed;
 * the listed amount was not ready (an expected yield is not food in hand); the harvest has no
 * amount; the units differ; the weight for each one differs. Otherwise both.
 */
export function harvestModes(
  row: GardenRecord,
  harvest: HarvestInput,
): { readonly modes: readonly HarvestMode[]; readonly replaceOnly: ReplaceOnlyReason | null } {
  const reason: ReplaceOnlyReason | null =
    row.amount === null
      ? 'nothing-listed'
      : !row.harvestReady
        ? 'not-ready-before'
        : harvest.amount === null
          ? 'no-amount-picked'
          : row.unit !== harvest.unit
            ? 'unit-differs'
            : row.gramsPerUnit !== null &&
                harvest.gramsPerUnit !== null &&
                row.gramsPerUnit !== harvest.gramsPerUnit
              ? 'weight-differs'
              : null;
  return { modes: reason === null ? BOTH : REPLACE_ONLY, replaceOnly: reason };
}

const earlier = (a: LocalDate | null, b: LocalDate): LocalDate => (a !== null && a < b ? a : b);

/** The crop's fields after a harvest. Name, link and keep days are unchanged; it is always ready. */
export function applyHarvest(
  row: GardenRecord,
  harvest: HarvestInput,
  mode: HarvestMode,
):
  | { readonly ok: true; readonly fields: GardenFields }
  | { readonly ok: false; readonly error: 'mode-not-allowed' | 'too-much' } {
  if (!harvestModes(row, harvest).modes.includes(mode)) {
    return { ok: false, error: 'mode-not-allowed' };
  }
  const kept = {
    ingredientId: row.ingredientId,
    name: row.name,
    harvestReady: true,
    perishabilityDays: row.perishabilityDays,
  };
  if (mode === 'add') {
    // harvestModes allows adding only to an amount listed in the harvest's own unit.
    const amount = roundTo((row.amount ?? 0) + (harvest.amount ?? 0), 2);
    if (amount > INVENTORY_LIMITS.amountMax) return { ok: false, error: 'too-much' };
    return {
      ok: true,
      fields: {
        ...kept,
        amount,
        unit: row.unit,
        gramsPerUnit: harvest.gramsPerUnit ?? row.gramsPerUnit,
        harvestedAt: earlier(row.harvestedAt, harvest.pickedOn),
      },
    };
  }
  const counted = harvest.amount !== null && (harvest.unit === 'each' || harvest.unit === 'bunch');
  return {
    ok: true,
    fields: {
      ...kept,
      amount: harvest.amount,
      unit: harvest.amount === null ? null : harvest.unit,
      gramsPerUnit: counted
        ? (harvest.gramsPerUnit ?? (row.unit === harvest.unit ? row.gramsPerUnit : null))
        : null,
      harvestedAt: harvest.pickedOn,
    },
  };
}

/** A crop first listed by a harvest: picked, ready, with no keep days. */
export function harvestAsNewCrop(
  name: string,
  ingredientId: RefId | null,
  harvest: HarvestInput,
): GardenFields {
  const counted = harvest.amount !== null && (harvest.unit === 'each' || harvest.unit === 'bunch');
  return {
    ingredientId,
    name,
    amount: harvest.amount,
    unit: harvest.amount === null ? null : harvest.unit,
    gramsPerUnit: counted ? harvest.gramsPerUnit : null,
    harvestReady: true,
    harvestedAt: harvest.pickedOn,
    perishabilityDays: null,
  };
}

/** "Listed now: 300 g, picked 9 January", or that no amount is entered, or that it was not ready. */
export function listedNowText(row: GardenRecord, today: LocalDate): string {
  const words = gardenScreen.harvest;
  if (row.amount === null) return words.listedNowNoAmount;
  const amount = amountText(row, 'garden');
  if (!row.harvestReady) return fillTemplate(words.listedNowNotReady, { amount });
  if (row.harvestedAt !== null) {
    return fillTemplate(words.listedNowPicked, {
      amount,
      date: calendarDateText(row.harvestedAt, today),
    });
  }
  return fillTemplate(words.listedNow, { amount });
}

/**
 * What the owner reads before saving: why only a replace is offered (nothing when nothing is
 * listed), then, for any replace of an amount or a picked date, that the earlier pick is treated
 * as used up and from which day days left count.
 */
export function harvestNoticeText(
  row: GardenRecord,
  harvest: HarvestInput,
  mode: HarvestMode | null,
  today: LocalDate,
): readonly string[] {
  const words = gardenScreen.harvest;
  const { replaceOnly } = harvestModes(row, harvest);
  const lines: string[] = [];
  if (replaceOnly === 'no-amount-picked') {
    lines.push(
      fillTemplate(words.replaceOnly['no-amount-picked'], { amount: amountText(row, 'garden') }),
    );
  } else if (replaceOnly !== null && replaceOnly !== 'nothing-listed') {
    lines.push(words.replaceOnly[replaceOnly]);
  }
  const replacing = replaceOnly !== null || mode === 'replace';
  if (replacing && (row.amount !== null || row.harvestedAt !== null)) {
    lines.push(
      fillTemplate(words.replaceDate, { date: calendarDateText(harvest.pickedOn, today) }),
    );
  }
  return lines;
}
