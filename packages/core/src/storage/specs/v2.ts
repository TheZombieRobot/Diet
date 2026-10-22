/**
 * Schema version 2 (checklist item 23; item 18–20 contract section 8; cross-item ruling 10).
 * Released at the item-23 commit and NEVER edited afterwards, as version 1.
 *
 * A widening only: food_log rows of kind 'recipe' or 'plan', and recipes rows, may list all eight
 * figures as unknown (D35 as amended), so a recipe whose ingredients have no figures yet is stored
 * with every figure not known instead of invented ones. A label entry still lists at most fibre
 * and an estimate never all eight. Every other store, field and rule is version 1's, reused by
 * reference, so the migration step is the identity.
 */
import { NUTRIENT_KEYS } from '../../nutrition/nutrients';
import {
  array,
  enumOf,
  fail,
  fieldPath,
  object,
  type ObjectValidator,
  rule,
  type TableSpec,
} from '../primitives';
import type { FoodLogRecord, RecipeRecord, StoreName, StoreRecords } from '../records';
import { ROWS_V1, TABLES_V1 } from './v1';

/** D35 as amended: unique, in NUTRIENT_KEYS order, up to all eight. */
const unknownNutrientsUpToAll = array(enumOf(NUTRIENT_KEYS), {
  max: NUTRIENT_KEYS.length,
  unique: 'value',
  order: { in: NUTRIENT_KEYS },
});

/** The kinds whose figures come from a recipe's lines, which may all lack figures. */
const ALL_UNKNOWN_KINDS = [
  'recipe',
  'plan',
] as const satisfies readonly FoodLogRecord['sourceKind'][];

const foodLogV1: ObjectValidator<FoodLogRecord> = ROWS_V1.food_log;
const foodLog = object<FoodLogRecord>(
  { ...foodLogV1.fields, unknownNutrients: unknownNutrientsUpToAll },
  [
    ...foodLogV1.rules,
    rule<FoodLogRecord>(
      'all-unknown-only-for-recipe-or-plan',
      (f, path) =>
        f.unknownNutrients.length === NUTRIENT_KEYS.length &&
        !(ALL_UNKNOWN_KINDS as readonly string[]).includes(f.sourceKind)
          ? fail(fieldPath(path, 'unknownNutrients'), 'length')
          : null,
      { kinds: [...ALL_UNKNOWN_KINDS] },
    ),
  ],
);

const recipeV1: ObjectValidator<RecipeRecord> = ROWS_V1.recipes;
const recipe = object<RecipeRecord>(
  { ...recipeV1.fields, unknownNutrients: unknownNutrientsUpToAll },
  recipeV1.rules,
);

/** TABLES_V2: version 1's specs with the food_log and recipes rows widened. */
export const TABLES_V2: { readonly [K in StoreName]: TableSpec<StoreRecords[K]> } = Object.freeze({
  ...TABLES_V1,
  food_log: Object.freeze({ ...TABLES_V1.food_log, row: foodLog }),
  recipes: Object.freeze({ ...TABLES_V1.recipes, row: recipe }),
});
