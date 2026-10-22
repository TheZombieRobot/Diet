/**
 * Which sentence a plan refusal gets, and what follows it (item 22 design 3.15 and 2.17; T25, T26,
 * HS-18; V26, V40, V50). Under plain figures no chosen sentence names a target or a figure, apart
 * from the floor sentences, which are a safety net; under the pregnancy note no energy sentence
 * names an energy target. A one-meal refusal offers the 5 pm snack only when it fits, otherwise
 * the widen line with the eating schedule; during a stop-sign pause a reflux refusal names no
 * window-moving option (F20). No screen picks a sentence itself.
 */
import type { AutoFillRefusal } from './autoFill';
import type { CopyRefusal } from './copyWeek';
import type { PlanWriteRefusal } from './planWrite';

export type PlanReasonKey =
  | 'planner.refused.failed'
  | 'planner.refused.pastDay'
  | 'planner.refused.futureDay'
  | 'planner.refused.slot'
  | 'planner.refused.recipeMissing'
  | 'planner.refused.portion'
  | 'planner.refused.allergen'
  | 'planner.refused.labelCheck'
  | 'planner.reasons.pastDay'
  | 'planner.reasons.recipeMissing'
  | 'planner.reasons.portion'
  | 'planner.reasons.notWantedDay'
  | 'planner.reasons.allergen'
  | 'planner.reasons.labelCheck'
  | 'planner.reasons.hasMeals'
  | 'planner.reasons.noCandidates'
  | 'planner.reasons.energyNotKnownAim'
  | 'planner.reasons.energyShort'
  | 'planner.reasons.proteinNotKnown'
  | 'planner.reasons.proteinShort'
  | 'planner.reasons.plainNotKnown'
  | 'planner.reasons.plainNotFilled'
  | 'planner.reasons.oneMealShort'
  | 'planner.reasons.oneMealShortNoSnack'
  | 'planner.reasons.oneMealDish'
  | 'planner.reasons.oneMealReflux'
  | 'planner.reasons.oneMealRefluxPause'
  | 'planner.reasons.carbsNotKnown'
  | 'planner.reasons.carbsOver'
  | 'planner.reasons.satFatNotKnown'
  | 'planner.reasons.satFatOver'
  | 'planner.week.noFillNoEstimate'
  | 'targets.plannerFloor.noGuide'
  | 'targets.plannerFloor.refused'
  | 'foods.planner.energyNotKnown';

export interface PlanReasonWording {
  readonly key: PlanReasonKey;
  /** What follows the sentence (2.6, 2.17). */
  readonly then: 'add-snack' | 'widen-and-schedule' | 'schedule' | 'reflux-options' | null;
}

export interface PlanReasonOptions {
  readonly plainFigures: boolean;
  readonly pregnancyNote: boolean;
  readonly snackFits: boolean;
  /** A stop-sign pause holds: no sentence offers an option that moves the window (F20). */
  readonly stopSignPause: boolean;
  /** The date has an eating window (the widen line needs one). */
  readonly hasWindow: boolean;
  readonly where: 'owner' | 'preview';
}

const say = (key: PlanReasonKey, then: PlanReasonWording['then'] = null): PlanReasonWording => ({
  key,
  then,
});

export function planReasonWording(
  refusal: PlanWriteRefusal | AutoFillRefusal | CopyRefusal,
  opts: PlanReasonOptions,
): PlanReasonWording {
  const owner = opts.where === 'owner';
  const plain = opts.plainFigures;
  const plainEnergy = plain || opts.pregnancyNote;
  switch (refusal.reason) {
    case 'kind':
    case 'replace':
      return say('planner.refused.failed');
    case 'past-day':
      return say(owner ? 'planner.refused.pastDay' : 'planner.reasons.pastDay');
    case 'future-day':
      return say('planner.refused.futureDay');
    case 'slot':
      return say('planner.refused.slot', owner && opts.hasWindow ? 'widen-and-schedule' : null);
    case 'recipe-missing':
      return say(owner ? 'planner.refused.recipeMissing' : 'planner.reasons.recipeMissing');
    case 'portion':
      return say(owner ? 'planner.refused.portion' : 'planner.reasons.portion');
    case 'not-wanted':
      return say('planner.reasons.notWantedDay');
    case 'allergen-conflict':
      return say(owner ? 'planner.refused.allergen' : 'planner.reasons.allergen');
    case 'label-check-needed':
      return say(owner ? 'planner.refused.labelCheck' : 'planner.reasons.labelCheck');
    case 'no-guide':
      return say('targets.plannerFloor.noGuide');
    case 'no-estimate':
      return say('planner.week.noFillNoEstimate');
    case 'below-floor':
      return say('targets.plannerFloor.refused');
    case 'energy-not-known':
      return say('foods.planner.energyNotKnown');
    case 'energy-not-known-aim':
      return say(
        plainEnergy ? 'planner.reasons.plainNotKnown' : 'planner.reasons.energyNotKnownAim',
      );
    case 'energy-short':
      return say(plainEnergy ? 'planner.reasons.plainNotFilled' : 'planner.reasons.energyShort');
    case 'protein-not-known':
      return say(plain ? 'planner.reasons.plainNotKnown' : 'planner.reasons.proteinNotKnown');
    case 'protein-short':
      return say(plain ? 'planner.reasons.plainNotFilled' : 'planner.reasons.proteinShort');
    case 'one-meal-short':
      return opts.snackFits
        ? say('planner.reasons.oneMealShort', 'add-snack')
        : say('planner.reasons.oneMealShortNoSnack', 'schedule');
    case 'one-meal-dish':
      return say('planner.reasons.oneMealDish');
    case 'one-meal-reflux':
      return opts.stopSignPause
        ? say('planner.reasons.oneMealRefluxPause')
        : say('planner.reasons.oneMealReflux', 'reflux-options');
    case 'carbs-not-known':
      return say(plain ? 'planner.reasons.plainNotKnown' : 'planner.reasons.carbsNotKnown');
    case 'carbs-over':
      return say(plain ? 'planner.reasons.plainNotFilled' : 'planner.reasons.carbsOver');
    case 'sat-fat-not-known':
      return say(plain ? 'planner.reasons.plainNotKnown' : 'planner.reasons.satFatNotKnown');
    case 'sat-fat-over':
      return say(plain ? 'planner.reasons.plainNotFilled' : 'planner.reasons.satFatOver');
    case 'no-candidates':
      return say('planner.reasons.noCandidates');
    case 'has-meals':
      return say('planner.reasons.hasMeals');
  }
}
