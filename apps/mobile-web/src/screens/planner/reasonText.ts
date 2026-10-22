/**
 * The planner's words for refusals, slots and portions (item 22 design 2.17, 3.12, 3.15; scan
 * plannerHome rule 5): the only screen file that maps planReasonWording's keys, and the copy's two
 * skip lines, to their strings, so no screen picks a refusal sentence itself.
 */
import {
  allergenListText,
  type AutoFillRefusal,
  type CopyRefusal,
  type CopySkip,
  type EatingWindow,
  fillTemplate,
  formatNumber,
  type MealSlot,
  type PlanReasonKey,
  type PlanReasonOptions,
  planReasonWording,
  type PlanReasonWording,
  type PlanRecipeLookup,
  type PlanWriteRefusal,
  portionText,
  slotLabelKey,
} from '@diet/core';
import { foods, planner, privacy, targets } from '@diet/core/copy/health';
import { StorageClosedError, StorageFullError } from '../../db/errors';
import { energyNotKnownMessage } from '../../foods/floorMessage';
import { formatAboutKcal } from '../../format';

type Refusal = PlanWriteRefusal | AutoFillRefusal | CopyRefusal;

const TEXT: Readonly<Record<PlanReasonKey, string>> = {
  'planner.refused.failed': planner.refused.failed,
  'planner.refused.pastDay': planner.refused.pastDay,
  'planner.refused.futureDay': planner.refused.futureDay,
  'planner.refused.slot': planner.refused.slot,
  'planner.refused.recipeMissing': planner.refused.recipeMissing,
  'planner.refused.portion': planner.refused.portion,
  'planner.refused.allergen': planner.refused.allergen,
  'planner.refused.labelCheck': planner.refused.labelCheck,
  'planner.reasons.pastDay': planner.reasons.pastDay,
  'planner.reasons.recipeMissing': planner.reasons.recipeMissing,
  'planner.reasons.portion': planner.reasons.portion,
  'planner.reasons.notWantedDay': planner.reasons.notWantedDay,
  'planner.reasons.allergen': planner.reasons.allergen,
  'planner.reasons.labelCheck': planner.reasons.labelCheck,
  'planner.reasons.hasMeals': planner.reasons.hasMeals,
  'planner.reasons.noCandidates': planner.reasons.noCandidates,
  'planner.reasons.energyNotKnownAim': planner.reasons.energyNotKnownAim,
  'planner.reasons.energyShort': planner.reasons.energyShort,
  'planner.reasons.proteinNotKnown': planner.reasons.proteinNotKnown,
  'planner.reasons.proteinShort': planner.reasons.proteinShort,
  'planner.reasons.plainNotKnown': planner.reasons.plainNotKnown,
  'planner.reasons.plainNotFilled': planner.reasons.plainNotFilled,
  'planner.reasons.oneMealShort': planner.reasons.oneMealShort,
  'planner.reasons.oneMealShortNoSnack': planner.reasons.oneMealShortNoSnack,
  'planner.reasons.oneMealDish': planner.reasons.oneMealDish,
  'planner.reasons.oneMealReflux': planner.reasons.oneMealReflux,
  'planner.reasons.carbsNotKnown': planner.reasons.carbsNotKnown,
  'planner.reasons.carbsOver': planner.reasons.carbsOver,
  'planner.reasons.satFatNotKnown': planner.reasons.satFatNotKnown,
  'planner.reasons.satFatOver': planner.reasons.satFatOver,
  'planner.week.noFillNoEstimate': planner.week.noFillNoEstimate,
  'targets.plannerFloor.noGuide': targets.plannerFloor.noGuide,
  'targets.plannerFloor.refused': targets.plannerFloor.refused,
  'foods.planner.energyNotKnown': foods.planner.energyNotKnown,
};

export interface ReasonText {
  readonly text: string;
  readonly then: PlanReasonWording['then'];
}

/** The sentence for a refusal, filled from the refusal and the live recipe names. */
export function reasonText(
  refusal: Refusal,
  opts: PlanReasonOptions,
  lookup: Pick<PlanRecipeLookup, 'viewOf'>,
): ReasonText {
  const wording = planReasonWording(refusal, opts);
  const title =
    'recipeId' in refusal
      ? (lookup.viewOf(refusal.recipeId)?.title ?? planner.day.recipeMissing)
      : '';
  if (wording.key === 'foods.planner.energyNotKnown' && 'floorKj' in refusal) {
    return {
      text:
        energyNotKnownMessage({
          ok: false,
          reason: 'energy-not-known',
          floorKj: refusal.floorKj,
        }) ?? '',
      then: wording.then,
    };
  }
  const values: Record<string, string> = {
    title,
    allergens: 'conflicts' in refusal ? allergenListText(refusal.conflicts) : '',
    protein: 'proteinG' in refusal ? formatNumber(refusal.proteinG) : '',
    floorKj: 'floorKj' in refusal ? formatNumber(refusal.floorKj) : '',
    floorKcal: 'floorKj' in refusal ? formatAboutKcal(refusal.floorKj) : '',
  };
  return { text: fillTemplate(TEXT[wording.key], values), then: wording.then };
}

/** A thrown write's line (design 2.17): never the reason of a refusal, which comes as a value. */
export function writeFailure(error: unknown): string {
  if (error instanceof StorageFullError) return privacy.storageFull;
  if (error instanceof StorageClosedError) return privacy.backupCard.closed;
  return planner.refused.failed;
}

/** The line for a removal the repository did not make (it names no reason of its own). */
export const removeFailedText = planner.refused.failed;

/** A copy skip's line (design 2.7). */
export function skipText(
  skip: CopySkip,
  window: EatingWindow | null,
  lookup: Pick<PlanRecipeLookup, 'viewOf'>,
): string {
  return skip.why === 'slot'
    ? fillTemplate(planner.reasons.slotSkipped, { slot: slotLabel(skip.slot, window) })
    : fillTemplate(planner.reasons.notWanted, {
        title: lookup.viewOf(skip.recipeId)?.title ?? planner.day.recipeMissing,
      });
}

/** The word a slot gets on a day (V49). */
export const slotLabel = (slot: MealSlot, window: EatingWindow | null): string =>
  planner.slots[slotLabelKey(slot, window)];

export const slotLabelLower = (slot: MealSlot, window: EatingWindow | null): string =>
  planner.slotsLower[slotLabelKey(slot, window)];

/** "1.5 serves · cooking for 3": the owner's portion, and the household only when above 1. */
export function portionWords(myServes: number, householdServes: number): string {
  const p = portionText(myServes);
  const portion =
    p.kind === 'half'
      ? planner.portion.half
      : p.kind === 'one'
        ? planner.portion.one
        : fillTemplate(planner.portion.many, { serves: p.serves });
  return householdServes > 1
    ? fillTemplate(planner.portion.joined, {
        portion,
        cookingFor: fillTemplate(planner.portion.cookingFor, { count: householdServes }),
      })
    : portion;
}
