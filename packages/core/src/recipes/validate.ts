/**
 * The recipe dataset's rules (checklist item 20; item 20 design 2.8; NU-11). They run on the
 * shipped file against item 18's catalogue in CI (dataset.test.ts) and on first use in the app,
 * which refuses a file that breaks one. Pass 1 checks shapes and sets a broken record aside; pass
 * 2 runs each record's own rules; pass 3 the rules across records, only when pass 1 found nothing.
 * recipeDataProblems never throws. A problem names a path and a rule, never a value.
 */
import { CHEESE_FLAG_ABOVE_G, heartRoleOf } from '../foods/heart';
import type { FoodDataOk } from '../foods/dataset';
import { APPROVED_NUTRIENT_SOURCES } from '../foods/approval';
import { deepFrozenCopy } from '../foods/validate';
import { allSeedViews } from '../foods/view';
import { MEAL_SLOTS } from '../fasting/mealCheck';
import { ALLERGENS, sortAllergens } from '../storage/allergens';
import { foodAllergenFacts, ingredientResolver } from '../storage/overrides';
import { FORBIDDEN_KEYS, isSeedId, isText } from '../storage/primitives';
import { DIET_MODES } from '../targets/dietModes';
import {
  EDIBLE_G_PER_EGG,
  FIRM_TOFU_ID,
  FIRST_WEEK_DAYS,
  FIRST_WEEK_MAX_EGGS,
  LEAN_MINCE_ID,
  MAX_EGGS_PER_SERVE,
  MAX_SWAPS_PER_LINE,
  RECIPE_ALCOHOL_WORDS,
  RECIPE_IDS_V1,
  SALTY_SEED_IDS,
  SILVERBEET_ID,
  SOY_SAUCE_RECIPE_IDS,
  STYLE_MAX_NET_CARBS_PER_SERVE_G,
  YIELD_BANDS,
} from './constants';
import { lineKindOf, type RecipeFoods } from './foodKind';
import { eggsPerServe, heartSmart, heartSmartInput } from './heartSmart';
import { type RecipeNutrition, recipeNutrition } from './nutrition';
import type { RecipeData, SeedRecipe } from './types';

export const RECIPE_DATA_RULES = Object.freeze([
  'shape',
  'id',
  'text',
  'numbers',
  'slots',
  'style',
  'ingredient',
  'basis',
  'allergens-match',
  'cooked-weight',
  'eggs',
  'cholesterol',
  'salt',
  'leftovers',
  'wording',
  'first-week',
  'coverage',
] as const);
export type RecipeDataRule = (typeof RECIPE_DATA_RULES)[number];

/** Where a rule failed, as `recipes[6].lines[2].cookedG`. No value is ever included. */
export interface RecipeDataProblem {
  readonly path: string;
  readonly rule: RecipeDataRule;
}

export class RecipeDataError extends Error {
  readonly problems: readonly RecipeDataProblem[];

  constructor(problems: readonly RecipeDataProblem[]) {
    super(`The recipe dataset breaks ${problems.length} rule(s)`);
    this.problems = problems;
  }
}
RecipeDataError.prototype.name = 'RecipeDataError';

/**
 * Dataset text holds titles, steps and amounts only (design 5.4): no health, diet, allergen,
 * medical, commerce or alcohol words (claims come from data and health.ts), and food cooked through.
 */
export const RECIPE_WORDING_BANS: readonly RegExp[] = Object.freeze([
  /\b(?:health\w*|heart\w*|cholesterol|immun\w*|detox\w*|cleans\w*|superfood\w*|cure\w*|heal\w*|boost\w*|nutritious|wholesome)\b/i,
  /\bclean\s+eating\b/i,
  /\b(?:keto\w*|low[\s-]?carb\w*|carbs?|carbohydrates?|protein\w*|calori\w*|kilojoules?|kj|kcal|macros?|burn\w*|slim\w*|skinny|diet\w*|weight|guilt\w*|cheat\w*|sinful|naughty|indulg\w*)\b/i,
  /\b(?:safe\w*|allerg\w*|gluten[\s-]?free|dairy[\s-]?free|free[\s-]?from|intoleran\w*|vegan|vegetarian)\b/i,
  /\b(?:doctor|GP|dietitian|medical|medicine\w*|pharmac\w*|midwi\w*|prescri\w*)\b/i,
  /\b(?:cheap\w*|budget|bargain|price\w*|specials?|sale|stock|basket|trolley|cart|brand\w*|value)\b/i,
  /\b(?:rare|pink\s+in\s+the\s+middle|undercooked|runny|raw\s+eggs?|soft[\s-]?boiled)\b/i,
  RECIPE_ALCOHOL_WORDS,
]);

const TOP_KEYS = ['datasetVersion', 'recipes', 'ketoFirstWeek'];
const RECIPE_KEYS = [
  'id',
  'title',
  'serves',
  'timeMinutes',
  'slots',
  'carbStyle',
  'oneMealOk',
  'lines',
  'method',
  'allergens',
  'usesLeftoversFrom',
];
const LINE_KEYS = ['ingredientId', 'rawG', 'cookedG', 'displayAs', 'swaps', 'leftover'];
const WEEK_KEYS = ['dinners', 'snacks'];
const ID_PATTERN = /^seed:recipe-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_RECIPES = 60;

type Obj = Readonly<Record<string, unknown>>;
const isRecord = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasExactKeys = (v: Obj, keys: readonly string[]): boolean => {
  const own = Object.keys(v);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(v, k));
};
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const isWhole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.keys(value).some(
    (k) => (FORBIDDEN_KEYS as readonly string[]).includes(k) || hasForbiddenKey(value[k]),
  );
}

function lineShapeOk(line: unknown): boolean {
  return (
    isRecord(line) &&
    hasExactKeys(line, LINE_KEYS) &&
    typeof line['ingredientId'] === 'string' &&
    isFiniteNumber(line['rawG']) &&
    (line['cookedG'] === null || isFiniteNumber(line['cookedG'])) &&
    typeof line['displayAs'] === 'string' &&
    isStringArray(line['swaps']) &&
    typeof line['leftover'] === 'boolean'
  );
}

function recipeShapeOk(recipe: unknown): recipe is SeedRecipe {
  return (
    isRecord(recipe) &&
    hasExactKeys(recipe, RECIPE_KEYS) &&
    typeof recipe['id'] === 'string' &&
    typeof recipe['title'] === 'string' &&
    isWhole(recipe['serves']) &&
    isWhole(recipe['timeMinutes']) &&
    isStringArray(recipe['slots']) &&
    typeof recipe['carbStyle'] === 'string' &&
    typeof recipe['oneMealOk'] === 'boolean' &&
    Array.isArray(recipe['lines']) &&
    recipe['lines'].every(lineShapeOk) &&
    isStringArray(recipe['method']) &&
    isStringArray(recipe['allergens']) &&
    (recipe['usesLeftoversFrom'] === null || typeof recipe['usesLeftoversFrom'] === 'string')
  );
}

/** The shipped data as item 18 reads it: the catalogue's views, no owner changes. */
function datasetFoods(foods: FoodDataOk): RecipeFoods {
  return {
    resolve: ingredientResolver(allSeedViews(foods), [], []),
    seedById: foods.seedById,
    approved: APPROVED_NUTRIENT_SOURCES,
  };
}

/** A record's figures, or null when its numbers or ingredients would make them meaningless. */
function figuresOf(recipe: SeedRecipe, foods: RecipeFoods): RecipeNutrition | null {
  try {
    return recipeNutrition(recipe, foods);
  } catch {
    return null;
  }
}

function recipeProblems(
  recipe: SeedRecipe,
  at: string,
  foods: RecipeFoods,
  add: (path: string, rule: RecipeDataRule) => void,
): void {
  const { seedById } = foods;
  if (!ID_PATTERN.test(recipe.id) || !isSeedId(recipe.id)) add(`${at}.id`, 'id');

  // text
  if (!isText(recipe.title, 1, 100)) add(`${at}.title`, 'text');
  if (recipe.method.length < 1 || recipe.method.length > 12) add(`${at}.method`, 'text');
  recipe.method.forEach((step, k) => {
    if (!isText(step, 1, 500) || !step.endsWith('.')) add(`${at}.method[${k}]`, 'text');
  });

  // numbers (a flag object: the checks below set it from callbacks)
  const ok = { numbers: true, lines: true };
  const number = (path: string) => {
    ok.numbers = false;
    add(path, 'numbers');
  };
  if (recipe.serves < 1 || recipe.serves > 8) number(`${at}.serves`);
  if (recipe.timeMinutes < 1 || recipe.timeMinutes > 600) number(`${at}.timeMinutes`);
  if (recipe.lines.length < 1 || recipe.lines.length > 20) number(`${at}.lines`);

  // slots
  const slots: readonly string[] = recipe.slots;
  const order = slots.map((s) => (MEAL_SLOTS as readonly string[]).indexOf(s));
  if (slots.length === 0 || order.some((i, k) => i < 0 || (k > 0 && i <= (order[k - 1] ?? -1))))
    add(`${at}.slots`, 'slots');

  // the lines
  let cheeseG = 0;
  const kinds = recipe.lines.map((line) => lineKindOf(line.ingredientId, foods));
  recipe.lines.forEach((line, j) => {
    const lp = `${at}.lines[${j}]`;
    if (!isText(line.displayAs, 1, 40)) add(`${lp}.displayAs`, 'text');
    if (line.rawG <= 0 || line.rawG > 5000) number(`${lp}.rawG`);
    if (line.cookedG !== null && (line.cookedG <= 0 || line.cookedG > 5000))
      number(`${lp}.cookedG`);
    const seed = seedById.get(line.ingredientId);
    if (seed === undefined) {
      ok.lines = false;
      add(`${lp}.ingredientId`, 'ingredient');
    } else {
      if ([seed.name, ...seed.aliases].some((n) => RECIPE_ALCOHOL_WORDS.test(n)))
        add(`${lp}.ingredientId`, 'ingredient');
      if (seed.basis !== 'raw' && seed.basis !== 'as-sold') add(`${lp}.ingredientId`, 'basis');
    }
    const swapIds: readonly string[] = line.swaps;
    if (
      swapIds.length > MAX_SWAPS_PER_LINE ||
      new Set(swapIds).size !== swapIds.length ||
      swapIds.includes(line.ingredientId)
    )
      add(`${lp}.swaps`, 'ingredient');
    swapIds.forEach((id, k) => {
      const swap = seedById.get(id);
      if (
        swap === undefined ||
        swap.basis === 'cooked' ||
        [swap.name, ...swap.aliases].some((n) => RECIPE_ALCOHOL_WORDS.test(n))
      )
        add(`${lp}.swaps[${k}]`, 'ingredient');
      // A curated swap never makes the dish flagged (REQUIREMENTS 2): no flagging food, and no
      // cheese over the limit at this line's weight a serve.
      const role = swap === undefined ? null : heartRoleOf(swap);
      if (
        role?.kind === 'flag' &&
        (role.aboveGramsPerServe === 0 || line.rawG / recipe.serves > role.aboveGramsPerServe)
      )
        add(`${lp}.swaps[${k}]`, 'cholesterol');
    });
    // salt: no added salt; soy sauce only in the four recipes written with it.
    const salty: readonly string[] = SALTY_SEED_IDS;
    if (
      salty.includes(line.ingredientId) &&
      !(line.ingredientId === 'seed:soy-sauce' && SOY_SAUCE_RECIPE_IDS.includes(recipe.id))
    )
      add(`${lp}.ingredientId`, 'salt');
    const kind = kinds[j];
    if (seed !== undefined && kind !== undefined) {
      // cooked-weight (C29, C67): protein foods carry one; ready-to-eat foods and eggs equal raw.
      if (kind.proteinFood !== (line.cookedG !== null)) add(`${lp}.cookedG`, 'cooked-weight');
      else if (line.cookedG !== null) {
        const band = YIELD_BANDS[seed.group];
        const ratio = line.cookedG / line.rawG;
        const ok =
          seed.basis === 'as-sold' || kind.egg
            ? line.cookedG === line.rawG
            : band !== undefined && ratio >= band[0] - 1e-9 && ratio <= band[1] + 1e-9;
        if (!ok) add(`${lp}.cookedG`, 'cooked-weight');
      }
      if (kind.egg && line.rawG % EDIBLE_G_PER_EGG !== 0) add(`${lp}.rawG`, 'eggs');
      if (kind.role.kind === 'flag') {
        if (kind.role.aboveGramsPerServe === 0) add(`${lp}.ingredientId`, 'cholesterol');
        else cheeseG += line.rawG;
      }
    }
  });

  // allergens-match (HS-24, C43): exactly what the lines are known to contain, complete or not.
  const declared: readonly string[] = recipe.allergens;
  const known = (ALLERGENS as readonly string[]).filter((a) => declared.includes(a));
  const union = sortAllergens(
    recipe.lines.flatMap((line) => {
      const view = foods.resolve(line.ingredientId);
      return view === null ? [] : [...foodAllergenFacts(view).allergens];
    }),
  );
  if (
    !ok.lines ||
    known.length !== declared.length ||
    known.join() !== declared.join() ||
    union.join() !== known.join()
  )
    add(`${at}.allergens`, 'allergens-match');

  // style (P11)
  if (!(DIET_MODES as readonly string[]).includes(recipe.carbStyle))
    add(`${at}.carbStyle`, 'style');

  // leftovers: leftover lines exactly when the recipe uses leftovers.
  const hasLeftover = recipe.lines.some((line) => line.leftover);
  if (hasLeftover !== (recipe.usesLeftoversFrom !== null))
    add(`${at}.usesLeftoversFrom`, 'leftovers');

  // wording (C16, C11)
  const texts = [
    [`${at}.title`, recipe.title],
    ...recipe.method.map((step, k) => [`${at}.method[${k}]`, step]),
    ...recipe.lines.map((line, j) => [`${at}.lines[${j}].displayAs`, line.displayAs ?? '']),
  ] as const;
  for (const [path, text] of texts) {
    if (RECIPE_WORDING_BANS.some((ban) => ban.test(text))) add(path, 'wording');
  }

  if (!ok.numbers || !ok.lines) return;
  if (cheeseG / recipe.serves > CHEESE_FLAG_ABOVE_G) add(`${at}.lines`, 'cholesterol');
  if (eggsPerServe(recipe.lines, kinds, recipe.serves) > MAX_EGGS_PER_SERVE + 1e-9)
    add(`${at}.lines`, 'eggs');
  const n = figuresOf(recipe, foods);
  if (n === null) return;
  // Complete figures or a lower bound: a lower bound already over a limit can only be higher, so
  // a partly loaded release that breaks the written style or the saturated-fat cap fails too.
  const style = recipe.carbStyle;
  if (style !== 'balanced' && n.perServe.carbsG > STYLE_MAX_NET_CARBS_PER_SERVE_G[style])
    add(`${at}.carbStyle`, 'style');
  if (heartSmart(heartSmartInput(n, recipe.serves, recipe.lines)).kind === 'flagged')
    add(`${at}.lines`, 'cholesterol');
}

function crossProblems(
  data: RecipeData,
  foods: RecipeFoods,
  add: (path: string, rule: RecipeDataRule) => void,
): void {
  const { recipes } = data;
  const byId = new Map<string, SeedRecipe>();
  recipes.forEach((recipe, i) => {
    if (byId.has(recipe.id)) add(`recipes[${i}].id`, 'id');
    else byId.set(recipe.id, recipe);
  });
  if (RECIPE_IDS_V1.some((id) => !byId.has(id))) add('recipes', 'id');
  const titles = new Set<string>();
  recipes.forEach((recipe, i) => {
    const key = recipe.title.toLowerCase();
    if (titles.has(key)) add(`recipes[${i}].title`, 'text');
    titles.add(key);
  });

  // leftovers: the source is another recipe, and has each leftover line's ingredient.
  recipes.forEach((recipe, i) => {
    if (recipe.usesLeftoversFrom === null) return;
    const source = byId.get(recipe.usesLeftoversFrom);
    if (source === undefined || source.id === recipe.id) {
      add(`recipes[${i}].usesLeftoversFrom`, 'leftovers');
      return;
    }
    recipe.lines.forEach((line, j) => {
      if (line.leftover && !source.lines.some((s) => s.ingredientId === line.ingredientId))
        add(`recipes[${i}].lines[${j}]`, 'leftovers');
    });
  });

  // first-week (REQUIREMENTS 3D; P4, P25, P33)
  const kindsOf = (recipe: SeedRecipe) =>
    recipe.lines.map((line) => lineKindOf(line.ingredientId, foods));
  const week = data.ketoFirstWeek;
  if (week.dinners.length !== FIRST_WEEK_DAYS || new Set(week.dinners).size !== FIRST_WEEK_DAYS)
    add('ketoFirstWeek.dinners', 'first-week');
  if (week.snacks.length !== FIRST_WEEK_DAYS) add('ketoFirstWeek.snacks', 'first-week');
  let weekEggs = 0;
  const checkDay = (list: 'dinners' | 'snacks', id: string, day: number) => {
    const path = `ketoFirstWeek.${list}[${day}]`;
    const recipe = byId.get(id);
    if (recipe === undefined) {
      add(path, 'first-week');
      return;
    }
    const slot = list === 'dinners' ? 'dinner' : 'snack';
    if (!recipe.slots.includes(slot) || recipe.carbStyle !== 'keto') add(path, 'first-week');
    if (list === 'dinners' && !recipe.lines.some((l) => l.ingredientId === SILVERBEET_ID))
      add(path, 'first-week');
    if (recipe.usesLeftoversFrom !== null && week.dinners[day - 1] !== recipe.usesLeftoversFrom)
      add(path, 'first-week');
    weekEggs += eggsPerServe(recipe.lines, kindsOf(recipe), recipe.serves);
  };
  week.dinners.forEach((id, day) => {
    checkDay('dinners', id, day);
  });
  week.snacks.forEach((id, day) => {
    checkDay('snacks', id, day);
  });
  if (weekEggs > FIRST_WEEK_MAX_EGGS + 1e-9) add('ketoFirstWeek', 'first-week');

  // coverage (checklist item 20; the owner's two tofu dinners; P4)
  const dinners = recipes.filter((r) => r.slots.includes('dinner'));
  const seedOf = (id: string) => foods.seedById.get(id);
  const has = (recipe: SeedRecipe, test: (id: string) => boolean) =>
    recipe.lines.some((line) => test(line.ingredientId));
  const group = (id: string) => seedOf(id)?.group;
  const isFish = (id: string) => group(id) === 'oily-fish' || group(id) === 'lean-fish';
  const tofu = dinners.filter((r) => has(r, (id) => id === FIRM_TOFU_ID));
  const flagged = (recipe: SeedRecipe) => {
    const n = figuresOf(recipe, foods);
    return (
      n === null || heartSmart(heartSmartInput(n, recipe.serves, recipe.lines)).kind === 'flagged'
    );
  };
  const covered =
    tofu.length === 2 &&
    tofu.every((r) => r.carbStyle === 'keto' && !flagged(r)) &&
    dinners.some((r) => has(r, (id) => group(id) === 'poultry')) &&
    dinners.some((r) => has(r, (id) => group(id) === 'egg')) &&
    dinners.some((r) => has(r, (id) => isFish(id) && seedOf(id)?.aisle === 'Pantry')) &&
    dinners.some((r) => has(r, (id) => id === LEAN_MINCE_ID)) &&
    dinners.some((r) => has(r, (id) => isFish(id) && seedOf(id)?.aisle === 'Meat and fish')) &&
    recipes.filter((r) => has(r, (id) => group(id) === 'leafy-green')).length >= 10 &&
    recipes.some((r) => r.usesLeftoversFrom !== null) &&
    dinners.some((r) => r.carbStyle === 'moderate-low-carb') &&
    dinners.some((r) => r.carbStyle === 'balanced') &&
    dinners.filter((r) => r.carbStyle !== 'keto' && has(r, (id) => id === SILVERBEET_ID)).length >=
      3 &&
    recipes.filter((r) => r.slots.includes('snack')).length >= 5 &&
    recipes.filter((r) => r.slots.includes('breakfast') || r.slots.includes('lunch')).length >= 3;
  if (!covered) add('recipes', 'coverage');
}

/** Every problem with a dataset file against item 18's catalogue; [] when it may ship. Never throws. */
export function recipeDataProblems(raw: unknown, foods: FoodDataOk): RecipeDataProblem[] {
  const problems: RecipeDataProblem[] = [];
  const add = (path: string, rule: RecipeDataRule) => {
    problems.push({ path, rule });
  };
  try {
    if (hasForbiddenKey(raw)) add('', 'shape');
    if (!isRecord(raw) || !hasExactKeys(raw, TOP_KEYS)) {
      add('', 'shape');
      return problems;
    }
    if (raw['datasetVersion'] !== 1) add('datasetVersion', 'shape');
    const week = raw['ketoFirstWeek'];
    if (
      !isRecord(week) ||
      !hasExactKeys(week, WEEK_KEYS) ||
      !isStringArray(week['dinners']) ||
      !isStringArray(week['snacks'])
    )
      add('ketoFirstWeek', 'shape');
    const list = raw['recipes'];
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_RECIPES) {
      add('recipes', 'shape');
      return problems;
    }
    const recipeFoods = datasetFoods(foods);
    list.forEach((recipe: unknown, i) => {
      if (!recipeShapeOk(recipe)) {
        add(`recipes[${i}]`, 'shape');
        return;
      }
      recipeProblems(recipe, `recipes[${i}]`, recipeFoods, add);
    });
    if (problems.some((p) => p.rule === 'shape')) return problems;
    crossProblems(raw as unknown as RecipeData, recipeFoods, add);
  } catch {
    add('', 'shape');
  }
  return problems;
}

/** The typed, deep-frozen dataset, or throws RecipeDataError with every problem. */
export function parseRecipeData(raw: unknown, foods: FoodDataOk): RecipeData {
  const problems = recipeDataProblems(raw, foods);
  if (problems.length > 0) throw new RecipeDataError(problems);
  return deepFrozenCopy(raw as RecipeData);
}
