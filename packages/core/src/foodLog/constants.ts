/**
 * The food log's limits and tolerances (item 23 design 2.1). None is read by a validator, so none
 * joins VALIDATOR_CONSTANTS; a test ties LOG_GRAMS_MAX and WATER_ENTRY_ML to the validators.
 */
import { MAX_MY_SERVES } from '../nutrition/portion';
import { RECIPE_ALCOHOL_WORDS } from '../recipes/constants';
import { FAT_KJ_PER_G } from '../targets/constants';

/** FSANZ Food Standards Code, Standard 1.2.8 / Schedule 11 energy factors, kJ per gram (fat is item 21's FAT_KJ_PER_G). */
export const LABEL_ENERGY_KJ_PER_G = Object.freeze({
  protein: 17,
  fat: FAT_KJ_PER_G,
  carbs: 17,
  fibre: 8,
});
/** A label's energy is checked against its macronutrients: a difference above both of these asks the owner to check. */
export const LABEL_ENERGY_CHECK = Object.freeze({ minKj: 150, fraction: 0.2 });
/**
 * Protein + fat + available carbohydrate + fibre per 100 g may not exceed this. Labels round each
 * figure, and "less than 1 g" is entered as 1 (four such figures add at most 4 g), so a larger sum
 * is a typo.
 */
export const LABEL_MACRO_SUM_MAX_G = 104;
/** Saturated fat over fat, or sugars over carbohydrate, by more than this asks the owner to check (label rounding). */
export const LABEL_PART_TOLERANCE_G = 0.05;
/** Figures shown in the change form: at most this many decimals, trailing zeros dropped. */
export const LABEL_FORM_DECIMALS = 2;
/** The longest label-food name (ingredients.name allows more; the log row's name 100). */
export const LABEL_NAME_MAX = 80;
/** Item 20's alcohol words plus drink styles and names often on NZ labels ("Steinlager"). */
export const LABEL_DRINK_WORDS = new RegExp(
  `${RECIPE_ALCOHOL_WORDS.source}|\\b\\w*lager\\b|\\b(?:pinot|sauvignon|chardonnay|merlot|shiraz|riesling|prosecco|champagne|pils(?:e)?ner|ipa|stout|alcopops?|rtds?|hard\\s+seltzers?)\\b`,
  'i',
);
/** Taken out of a name before LABEL_DRINK_WORDS is tried: foods and soft drinks named after a drink. */
export const LABEL_DRINK_EXEMPT = /\b(?:\w+\s+)?vinegar\b|\bginger\s+beer\b|\broot\s+beer\b/gi;
/** Serves of a recipe or plan meal in one entry. */
export const LOG_SERVES = Object.freeze({ min: 0.25, max: MAX_MY_SERVES, step: 0.25 });
/** The gram limit of one entry (food_log.grams, storage 4.7). */
export const LOG_GRAMS_MAX = 5000;
/** Label serves in one entry (food_log.servings). */
export const LABEL_SERVES_MAX = 10;
/** A serving or pack size on a label (ingredients.servingSizeG and packSizesG, storage 4.7). */
export const SERVING_SIZE_MAX_G = 5000;
export const PACK_SIZE_MAX_G = 50000;
/**
 * Cooked weight ÷ weight before cooking outside this band asks "Is the weight right?" (meat
 * shrinks to about 0.6; rice and pasta swell to about 3).
 */
export const BEFORE_COOKING_RATIO = Object.freeze({ min: 0.3, max: 3.5 });
/** One entry above these asks the owner to check the amount. */
export const LARGE_ENTRY = Object.freeze({ grams: 1000, labelServes: 3 });
/** One water entry (water_log.ml is 0–3000; 0 is only the electrolyte marker). */
export const WATER_ENTRY_ML = Object.freeze({ min: 1, max: 3000 });
/** The ranges the GP summary offers, in days, ending yesterday (HEALTH_SAFETY 4: 8 and 12 weeks). */
export const GP_SUMMARY_RANGE_DAYS = Object.freeze([7, 28, 56, 84] as const);
export type GpRangeDays = (typeof GP_SUMMARY_RANGE_DAYS)[number];
export const GP_SUMMARY_DEFAULT_DAYS: GpRangeDays = 28;
/** Aisle stored on a new label food (STORAGE_DESIGN 4.7 default). */
export const OWN_FOOD_DEFAULT_AISLE = 'Other';
/** Local time (minutes after midnight) of the electrolyte marker row written for a past day: 12:00. */
export const PAST_DAY_MARKER_MINUTES = 720;
/** "Logged recently" looks back this many days, today included. */
export const RECENT_DAYS = 14;
