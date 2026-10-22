/**
 * The recipe dataset's fixed values (checklist item 20; item 20 design 4.1). Nothing here is a
 * daily limit: the floor, ceilings and budgets live in core targets and storage (item 21's scan).
 */
import type { FoodGroup } from '../foods/types';
import type { SeedId } from '../storage/primitives';

/** Every recipe id of dataset version 1, in dataset order. Ids are permanent (design 2.3). */
export const RECIPE_IDS_V1: readonly SeedId[] = Object.freeze([
  'seed:recipe-chicken-silverbeet-traybake',
  'seed:recipe-silverbeet-lemon-chicken-soup',
  'seed:recipe-silverbeet-feta-frittata',
  'seed:recipe-mince-tomato-silverbeet-skillet',
  'seed:recipe-fish-garlicky-silverbeet',
  'seed:recipe-tofu-mushroom-silverbeet-stir-fry',
  'seed:recipe-salmon-silverbeet-patties',
  'seed:recipe-baked-tofu-spinach-avocado',
  'seed:recipe-chicken-kale-chickpeas',
  'seed:recipe-sardine-avocado-cucumber-salad',
  'seed:recipe-tuna-egg-green-bean-salad',
  'seed:recipe-ginger-beef-lettuce-cups',
  'seed:recipe-garlic-chicken-courgette-broccoli',
  'seed:recipe-fish-spinach-tomato-curry',
  'seed:recipe-baked-kahawai-cabbage-slaw',
  'seed:recipe-chicken-egg-cauliflower-fried-rice',
  'seed:recipe-beef-cabbage-stir-fry',
  'seed:recipe-beef-bean-pumpkin-chilli',
  'seed:recipe-red-lentil-silverbeet-soup',
  'seed:recipe-chicken-brown-rice-silverbeet-bowl',
  'seed:recipe-fish-potato-silverbeet-traybake',
  'seed:recipe-snack-eggs-avocado-cucumber',
  'seed:recipe-snack-tuna-cucumber-lemon',
  'seed:recipe-snack-yoghurt-walnuts-berries',
  'seed:recipe-snack-chicken-lettuce-wraps',
  'seed:recipe-snack-salmon-cucumber-bites',
  'seed:recipe-snack-silverbeet-egg-muffins',
  'seed:recipe-eggs-greens-tomatoes',
  'seed:recipe-oats-yoghurt-berries',
  'seed:recipe-chicken-avocado-green-salad',
]);

/** The owner's two tofu dinners (owner request): cholesterol-conscious, written for keto. */
export const TOFU_DINNER_IDS = Object.freeze([
  'seed:recipe-tofu-mushroom-silverbeet-stir-fry',
  'seed:recipe-baked-tofu-spinach-avocado',
] as const);

export const SILVERBEET_ID = 'seed:silverbeet';
export const FIRM_TOFU_ID = 'seed:firm-tofu';
export const LEAN_MINCE_ID = 'seed:beef-mince-lean';
export const FIRST_WEEK_DAYS = 7;
/** HEALTH_SAFETY section 4, "eggs within six a week". */
export const FIRST_WEEK_MAX_EGGS = 6;
/** Net carbs a serve at most, per written style (P11); balanced has no upper bound. */
export const STYLE_MAX_NET_CARBS_PER_SERVE_G = Object.freeze({
  keto: 10,
  'moderate-low-carb': 35,
} as const);
/** "The main fats are unsaturated" (C70): saturated fat at most a quarter of the fat. */
export const HEART_SMART_MAX_SAT_SHARE_OF_FAT = 0.25;
/** FSANZ Standard 1.2.8: the saturated-fat reference value for the %DI on labels. */
export const SAT_FAT_REFERENCE_G = 24;
/** One portion holds at most a third of a day's saturated-fat budget (C70). */
export const HEART_SMART_PORTION_SHARE = 1 / 3;
/** "Legumes in small keto-compatible amounts" (HEALTH_SAFETY section 4; P37), raw grams a serve. */
export const LEGUME_SMALL_G_PER_SERVE = 60;
export const MAX_EGGS_PER_SERVE = 2;
/** A whole egg without its shell; egg lines are written at this weight (N11, never gramsPerEach). */
export const EDIBLE_G_PER_EGG = 50;
/** "Cooking for": the amounts shown, never stored (P19). */
export const SCALE_SERVES_LIMITS = Object.freeze({ min: 1, max: 20 });
export const MAX_SWAPS_PER_LINE = 5;
export const SWAP_HINTS_SHOWN = 3;
/** Item 22 never raises a planned portion above this (design 7, P43). */
export const PLANNER_MY_SERVES_MAX = 2;

/** In-house cooked-to-raw bands for raw protein foods (C29, P20); as-sold foods and eggs equal raw. */
export const YIELD_BANDS: Readonly<Partial<Record<FoodGroup, readonly [number, number]>>> =
  Object.freeze({
    poultry: [0.65, 0.85],
    'red-meat': [0.65, 0.85],
    'lean-fish': [0.75, 0.9],
    'oily-fish': [0.75, 0.9],
    shellfish: [0.75, 0.9],
    legume: [2.0, 3.0],
  });

/** Lines that add salt: their line carries the blood-pressure salt line (C102, P26). */
export const SALTY_SEED_IDS = Object.freeze([
  'seed:soy-sauce',
  'seed:fish-sauce',
  'seed:salt',
  'seed:liquid-stock',
] as const);

/**
 * The recipes with soy sauce, the only salty food a recipe may hold (HEALTH_SAFETY section 4: no
 * added salt; four use soy sauce). The validator refuses salt, fish sauce, stock or more soy sauce.
 */
export const SOY_SAUCE_RECIPE_IDS: readonly SeedId[] = Object.freeze([
  'seed:recipe-tofu-mushroom-silverbeet-stir-fry',
  'seed:recipe-ginger-beef-lettuce-cups',
  'seed:recipe-chicken-egg-cauliflower-fried-rice',
  'seed:recipe-beef-cabbage-stir-fry',
]);

/** Alcohol never enters a recipe, a swap or the recipe wording (C11, P45). */
export const RECIPE_ALCOHOL_WORDS =
  /\b(?:alcohol\w*|wine|wines|beer|beers|ale|lager|cider|spirits?|vodka|gin|rum|whisk(?:e)?y|brandy|sherry|port|mirin|sake|liqueurs?|vermouth|marsala|cognac|tequila|bourbon)\b/i;

/**
 * Whether the current schema stores a recipe whose eight figures are all unknown. False under
 * version 1 (D35); a database test ties it to the validator, so item 23's schema version 2 (the
 * item 18–20 contract 8) must set it to true in the same commit, and swaps then open.
 */
export const RECIPE_SNAPSHOT_ALL_UNKNOWN_STORABLE: boolean = true;
