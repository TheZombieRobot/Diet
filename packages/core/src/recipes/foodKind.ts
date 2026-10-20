/**
 * What kind of food a recipe line is (item 20 design 2.5): item 18's group and heart role for a
 * seed food, and a keyword fallback for the owner's own foods, which have no group. A keyword can
 * only flag a food, never clear one (P9). Item 20 keeps no second table of food facts.
 */
import { CHEESE_FLAG_ABOVE_G, FATTY_CUT_IDS, heartRoleOf, type HeartRole } from '../foods/heart';
import { matchKey, mentionsWords } from '../foods/names';
import type { DatabaseSource, FoodGroup, SeedIngredient } from '../foods/types';
import type { Allergen } from '../storage/allergens';
import type { IngredientResolver } from '../storage/overrides';
import type { SeedId } from '../storage/primitives';

/** What the recipe functions read foods through: item 18's resolver and catalogue. */
export interface RecipeFoods {
  /** Item 18's ingredientResolver over the seed views, the overrides and the owner's own foods. */
  readonly resolve: IngredientResolver;
  /** Item 18's FoodData.seedById. */
  readonly seedById: ReadonlyMap<string, SeedIngredient>;
  /** The approved food databases: useFoodData().approved on screens, APPROVED_NUTRIENT_SOURCES elsewhere. */
  readonly approved: readonly DatabaseSource[];
}

/** Why a line flags a recipe (HEALTH_SAFETY section 4), in the order the reasons are listed. */
export const FLAG_REASONS = Object.freeze([
  'butter-cream',
  'coconut-fat',
  'processed-meat',
  'fatty-cut',
  'cheese-over-40g',
  'saturated-fat-high',
] as const);
export type FlagReason = (typeof FLAG_REASONS)[number];

/** What counts once towards the cholesterol score. */
export type FavourKey = 'olive-oil' | 'avocado' | FoodGroup;

export interface LineKind {
  readonly origin: 'seed' | 'own' | 'unresolved';
  /** Seeds only. */
  readonly group: FoodGroup | null;
  readonly role: HeartRole;
  /** The reason a flagging food gives ('cheese-over-40g' for cheese). */
  readonly flag: FlagReason | null;
  /** Seeds whose role is favour. */
  readonly favour: FavourKey | null;
  readonly egg: boolean;
  /** Group in PROTEIN_GROUPS: the line carries a cooked weight (seeds only). */
  readonly proteinFood: boolean;
}

export const PROTEIN_GROUPS: readonly FoodGroup[] = Object.freeze([
  'poultry',
  'red-meat',
  'oily-fish',
  'lean-fish',
  'shellfish',
  'egg',
  'tofu',
  'legume',
]);

/**
 * The allergens item 20 relies on each of its ingredients carrying (item 18–20 contract 1.1).
 * Test U2 checks the shipped catalogue against it, so a later catalogue change that drops one
 * fails CI. Ids not listed carry none of the 15.
 */
export const RECIPE_INGREDIENT_CONTRACT: Readonly<Record<SeedId, readonly Allergen[]>> =
  Object.freeze({
    'seed:white-fish': ['fish'],
    'seed:kahawai': ['fish'],
    'seed:eggs': ['egg'],
    'seed:milk': ['milk'],
    'seed:trim-milk': ['milk'],
    'seed:greek-yoghurt': ['milk'],
    'seed:feta': ['milk'],
    'seed:firm-tofu': ['soy'],
    'seed:tuna-in-water': ['fish'],
    'seed:sardines': ['fish'],
    'seed:canned-salmon': ['fish'],
    'seed:soy-sauce': ['soy', 'wheat'],
    'seed:rolled-oats': ['oats'],
    'seed:almond-meal': ['tree-nut'],
    'seed:walnuts': ['tree-nut'],
  });

const UNRESOLVED: LineKind = Object.freeze({
  origin: 'unresolved',
  group: null,
  role: Object.freeze({ kind: 'neutral' }),
  flag: null,
  favour: null,
  egg: false,
  proteinFood: false,
});

const COCONUT_FAT_IDS: readonly SeedId[] = ['seed:coconut-oil', 'seed:coconut-cream'];

/** The reason a flagging seed gives, from its id and group (item 18's heartRoleOf decides that it flags). */
function seedFlag(seed: SeedIngredient, role: HeartRole): FlagReason | null {
  if (role.kind !== 'flag') return null;
  if (seed.group === 'cheese') return 'cheese-over-40g';
  if (COCONUT_FAT_IDS.includes(seed.id)) return 'coconut-fat';
  if (FATTY_CUT_IDS.includes(seed.id)) return 'fatty-cut';
  if (seed.group === 'processed-meat') return 'processed-meat';
  if (seed.group === 'butter-cream') return 'butter-cream';
  return null;
}

/** Own-food keywords, first match wins (design 2.5). Matched as whole words by item 18's mentionsWords. */
const OWN_KEYWORDS: readonly { readonly flag: FlagReason; readonly words: readonly string[] }[] = [
  { flag: 'coconut-fat', words: ['coconut oil', 'coconut cream', 'coconut milk'] },
  { flag: 'butter-cream', words: ['butter', 'cream'] },
  {
    flag: 'processed-meat',
    words: [
      'bacon',
      'salami',
      'sausage',
      'saveloy',
      'frankfurter',
      'chorizo',
      'pepperoni',
      'ham',
      'prosciutto',
      'pastrami',
      'luncheon',
      'hot dog',
      'kabana',
      'cabanossi',
      'corned beef',
    ],
  },
  {
    flag: 'fatty-cut',
    words: [
      'pork belly',
      'belly pork',
      'lamb flap',
      'chicken skin',
      'crackling',
      'dripping',
      'lard',
      'tallow',
      'suet',
    ],
  },
  {
    flag: 'cheese-over-40g',
    words: [
      'cheese',
      'cheddar',
      'parmesan',
      'feta',
      'halloumi',
      'haloumi',
      'mozzarella',
      'brie',
      'camembert',
      'edam',
      'gouda',
      'colby',
    ],
  },
];

/** A nut or seed butter is not butter ("Peanut butter", "Cashew nut butter"). */
const NOT_BUTTER = /\b(?:peanut|nut|almond|cashew|seed)s? butter\b/g;

function ownFlag(names: readonly string[]): FlagReason | null {
  for (const { flag, words } of OWN_KEYWORDS) {
    const hit = names.some((name) => {
      const text = flag === 'butter-cream' ? matchKey(name).replace(NOT_BUTTER, ' ') : name;
      return words.some((word) => mentionsWords(text, word));
    });
    if (hit) return flag;
  }
  return null;
}

/** A line's kind: a seed by item 18's group and heart role, an own food by keywords, else unresolved. */
export function lineKindOf(ingredientId: string, foods: RecipeFoods): LineKind {
  const view = foods.resolve(ingredientId);
  if (view === null) return UNRESOLVED;
  const seed = foods.seedById.get(ingredientId);
  if (seed !== undefined) {
    const role = heartRoleOf(seed);
    const favour: FavourKey | null =
      role.kind !== 'favour'
        ? null
        : seed.id === 'seed:olive-oil'
          ? 'olive-oil'
          : seed.id === 'seed:avocado'
            ? 'avocado'
            : seed.group;
    return {
      origin: 'seed',
      group: seed.group,
      role,
      flag: seedFlag(seed, role),
      favour,
      egg: seed.group === 'egg',
      proteinFood: PROTEIN_GROUPS.includes(seed.group),
    };
  }
  const flag = ownFlag([view.name, ...view.aliases]);
  const role: HeartRole =
    flag === null
      ? { kind: 'neutral' }
      : { kind: 'flag', aboveGramsPerServe: flag === 'cheese-over-40g' ? CHEESE_FLAG_ABOVE_G : 0 };
  return { origin: 'own', group: null, role, flag, favour: null, egg: false, proteinFood: false };
}
