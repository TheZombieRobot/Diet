/**
 * The ingredient dataset's shapes (checklist item 18; item 18 design sections 2.2, 2.3 and 3.1).
 *
 * Two files in packages/core/data: the catalogue (ingredients.json), which has no nutrient field
 * at all, and the nutrient release (ingredient-nutrients.json), empty until a food database is
 * approved at checklist item 10. Every field is always present; an absent value is null.
 */
import type { NutritionSource } from '../nutrition/confidence';
import type { Allergen } from '../storage/allergens';
import type { SeedId } from '../storage/primitives';
import type { NutrientBasis, NutrientKey } from '../storage/records';
import type { LocalDate } from '../util/time';

/** Aisle groups for the shopping list (GL-04). Generic supermarket sections, not any store's layout. */
export const SEED_AISLES = Object.freeze([
  'Produce',
  'Meat and fish',
  'Dairy and eggs',
  'Chilled',
  'Bakery',
  'Pantry',
  'Rice, pasta and grains',
  'Baking and spices',
  'Nuts and seeds',
  'Frozen',
] as const);
export type SeedAisle = (typeof SEED_AISLES)[number];

/** The grocery list's group for a food with no known aisle (GL-04: unknown → "Other"). No seed uses it. */
export const OTHER_AISLE = 'Other';

/** What kind of food it is. Used for the dataset's allergen checks and HEALTH_SAFETY section 4's heart roles. */
export const FOOD_GROUPS = Object.freeze([
  'leafy-green',
  'vegetable',
  'starchy-vegetable',
  'fruit',
  'herb',
  'poultry',
  'red-meat',
  'processed-meat',
  'oily-fish',
  'lean-fish',
  'shellfish',
  'egg',
  'milk',
  'yoghurt',
  'cheese',
  'butter-cream',
  'tofu',
  'legume',
  'grain',
  'bread',
  'nut-seed',
  'oil',
  'condiment',
  'spice',
] as const);
export type FoodGroup = (typeof FOOD_GROUPS)[number];

/** A word for one and for several, for counting or for a container: "bunch"/"bunches", "can"/"cans". */
export interface CountWord {
  readonly one: string;
  readonly many: string;
}

export const PACK_UNITS = Object.freeze(['g', 'ml', 'each'] as const);
export type PackUnit = (typeof PACK_UNITS)[number];

/** Typical pack sizes in one unit, strictly ascending. 'each' sizes are counts; [1] means bought one at a time. */
export interface SeedPacks {
  readonly unit: PackUnit;
  readonly sizes: readonly number[];
  /** g and ml only ("bag", "can", "bottle"); always null for 'each'. */
  readonly container: CountWord | null;
}

/** One food of the catalogue. Pack sizes, weights and seasons are typical values, never prices (C69). */
export interface SeedIngredient {
  readonly id: SeedId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly aisle: SeedAisle;
  readonly group: FoodGroup;
  /** Null only for a cooked form. */
  readonly packs: SeedPacks | null;
  /** Also sold loose by weight or singly. */
  readonly loose: boolean;
  /** Typical weight of one, AS BOUGHT; for counting what to buy only, never for nutrition (N11). */
  readonly gramsPerEach: number | null;
  /** What one is called ("bunch", "egg", "tomato"); set iff counted. */
  readonly countWord: CountWord | null;
  /** The allergens it is known to contain, in ALLERGENS order. */
  readonly allergens: readonly Allergen[];
  /** False: others depend on the brand (every packed food; rule CR11). */
  readonly allergensComplete: boolean;
  /** Commonly grown in home gardens. */
  readonly gardenFlag: boolean;
  /** 1–12, ascending; [] = no local season (N13). */
  readonly seasonMonths: readonly number[];
  /** The basis its figures describe (C67). */
  readonly basis: NutrientBasis;
  /** A cooked form names its raw form. */
  readonly cookedOf: SeedId | null;
  readonly substitutes: readonly SeedId[];
  /** The form step 18b looks up, e.g. "raw, skinless, flesh only". */
  readonly importHint: string;
}

export interface FoodCatalogue {
  readonly version: 1;
  readonly revisedOn: LocalDate;
  readonly foods: readonly SeedIngredient[];
}

/** The 17 keys of a catalogue food, in file order (rule CR2). There is no nutrient key. */
export const SEED_KEYS = Object.freeze([
  'id',
  'name',
  'aliases',
  'aisle',
  'group',
  'packs',
  'loose',
  'gramsPerEach',
  'countWord',
  'allergens',
  'allergensComplete',
  'gardenFlag',
  'seasonMonths',
  'basis',
  'cookedOf',
  'substitutes',
  'importHint',
] as const satisfies readonly (keyof SeedIngredient)[]);

// ---- The nutrient release (step 18b fills it; empty until checklist item 10) ----

export type DatabaseSource = Extract<NutritionSource, 'nz-fcdb' | 'usda'>;
export type ReleaseUnit = 'kJ' | 'kcal' | 'g' | 'mg';

/** One figure, with its own source tag: the database, the database's field code and the unit as published. */
export interface ReleaseValue {
  /** Finite, ≥ 0, exactly as published (no rounding). */
  readonly value: number;
  readonly unit: ReleaseUnit;
  /** The database's code for the figure, e.g. a nutrient number. */
  readonly field: string;
  /** Must equal the row's source (N4). */
  readonly source: DatabaseSource;
}

/** One seed's figures per 100 g on the seed's basis. null = the database has no figure for it. */
export interface ReleaseRow {
  readonly source: DatabaseSource;
  /** The database's own id for the food it was matched to. */
  readonly foodId: string;
  /** The database's own description of it. */
  readonly foodName: string;
  readonly values: Readonly<Record<NutrientKey, ReleaseValue | null>>;
}

export interface ReleaseSourceInfo {
  readonly id: DatabaseSource;
  /** The database's name as its licence asks. */
  readonly title: string;
  /** E.g. the release name. */
  readonly edition: string;
  readonly retrievedOn: LocalDate;
  /** The date of the DECISIONS row that approved it (item 10). */
  readonly decidedOn: LocalDate;
}

export interface NutrientRelease {
  readonly version: 1;
  readonly sources: readonly ReleaseSourceInfo[];
  /** Keyed by SeedId. */
  readonly foods: Readonly<Record<string, ReleaseRow>>;
}

/** Units allowed per figure (item 18 design 2.3; C31). kcal only on a usda row. */
export const RELEASE_UNITS: Readonly<Record<NutrientKey, readonly ReleaseUnit[]>> = Object.freeze({
  energyKj: Object.freeze(['kJ', 'kcal'] as const),
  proteinG: Object.freeze(['g'] as const),
  fatG: Object.freeze(['g'] as const),
  saturatedFatG: Object.freeze(['g'] as const),
  carbsG: Object.freeze(['g'] as const),
  sugarsG: Object.freeze(['g'] as const),
  fibreG: Object.freeze(['g'] as const),
  sodiumMg: Object.freeze(['mg'] as const),
});

/** Attribution text per approved source: health.ts foods.attribution in production. */
export type AttributionMap = Readonly<
  Partial<Record<DatabaseSource, { readonly name: string; readonly text: string }>>
>;

// ---- The catalogue's rules (item 18 design 2.4 and 3.1) ----

/** "About 150" foods (checklist item 18; rule CR24). */
export const FOOD_COUNT_RANGE = Object.freeze({ min: 140, max: 180 });

/** At least this many leafy greens ship (rule CR23). */
export const MIN_LEAFY_GREENS = 8;

/** A fresh single food's aisle (rule CR11). */
export const COMPLETE_ALLERGEN_AISLES: readonly SeedAisle[] = Object.freeze([
  'Produce',
  'Meat and fish',
  'Dairy and eggs',
]);

/** A fresh single food's group (rule CR11). Every other food's allergens depend on the brand. */
export const COMPLETE_ALLERGEN_GROUPS: readonly FoodGroup[] = Object.freeze([
  'leafy-green',
  'vegetable',
  'starchy-vegetable',
  'fruit',
  'herb',
  'poultry',
  'red-meat',
  'oily-fish',
  'lean-fish',
  'shellfish',
  'egg',
  'milk',
]);

/**
 * The only foods whose allergen list may be complete (rule CR11, shipped): the fresh single foods
 * of the catalogue, reviewed one by one. A complete list on any other id is refused, so moving a
 * packed food to a fresh aisle or group in the data file never makes its list complete; adding a
 * food here is a reviewed code change.
 */
export const FRESH_SINGLE_FOOD_IDS: readonly SeedId[] = Object.freeze([
  'seed:silverbeet',
  'seed:spinach',
  'seed:kale',
  'seed:cos-lettuce',
  'seed:iceberg-lettuce',
  'seed:salad-leaves',
  'seed:rocket',
  'seed:bok-choy',
  'seed:chinese-cabbage',
  'seed:cabbage',
  'seed:red-cabbage',
  'seed:watercress',
  'seed:broccoli',
  'seed:cauliflower',
  'seed:brussels-sprouts',
  'seed:courgette',
  'seed:cucumber',
  'seed:tomato',
  'seed:cherry-tomatoes',
  'seed:capsicum',
  'seed:green-beans',
  'seed:snow-peas',
  'seed:celery',
  'seed:spring-onion',
  'seed:leek',
  'seed:onion',
  'seed:red-onion',
  'seed:garlic',
  'seed:ginger',
  'seed:carrot',
  'seed:beetroot',
  'seed:pumpkin',
  'seed:butternut',
  'seed:kumara',
  'seed:potato',
  'seed:sweetcorn',
  'seed:mushrooms',
  'seed:eggplant',
  'seed:asparagus',
  'seed:radish',
  'seed:chilli',
  'seed:avocado',
  'seed:parsley',
  'seed:coriander',
  'seed:basil',
  'seed:mint',
  'seed:chives',
  'seed:lemon',
  'seed:lime',
  'seed:mandarin',
  'seed:orange',
  'seed:kiwifruit',
  'seed:feijoa',
  'seed:apple',
  'seed:pear',
  'seed:banana',
  'seed:strawberries',
  'seed:blueberries',
  'seed:tamarillo',
  'seed:passionfruit',
  'seed:chicken-breast',
  'seed:chicken-breast-cooked',
  'seed:chicken-thigh',
  'seed:chicken-thigh-cooked',
  'seed:chicken-drumsticks',
  'seed:beef-mince-lean',
  'seed:beef-mince-lean-cooked',
  'seed:beef-mince',
  'seed:beef-steak',
  'seed:beef-steak-cooked',
  'seed:lamb-leg-steaks',
  'seed:lamb-chops',
  'seed:pork-loin-steaks',
  'seed:pork-chops',
  'seed:white-fish',
  'seed:white-fish-cooked',
  'seed:salmon',
  'seed:salmon-cooked',
  'seed:kahawai',
  'seed:eggs',
  'seed:egg-hard-boiled',
  'seed:milk',
  'seed:trim-milk',
]);

/**
 * Packed single foods with no FSANZ Standard 1.2.3 allergen by nature (rule CR11; contract 7.3).
 * Each has allergens [] and allergensComplete false: the label decides ("may contain" lines are
 * voluntary). The list selects their wording only (allergenSummary); it never makes a list complete.
 */
export const SINGLE_FOOD_IDS: readonly SeedId[] = Object.freeze([
  'seed:olive-oil',
  'seed:canola-oil',
  'seed:coconut-oil',
  'seed:salt',
  'seed:honey',
  'seed:ground-cumin',
  'seed:smoked-paprika',
  'seed:ground-cinnamon',
  'seed:dried-oregano',
  'seed:black-pepper',
  'seed:chilli-flakes',
  'seed:white-rice',
  'seed:white-rice-cooked',
  'seed:brown-rice',
  'seed:brown-rice-cooked',
  'seed:quinoa',
  'seed:quinoa-cooked',
  'seed:red-lentils',
  'seed:red-lentils-cooked',
  'seed:frozen-peas',
  'seed:frozen-broccoli',
  'seed:frozen-spinach',
  'seed:frozen-berries',
  'seed:frozen-mixed-veg',
  'seed:cauliflower-rice',
]);

/**
 * Allergens a group always carries (rule CR12). Shellfish is "at least one of" its two allergens;
 * every other group must carry all of its list.
 */
export const INHERENT_ALLERGENS_BY_GROUP: Readonly<
  Partial<Record<FoodGroup, readonly Allergen[]>>
> = Object.freeze({
  'oily-fish': ['fish'],
  'lean-fish': ['fish'],
  shellfish: ['crustacea', 'mollusc'],
  egg: ['egg'],
  milk: ['milk'],
  yoghurt: ['milk'],
  cheese: ['milk'],
  'butter-cream': ['milk'],
  tofu: ['soy'],
  bread: ['wheat'],
});

/**
 * The allergens each shipped food is known to carry (rule CR13; tofu by owner request). Every food
 * of the catalogue with a known allergen is listed, so no edit to the data file alone (a new group
 * or aisle included) can drop one; an allergen leaves a food only through a reviewed code change.
 * Curry paste, sausages, mustard and prawns list what most NZ packs carry (shrimp paste and fish
 * sauce; wheat rusk and preservative 223; sulphite preservatives), since listing too many is the
 * safe direction: the owner's corrections can only add.
 */
export const INHERENT_ALLERGENS_BY_ID: Readonly<Record<SeedId, readonly Allergen[]>> =
  Object.freeze({
    'seed:sausages': ['wheat', 'sulphites'],
    'seed:white-fish': ['fish'],
    'seed:white-fish-cooked': ['fish'],
    'seed:salmon': ['fish'],
    'seed:salmon-cooked': ['fish'],
    'seed:kahawai': ['fish'],
    'seed:eggs': ['egg'],
    'seed:egg-hard-boiled': ['egg'],
    'seed:milk': ['milk'],
    'seed:trim-milk': ['milk'],
    'seed:greek-yoghurt': ['milk'],
    'seed:cheddar': ['milk'],
    'seed:feta': ['milk'],
    'seed:parmesan': ['milk'],
    'seed:mozzarella': ['milk'],
    'seed:cottage-cheese': ['milk'],
    'seed:cream-cheese': ['milk'],
    'seed:butter': ['milk'],
    'seed:cream': ['milk'],
    'seed:sour-cream': ['milk'],
    'seed:firm-tofu': ['soy'],
    'seed:silken-tofu': ['soy'],
    'seed:hummus': ['sesame'],
    'seed:wholemeal-bread': ['wheat'],
    'seed:white-bread': ['wheat'],
    'seed:wraps': ['wheat'],
    'seed:tuna-in-water': ['fish'],
    'seed:tuna-in-oil': ['fish'],
    'seed:sardines': ['fish'],
    'seed:canned-salmon': ['fish'],
    'seed:canned-mackerel': ['fish'],
    'seed:soy-sauce': ['soy', 'wheat'],
    'seed:fish-sauce': ['fish'],
    'seed:peanut-butter': ['peanut'],
    'seed:tahini': ['sesame'],
    'seed:mustard': ['sulphites'],
    'seed:mayonnaise': ['egg'],
    'seed:curry-paste': ['fish', 'crustacea'],
    'seed:pasta': ['wheat'],
    'seed:pasta-cooked': ['wheat'],
    'seed:rolled-oats': ['oats'],
    'seed:plain-flour': ['wheat'],
    'seed:almond-meal': ['tree-nut'],
    'seed:almonds': ['tree-nut'],
    'seed:walnuts': ['tree-nut'],
    'seed:cashews': ['tree-nut'],
    'seed:macadamias': ['tree-nut'],
    'seed:peanuts': ['peanut'],
    'seed:sesame-seeds': ['sesame'],
    'seed:prawns': ['crustacea', 'sulphites'],
  });

/**
 * Words in a name or another name that say a food carries an allergen (rule CR27), matched as whole
 * words (mentionsWords), so a food added to the data file cannot leave out an allergen its own name
 * gives away ("Hazelnuts", "Mussels", "Couscous", "Pearl barley"). A word listed in `unless`, in
 * the same name, means the allergen word does not apply ("Peanut butter", "Almond flour",
 * "Coconut cream", "Rice noodles").
 */
export const ALLERGEN_NAME_WORDS: readonly {
  readonly allergen: Allergen;
  readonly words: readonly string[];
  readonly unless: readonly string[];
}[] = Object.freeze([
  { allergen: 'peanut', words: ['peanut'], unless: [] },
  {
    allergen: 'tree-nut',
    words: [
      'almond',
      'brazil nut',
      'cashew',
      'hazelnut',
      'macadamia',
      'pecan',
      'pine nut',
      'pistachio',
      'walnut',
    ],
    unless: [],
  },
  {
    allergen: 'milk',
    words: ['milk', 'cheese', 'yoghurt', 'yogurt', 'butter', 'cream', 'whey'],
    unless: [
      'almond',
      'bean',
      'cashew',
      'cocoa',
      'coconut',
      'oat',
      'peanut',
      'rice',
      'soy',
      'tartar',
    ],
  },
  { allergen: 'egg', words: ['egg'], unless: [] },
  {
    allergen: 'fish',
    words: [
      'fish',
      'anchovy',
      'anchovies',
      'cod',
      'gurnard',
      'hake',
      'hoki',
      'kahawai',
      'kingfish',
      'mackerel',
      'salmon',
      'sardine',
      'snapper',
      'tarakihi',
      'trevally',
      'trout',
      'tuna',
      'warehou',
      'whitebait',
    ],
    unless: [],
  },
  {
    allergen: 'crustacea',
    words: ['crab', 'crayfish', 'koura', 'lobster', 'prawn', 'scampi', 'shrimp'],
    unless: ['apple'],
  },
  {
    allergen: 'mollusc',
    words: [
      'calamari',
      'clam',
      'cockle',
      'mussel',
      'octopus',
      'oyster',
      'paua',
      'pipi',
      'scallop',
      'squid',
      'tuatua',
    ],
    unless: ['mushroom'],
  },
  { allergen: 'sesame', words: ['sesame', 'tahini'], unless: [] },
  { allergen: 'soy', words: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh'], unless: [] },
  { allergen: 'lupin', words: ['lupin'], unless: [] },
  {
    allergen: 'wheat',
    words: [
      'wheat',
      'flour',
      'bread',
      'breadcrumb',
      'pasta',
      'couscous',
      'semolina',
      'bulgur',
      'noodle',
      'wrap',
      'tortilla',
    ],
    unless: [
      'almond',
      'buckwheat',
      'chickpea',
      'coconut',
      'corn',
      'gluten free',
      'lettuce',
      'potato',
      'rice',
      'tapioca',
    ],
  },
  { allergen: 'barley', words: ['barley'], unless: [] },
  { allergen: 'oats', words: ['oat'], unless: [] },
  { allergen: 'rye', words: ['rye'], unless: [] },
]);

/**
 * Names that mean the ordinary cut, already in matchKey form (rule CR20). A lean food never carries
 * one, so "mince" typed by the owner never takes the lean entry (HEALTH_SAFETY section 4). Pork and
 * lamb steaks are often shoulder or forequarter cuts, so they are generic too.
 */
export const GENERIC_CUT_NAMES: readonly string[] = Object.freeze([
  'mince',
  'beef mince',
  'beef',
  'steak',
  'beef steak',
  'lamb',
  'lamb chops',
  'lamb steaks',
  'chops',
  'pork',
  'pork chops',
  'pork steaks',
]);

/** Other datasets' and fixtures' id prefixes, refused in the shipped catalogue (rule CR25). */
export const RESERVED_ID_PREFIXES: readonly string[] = Object.freeze([
  'seed:ex-',
  'seed:session-',
  'seed:recipe-',
  'seed:drink-',
  'seed:example-',
  'seed:fixture-',
]);
