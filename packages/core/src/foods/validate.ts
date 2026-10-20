/**
 * The ingredient dataset validator (checklist item 18 "validation script"; NU-01; item 18 design
 * section 2.4). It runs on every `pnpm test` through dataset.test.ts (`pnpm foods:check`), and on
 * first use in the app (dataset.ts), so a broken dataset cannot ship and a broken release is never
 * shown.
 *
 * Neither validator throws, whatever it is given, and no problem carries a value: only a path such
 * as `foods[12].aliases[1]` or `foods["seed:spinach"].values.fibreG` (the dataset is public data,
 * so ids may appear) and a rule id. Every problem is collected, not just the first.
 *
 * The catalogue has no nutrient key at all, and an extra key is refused, so a figure can never be
 * slipped into it. The release may hold figures only from a source approved at checklist item 10
 * and attributed (R3, R4); while nothing is approved it must be empty (R12).
 */
import { DEFAULT_GARDEN_NAME } from '../storage/defaults';
import { ALLERGENS, type Allergen } from '../storage/allergens';
import { NUTRIENT_LIMITS_PER_100G } from '../storage/limits';
import {
  FORBIDDEN_KEYS,
  isJsonNumber,
  isLocalDate,
  isPlainObject,
  isSeedId,
  isText,
} from '../storage/primitives';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import { matchKey } from './names';
import {
  type AttributionMap,
  COMPLETE_ALLERGEN_AISLES,
  COMPLETE_ALLERGEN_GROUPS,
  type CountWord,
  type DatabaseSource,
  type FoodCatalogue,
  FOOD_COUNT_RANGE,
  FOOD_GROUPS,
  GENERIC_CUT_NAMES,
  INHERENT_ALLERGENS_BY_GROUP,
  INHERENT_ALLERGENS_BY_ID,
  MIN_LEAFY_GREENS,
  type NutrientRelease,
  PACK_UNITS,
  RELEASE_UNITS,
  type ReleaseRow,
  RESERVED_ID_PREFIXES,
  SEED_AISLES,
  SEED_KEYS,
  type SeedIngredient,
  SINGLE_FOOD_IDS,
} from './types';
import { canonicalFigures } from './view';

export const FOOD_DATA_RULES = Object.freeze([
  'shape',
  'missing',
  'extra-key',
  'forbidden-key',
  'type',
  'format',
  'range',
  'enum',
  'order',
  'unique',
  'duplicate-name',
  'packs',
  'grams-per-each',
  'count-word',
  'allergens-complete',
  'inherent-allergen',
  'garden',
  'season',
  'cooked-form',
  'substitute',
  'lean-name',
  'required-food',
  'leafy-greens',
  'count',
  'reserved-id',
  'not-approved',
  'no-attribution',
  'unknown-food',
  'unit',
  'value-source',
  'empty-row',
  'limit',
  'citation-length',
  'release-not-empty',
] as const);
export type FoodDataRule = (typeof FOOD_DATA_RULES)[number];

export interface FoodDataProblem {
  /** A JSON path such as "foods[12].aliases[1]" ("" for the file itself). */
  readonly path: string;
  readonly rule: FoodDataRule;
}

/** Carries the problems (paths and rule ids only, never a value). */
export class FoodDataError extends Error {
  readonly problems: readonly FoodDataProblem[];

  constructor(problems: readonly FoodDataProblem[]) {
    const listed = problems.map((p) => `${p.path === '' ? '(file)' : p.path} ${p.rule}`);
    super(`The ingredient dataset is not valid: ${listed.join('; ')}`);
    this.problems = Object.freeze([...problems]);
  }
}
FoodDataError.prototype.name = 'FoodDataError';

class Problems {
  private readonly list: FoodDataProblem[] = [];
  private readonly seen = new Set<string>();

  add(path: string, rule: FoodDataRule): void {
    const key = `${path} ${rule}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push(Object.freeze({ path, rule }));
  }

  get count(): number {
    return this.list.length;
  }

  get all(): FoodDataProblem[] {
    return [...this.list];
  }
}

const at = (path: string, key: string | number): string =>
  typeof key === 'number' ? `${path}[${key}]` : path === '' ? key : `${path}.${key}`;
const byId = (path: string, id: string): string => `${path}[${JSON.stringify(id)}]`;

const FORBIDDEN: readonly string[] = FORBIDDEN_KEYS;

/**
 * Checks that `value` is a plain object with exactly `keys`: each missing key, extra key and
 * forbidden key (__proto__, constructor, prototype) is a problem. True when it is a plain object.
 */
function checkKeys(
  value: unknown,
  keys: readonly string[],
  path: string,
  problems: Problems,
): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    problems.add(path, 'type');
    return false;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.includes(key)) problems.add(at(path, key), 'forbidden-key');
    else if (!keys.includes(key)) problems.add(at(path, key), 'extra-key');
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) problems.add(at(path, key), 'missing');
  return true;
}

/** A text field: 'type' when not a string, 'format' when it breaks the storage Text(min–max) rule. */
function checkText(value: unknown, min: number, max: number, path: string, problems: Problems) {
  if (typeof value !== 'string') problems.add(path, 'type');
  else if (!isText(value, min, max)) problems.add(path, 'format');
}

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

function checkCountWord(value: unknown, path: string, problems: Problems): value is CountWord {
  const before = problems.count;
  if (!checkKeys(value, ['one', 'many'], path, problems)) return false;
  checkText(value['one'], 1, 20, at(path, 'one'), problems);
  checkText(value['many'], 1, 20, at(path, 'many'), problems);
  return problems.count === before;
}

function checkAllergenList(value: unknown, path: string, problems: Problems): value is Allergen[] {
  if (!Array.isArray(value)) {
    problems.add(path, 'type');
    return false;
  }
  const before = problems.count;
  const known: readonly unknown[] = ALLERGENS;
  value.forEach((a, i) => {
    if (!known.includes(a)) problems.add(at(path, i), 'enum');
  });
  if (problems.count !== before) return false;
  if (new Set(value).size !== value.length) problems.add(path, 'unique');
  else if (value.some((a, i) => i > 0 && known.indexOf(a) < known.indexOf(value[i - 1])))
    problems.add(path, 'order');
  return problems.count === before;
}

/** True when `food` is a fresh single food, the only kind whose allergen list may be complete (CR11). */
const isFreshSingleFood = (food: Pick<SeedIngredient, 'aisle' | 'group'>): boolean =>
  COMPLETE_ALLERGEN_AISLES.includes(food.aisle) && COMPLETE_ALLERGEN_GROUPS.includes(food.group);

/** "lean", other than in "lean and fat" (rule CR20). */
const LEAN_HINT_RE = /\blean\b(?! and fat)/i;

/**
 * One catalogue food: its keys and each field's type, format and range, then the rules that read
 * only this food (CR7–CR17 in part, CR19, CR20). Returns the food when every field is well formed.
 */
function checkFood(value: unknown, path: string, problems: Problems): SeedIngredient | null {
  const before = problems.count;
  // A food with a missing, extra or forbidden key is set aside: its fields are not read.
  if (!checkKeys(value, SEED_KEYS, path, problems) || problems.count !== before) return null;
  const f = value;
  const p = (key: string) => at(path, key);

  if (typeof f['id'] !== 'string') problems.add(p('id'), 'type');
  else if (!isSeedId(f['id'])) problems.add(p('id'), 'format');
  checkText(f['name'], 1, 80, p('name'), problems);
  if (!Array.isArray(f['aliases'])) problems.add(p('aliases'), 'type');
  else {
    if (f['aliases'].length > 10) problems.add(p('aliases'), 'range');
    f['aliases'].forEach((a, i) => {
      checkText(a, 1, 80, at(p('aliases'), i), problems);
    });
  }
  const aisles: readonly unknown[] = SEED_AISLES;
  const groups: readonly unknown[] = FOOD_GROUPS;
  if (!aisles.includes(f['aisle'])) problems.add(p('aisle'), 'enum');
  if (!groups.includes(f['group'])) problems.add(p('group'), 'enum');

  // packs (CR7): the null-iff-cooked part is checked below, once cookedOf is known to be well formed.
  let unit: unknown = null;
  if (f['packs'] !== null) {
    const packs = f['packs'];
    if (checkKeys(packs, ['unit', 'sizes', 'container'], p('packs'), problems)) {
      unit = packs['unit'];
      const units: readonly unknown[] = PACK_UNITS;
      if (!units.includes(unit)) problems.add(at(p('packs'), 'unit'), 'enum');
      const sizes = packs['sizes'];
      const sizesPath = at(p('packs'), 'sizes');
      if (!Array.isArray(sizes)) problems.add(sizesPath, 'type');
      else {
        if (sizes.length < 1 || sizes.length > 10) problems.add(sizesPath, 'packs');
        sizes.forEach((s, i) => {
          const ok =
            unit === 'each'
              ? isJsonNumber(s) && Number.isSafeInteger(s) && s >= 1 && s <= 100
              : isJsonNumber(s) && s > 0 && s <= 50_000;
          if (!ok) problems.add(at(sizesPath, i), 'range');
        });
        if (sizes.some((s, i) => i > 0 && !((s as number) > (sizes[i - 1] as number))))
          problems.add(sizesPath, 'order');
      }
      const container = packs['container'];
      const containerPath = at(p('packs'), 'container');
      if (container !== null) {
        if (unit === 'each') problems.add(containerPath, 'packs');
        else checkCountWord(container, containerPath, problems);
      }
    }
  }
  if (!isBoolean(f['loose'])) problems.add(p('loose'), 'type');
  const grams = f['gramsPerEach'];
  if (grams !== null && !(isJsonNumber(grams) && grams > 0 && grams <= 5_000))
    problems.add(p('gramsPerEach'), 'range');
  if (f['countWord'] !== null) checkCountWord(f['countWord'], p('countWord'), problems);
  checkAllergenList(f['allergens'], p('allergens'), problems);
  if (!isBoolean(f['allergensComplete'])) problems.add(p('allergensComplete'), 'type');
  if (!isBoolean(f['gardenFlag'])) problems.add(p('gardenFlag'), 'type');
  const months = f['seasonMonths'];
  if (!Array.isArray(months)) problems.add(p('seasonMonths'), 'type');
  else {
    months.forEach((m, i) => {
      if (!(isJsonNumber(m) && Number.isSafeInteger(m) && m >= 1 && m <= 12))
        problems.add(at(p('seasonMonths'), i), 'range');
    });
    if (months.some((m, i) => i > 0 && !((m as number) > (months[i - 1] as number))))
      problems.add(p('seasonMonths'), 'order');
  }
  const bases: readonly unknown[] = ['raw', 'cooked', 'as-sold'];
  if (!bases.includes(f['basis'])) problems.add(p('basis'), 'enum');
  if (f['cookedOf'] !== null) {
    if (typeof f['cookedOf'] !== 'string') problems.add(p('cookedOf'), 'type');
    else if (!isSeedId(f['cookedOf'])) problems.add(p('cookedOf'), 'format');
  }
  const subs = f['substitutes'];
  if (!Array.isArray(subs)) problems.add(p('substitutes'), 'type');
  else {
    if (subs.length > 10) problems.add(p('substitutes'), 'range');
    subs.forEach((s, i) => {
      if (typeof s !== 'string') problems.add(at(p('substitutes'), i), 'type');
      else if (!isSeedId(s)) problems.add(at(p('substitutes'), i), 'format');
    });
    if (new Set(subs).size !== subs.length) problems.add(p('substitutes'), 'unique');
  }
  checkText(f['importHint'], 1, 120, p('importHint'), problems);
  if (problems.count !== before) return null;

  const food = f as unknown as SeedIngredient;
  checkFoodRules(food, path, problems);
  return food;
}

/** The rules of 2.4 that read one well-formed food. */
function checkFoodRules(food: SeedIngredient, path: string, problems: Problems): void {
  const p = (key: string) => at(path, key);
  const cooked = food.cookedOf !== null;
  // CR7: a cooked form has no packs; every other food has them.
  if ((food.packs === null) !== cooked) problems.add(p('packs'), 'packs');
  const unit = food.packs?.unit ?? null;
  // CR8: grams per each is required for a counted pack and never set on a cooked form.
  if ((unit === 'each' && food.gramsPerEach === null) || (cooked && food.gramsPerEach !== null))
    problems.add(p('gramsPerEach'), 'grams-per-each');
  // CR9: a count word exactly when the food is counted.
  if ((food.countWord !== null) !== (unit === 'each' || food.gramsPerEach !== null))
    problems.add(p('countWord'), 'count-word');
  // CR11: only a fresh single food may have a complete list; a packed single food never does.
  const single = SINGLE_FOOD_IDS.includes(food.id);
  if (food.allergensComplete && (single || !isFreshSingleFood(food)))
    problems.add(p('allergensComplete'), 'allergens-complete');
  if (single && food.allergens.length > 0) problems.add(p('allergens'), 'allergens-complete');
  // CR12, CR13: allergens a group or a food always carries.
  const inherent = INHERENT_ALLERGENS_BY_GROUP[food.group] ?? [];
  const groupOk =
    food.group === 'shellfish'
      ? inherent.some((a) => food.allergens.includes(a))
      : inherent.every((a) => food.allergens.includes(a));
  const byIdOk = (INHERENT_ALLERGENS_BY_ID[food.id] ?? []).every((a) => food.allergens.includes(a));
  if (!groupOk || !byIdOk) problems.add(p('allergens'), 'inherent-allergen');
  // CR14, CR15: garden foods and seasons are produce.
  if (food.gardenFlag && (food.aisle !== 'Produce' || food.seasonMonths.length === 0))
    problems.add(p('gardenFlag'), 'garden');
  if (food.seasonMonths.length > 0 && food.aisle !== 'Produce')
    problems.add(p('seasonMonths'), 'season');
  // CR16: cookedOf exactly for the cooked basis.
  if (cooked !== (food.basis === 'cooked')) problems.add(p('cookedOf'), 'cooked-form');
  // CR17, the parts that read only this food.
  if (
    cooked &&
    (food.loose ||
      food.gardenFlag ||
      food.countWord !== null ||
      food.seasonMonths.length > 0 ||
      food.substitutes.length > 0 ||
      food.cookedOf === food.id)
  )
    problems.add(p('cookedOf'), 'cooked-form');
  // CR20: a lean food carries no generic cut name, so "mince" never means lean mince.
  if (LEAN_HINT_RE.test(food.importHint)) {
    if (GENERIC_CUT_NAMES.includes(matchKey(food.name))) problems.add(p('name'), 'lean-name');
    food.aliases.forEach((a, i) => {
      if (GENERIC_CUT_NAMES.includes(matchKey(a))) problems.add(at(p('aliases'), i), 'lean-name');
    });
  }
}

/**
 * Checks a catalogue against rules CR1–CR26 (item 18 design 2.4). The shipped checks (CR21–CR26)
 * run unless `shippedChecks` is false, which only the synthetic-fixture tests pass.
 */
export function validateFoodCatalogue(
  raw: unknown,
  options: { readonly shippedChecks?: boolean } = {},
): FoodDataProblem[] {
  const problems = new Problems();
  if (!isPlainObject(raw)) {
    problems.add('', 'shape');
    return problems.all;
  }
  checkKeys(raw, ['version', 'revisedOn', 'foods'], '', problems);
  if (Object.hasOwn(raw, 'version') && raw['version'] !== 1) problems.add('version', 'enum');
  if (Object.hasOwn(raw, 'revisedOn') && !isLocalDate(raw['revisedOn']))
    problems.add('revisedOn', 'format');
  const list = raw['foods'];
  if (!Array.isArray(list)) {
    if (Object.hasOwn(raw, 'foods')) problems.add('foods', 'type');
    return problems.all;
  }

  const parsed: { food: SeedIngredient; index: number }[] = [];
  list.forEach((value, index) => {
    const food = checkFood(value, at('foods', index), problems);
    if (food !== null) parsed.push({ food, index });
  });

  // CR3: ids unique (over every food whose id is well formed).
  const indexById = new Map<string, number>();
  list.forEach((value, index) => {
    const id = isPlainObject(value) ? value['id'] : undefined;
    if (!isSeedId(id)) return;
    if (indexById.has(id)) problems.add(at(at('foods', index), 'id'), 'unique');
    else indexById.set(id, index);
  });
  const foodById = new Map(parsed.map(({ food }) => [food.id, food]));

  // CR4: every name and alias unique by matchKey across the catalogue.
  const names = new Set<string>();
  for (const { food, index } of parsed) {
    const path = at('foods', index);
    [food.name, ...food.aliases].forEach((n, i) => {
      const key = matchKey(n);
      if (names.has(key))
        problems.add(i === 0 ? at(path, 'name') : at(at(path, 'aliases'), i - 1), 'duplicate-name');
      names.add(key);
    });
  }

  // CR17: a cooked form names a raw food, one cooked form each, with the same allergen facts. A
  // food that failed its own checks is not compared (its problems are already listed).
  const cookedOfRaw = new Set<string>();
  for (const { food, index } of parsed) {
    if (food.cookedOf === null) continue;
    const path = at(at('foods', index), 'cookedOf');
    const raw = foodById.get(food.cookedOf);
    if (
      !indexById.has(food.cookedOf) ||
      cookedOfRaw.has(food.cookedOf) ||
      (raw !== undefined &&
        (raw.basis !== 'raw' ||
          raw.cookedOf !== null ||
          raw.aisle !== food.aisle ||
          raw.group !== food.group ||
          raw.allergensComplete !== food.allergensComplete ||
          raw.allergens.join() !== food.allergens.join()))
    )
      problems.add(path, 'cooked-form');
    cookedOfRaw.add(food.cookedOf);
  }

  // CR18: substitutes are other foods of the catalogue, never a cooked form.
  for (const { food, index } of parsed) {
    food.substitutes.forEach((id, i) => {
      if (id === food.id || !indexById.has(id) || (foodById.get(id)?.cookedOf ?? null) !== null)
        problems.add(at(at(at('foods', index), 'substitutes'), i), 'substitute');
    });
  }

  if (options.shippedChecks !== false) {
    // CR21: silverbeet, the default garden row's food.
    const silverbeet = foodById.get('seed:silverbeet');
    if (
      silverbeet?.name !== DEFAULT_GARDEN_NAME ||
      silverbeet.group !== 'leafy-green' ||
      !silverbeet.gardenFlag
    )
      problems.add(byId('foods', 'seed:silverbeet'), 'required-food');
    // CR22: firm and silken tofu, with soy (owner request).
    for (const id of ['seed:firm-tofu', 'seed:silken-tofu']) {
      if (!foodById.get(id)?.allergens.includes('soy'))
        problems.add(byId('foods', id), 'required-food');
    }
    // CR23, CR24: leafy greens and "about 150" foods.
    if (parsed.filter(({ food }) => food.group === 'leafy-green').length < MIN_LEAFY_GREENS)
      problems.add('foods', 'leafy-greens');
    if (list.length < FOOD_COUNT_RANGE.min || list.length > FOOD_COUNT_RANGE.max)
      problems.add('foods', 'count');
    // CR25: no other dataset's or fixture's id prefix.
    for (const { food, index } of parsed) {
      if (RESERVED_ID_PREFIXES.some((prefix) => food.id.startsWith(prefix)))
        problems.add(at(at('foods', index), 'id'), 'reserved-id');
    }
    // CR26: every food the allergen rules name is shipped.
    for (const id of [...Object.keys(INHERENT_ALLERGENS_BY_ID), ...SINGLE_FOOD_IDS]) {
      if (!foodById.has(id)) problems.add(byId('foods', id), 'required-food');
    }
  }
  return problems.all;
}

const RELEASE_SOURCE_KEYS = ['id', 'title', 'edition', 'retrievedOn', 'decidedOn'] as const;
const ROW_KEYS = ['source', 'foodId', 'foodName', 'values'] as const;
const VALUE_KEYS = ['value', 'unit', 'field', 'source'] as const;
const DATABASE_SOURCES: readonly unknown[] = ['nz-fcdb', 'usda'];

/**
 * Checks a nutrient release against rules R1–R12 (item 18 design 2.4) for `catalogue`, the
 * sources the owner approved (APPROVED_NUTRIENT_SOURCES in production) and their attribution
 * (foods.attribution in production).
 */
export function validateNutrientRelease(
  raw: unknown,
  catalogue: FoodCatalogue,
  approved: readonly DatabaseSource[],
  attributions: AttributionMap,
): FoodDataProblem[] {
  const problems = new Problems();
  if (!isPlainObject(raw)) {
    problems.add('', 'shape');
    return problems.all;
  }
  checkKeys(raw, ['version', 'sources', 'foods'], '', problems);
  if (Object.hasOwn(raw, 'version') && raw['version'] !== 1) problems.add('version', 'enum');
  const sources = raw['sources'];
  const rows = raw['foods'];
  if (!Array.isArray(sources) && Object.hasOwn(raw, 'sources')) problems.add('sources', 'type');
  if (!isPlainObject(rows) && Object.hasOwn(raw, 'foods')) problems.add('foods', 'type');

  // R12: nothing approved, nothing shipped.
  if (approved.length === 0) {
    if (Array.isArray(sources) && sources.length > 0) problems.add('sources', 'release-not-empty');
    if (isPlainObject(rows) && Object.keys(rows).length > 0)
      problems.add('foods', 'release-not-empty');
  }

  // R2–R4: the sources, each approved and attributed.
  const infoById = new Map<string, { title: string; edition: string }>();
  if (Array.isArray(sources)) {
    sources.forEach((source, i) => {
      const path = at('sources', i);
      const before = problems.count;
      if (!checkKeys(source, RELEASE_SOURCE_KEYS, path, problems)) return;
      const id = source['id'];
      if (!DATABASE_SOURCES.includes(id)) problems.add(at(path, 'id'), 'enum');
      checkText(source['title'], 1, 120, at(path, 'title'), problems);
      checkText(source['edition'], 1, 120, at(path, 'edition'), problems);
      if (!isLocalDate(source['retrievedOn'])) problems.add(at(path, 'retrievedOn'), 'format');
      if (!isLocalDate(source['decidedOn'])) problems.add(at(path, 'decidedOn'), 'format');
      if (problems.count !== before) return;
      const sourceId = id as DatabaseSource;
      if (infoById.has(sourceId)) problems.add(at(path, 'id'), 'unique');
      if (!approved.includes(sourceId)) problems.add(at(path, 'id'), 'not-approved');
      const attribution = attributions[sourceId];
      if (attribution === undefined || attribution.name === '' || attribution.text === '')
        problems.add(at(path, 'id'), 'no-attribution');
      infoById.set(sourceId, {
        title: source['title'] as string,
        edition: source['edition'] as string,
      });
    });
  }
  if (!isPlainObject(rows)) return problems.all;

  // R5–R11: each row.
  const seedIds = new Set(catalogue.foods.map((f) => f.id));
  const seenFoodIds = new Map<string, string>();
  for (const [seedId, row] of Object.entries(rows)) {
    const path = byId('foods', seedId);
    if (FORBIDDEN.includes(seedId)) {
      problems.add(path, 'forbidden-key');
      continue;
    }
    if (!seedIds.has(seedId)) problems.add(path, 'unknown-food');
    const before = problems.count;
    if (!checkKeys(row, ROW_KEYS, path, problems)) continue;
    const source = row['source'];
    if (!DATABASE_SOURCES.includes(source)) problems.add(at(path, 'source'), 'enum');
    else if (!infoById.has(source as string)) problems.add(at(path, 'source'), 'value-source');
    checkText(row['foodId'], 1, 40, at(path, 'foodId'), problems);
    checkText(row['foodName'], 1, 200, at(path, 'foodName'), problems);
    const values = row['values'];
    const valuesPath = at(path, 'values');
    if (!checkKeys(values, NUTRIENT_KEYS, valuesPath, problems)) continue;
    let anyValue = false;
    for (const key of NUTRIENT_KEYS) {
      const value = values[key];
      if (value === null || value === undefined) continue;
      anyValue = true;
      const valuePath = at(valuesPath, key);
      if (!checkKeys(value, VALUE_KEYS, valuePath, problems)) continue;
      if (!(isJsonNumber(value['value']) && value['value'] >= 0))
        problems.add(at(valuePath, 'value'), 'range');
      const units: readonly unknown[] = RELEASE_UNITS[key];
      const unitOk =
        units.includes(value['unit']) && !(value['unit'] === 'kcal' && source !== 'usda');
      if (!unitOk) problems.add(at(valuePath, 'unit'), 'unit');
      checkText(value['field'], 1, 20, at(valuePath, 'field'), problems);
      if (value['source'] !== source) problems.add(at(valuePath, 'source'), 'value-source');
    }
    // R8: a row with nothing is left out instead, and that food stays not loaded.
    if (!anyValue) problems.add(valuesPath, 'empty-row');
    if (problems.count !== before) continue;

    const typed = row as unknown as ReleaseRow;
    // R9: canonical figures within the storage per-100 g limits.
    const { nutrients, unknown } = canonicalFigures(typed);
    for (const key of NUTRIENT_KEYS) {
      if (!unknown.includes(key) && nutrients[key] > NUTRIENT_LIMITS_PER_100G[key])
        problems.add(at(valuesPath, key), 'limit');
    }
    // R10: the citation fits sourceCitation (Text 1–200).
    const info = infoById.get(typed.source);
    if (info !== undefined && `${info.title}, ${info.edition}, food ${typed.foodId}`.length > 200)
      problems.add(at(path, 'foodId'), 'citation-length');
    // R11: two seeds matched to one database food is a mapping mistake.
    const sharedKey = `${typed.source} ${typed.foodId}`;
    if (seenFoodIds.has(sharedKey)) problems.add(at(path, 'foodId'), 'unique');
    else seenFoodIds.set(sharedKey, seedId);
  }
  return problems.all;
}

/** A deep copy of a value that passed the checks, frozen at every level. */
export function deepFrozenCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFrozenCopy)) as T;
  if (isPlainObject(value)) {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepFrozenCopy(v)])),
    ) as T;
  }
  return value;
}

/** Throws FoodDataError with every problem; otherwise returns the typed, deep-frozen catalogue. */
export function parseFoodCatalogue(raw: unknown): FoodCatalogue {
  const problems = validateFoodCatalogue(raw);
  if (problems.length > 0) throw new FoodDataError(problems);
  return deepFrozenCopy(raw as FoodCatalogue);
}

/** Throws FoodDataError with every problem; otherwise returns the typed, deep-frozen release. */
export function parseNutrientRelease(
  raw: unknown,
  catalogue: FoodCatalogue,
  approved: readonly DatabaseSource[],
  attributions: AttributionMap,
): NutrientRelease {
  const problems = validateNutrientRelease(raw, catalogue, approved, attributions);
  if (problems.length > 0) throw new FoodDataError(problems);
  return deepFrozenCopy(raw as NutrientRelease);
}
