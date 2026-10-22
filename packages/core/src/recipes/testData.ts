/**
 * Recipe fixtures for tests (item 20 design 8), beside the code they test, as foods/testData.ts
 * is: @diet/test-fixtures depends on core, so core cannot import it. Not exported from core's
 * index; reached only through "@diet/core/recipes/testData", which a scan
 * (tools/scans/recipesHome.test.ts) allows only in tests and test-fixtures.
 *
 * Every figure here is SYNTHETIC: one made-up round set for every food, or an "Example" own food.
 * None describes a real food, none ships, and no figure from memory enters the repository. The
 * views keep item 18's real catalogue and allergen model (tofu brand-dependent with soy, canned
 * tuna brand-dependent with fish, olive oil brand-dependent with nothing known).
 */
import { foodData, seedViews } from '../foods/dataset';
import type { DatabaseSource } from '../foods/types';
import type { NutritionSource } from '../nutrition/confidence';
import type { Nutrients } from '../nutrition/nutrients';
import type { Allergen } from '../storage/allergens';
import { ingredientResolver, type IngredientView } from '../storage/overrides';
import type { Id, Instant } from '../storage/primitives';
import type {
  IngredientOverrideRecord,
  IngredientRecord,
  NutrientKey,
  RecipeLine,
} from '../storage/records';
import type { RecipeFoods } from './foodKind';

/** One made-up round set of figures per 100 g, used for every loaded food in the fixtures. */
export const SYNTHETIC_PER_100G: Nutrients = Object.freeze({
  energyKj: 1000,
  proteinG: 10,
  fatG: 10,
  saturatedFatG: 2,
  carbsG: 5,
  sugarsG: 1,
  fibreG: 2,
  sodiumMg: 100,
});

const AT: Instant = '2000-01-01T00:00:00.000Z';

export interface FixtureFoodsOptions {
  /** These seeds stay not loaded, as shipped; 'all' is the shipped state. */
  readonly notLoaded?: readonly string[] | 'all';
  /** Default APPROVED_NUTRIENT_SOURCES' value today: none. */
  readonly approved?: readonly DatabaseSource[];
  /** The source of the loaded seeds' figures (default 'estimate'). */
  readonly source?: NutritionSource;
  /** Other synthetic figures for some seeds. */
  readonly figures?: Readonly<Record<string, Nutrients>>;
  /** Figures some loaded seeds lack (stored as 0, as D35 stores an unknown figure). */
  readonly missing?: Readonly<Record<string, readonly NutrientKey[]>>;
  readonly own?: readonly IngredientRecord[];
  readonly overrides?: readonly IngredientOverrideRecord[];
}

const withMissing = (figures: Nutrients, missing: readonly NutrientKey[]): Nutrients => {
  const out = { ...figures };
  for (const key of missing) out[key] = 0;
  return out;
};

/** The seed views with synthetic figures, before the owner's changes. */
export function fixtureSeedViews(options: FixtureFoodsOptions = {}): IngredientView[] {
  const { notLoaded = [] } = options;
  return seedViews().map((view) =>
    notLoaded === 'all' || notLoaded.includes(view.id)
      ? view
      : {
          ...view,
          nutrientsPer100g: withMissing(
            options.figures?.[view.id] ?? SYNTHETIC_PER_100G,
            options.missing?.[view.id] ?? [],
          ),
          unknownNutrients: [...(options.missing?.[view.id] ?? [])],
          source: options.source ?? 'estimate',
        },
  );
}

/** A RecipeFoods over item 18's real catalogue, with complete synthetic figures unless told otherwise. */
export function fixtureFoods(options: FixtureFoodsOptions = {}): RecipeFoods {
  const data = foodData();
  if (data.status !== 'ok') throw new Error('The shipped catalogue did not load');
  return {
    resolve: ingredientResolver(
      fixtureSeedViews(options),
      options.overrides ?? [],
      options.own ?? [],
    ),
    seedById: data.seedById,
    approved: options.approved ?? [],
  };
}

/** An owner's own food, with "Example" in its name and synthetic figures. */
export function exampleOwnFood(
  id: Id,
  name: string,
  per100g: Nutrients,
  allergens: Allergen[] | null = [],
): IngredientRecord {
  return {
    id,
    name,
    aliases: [],
    aisle: 'Other',
    packSizesG: [],
    packSizeSource: null,
    packSizeEnteredAt: null,
    nutrientsPer100g: { ...per100g },
    unknownNutrients: [],
    carbBasisAsEntered: 'available',
    nutrientBasis: 'raw',
    cookedYield: null,
    yieldCitation: null,
    source: 'estimate',
    sourceCitation: null,
    allergens,
    gardenFlag: false,
    seasonMonths: [],
    substitutes: [],
    gramsPerEach: null,
    servingSizeG: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

const n = (
  energyKj: number,
  proteinG: number,
  fatG: number,
  saturatedFatG: number,
  carbsG: number,
  sugarsG: number,
  fibreG: number,
  sodiumMg: number,
): Nutrients => ({ energyKj, proteinG, fatG, saturatedFatG, carbsG, sugarsG, fibreG, sodiumMg });

const ownId = (k: number): Id => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`;

/**
 * NU-04's two synthetic recipes (design 8): an avocado salad that is heart-smart (per serve fat
 * 20.18 g, saturated fat 2.725 g) and a bacon and cream carbonara that is flagged (saturated fat
 * 42.55 g a serve) for butter or cream, processed meat, cheese over 40 g and saturated fat.
 */
export function nu04Fixtures(): {
  readonly own: readonly IngredientRecord[];
  readonly avocadoSalad: { readonly serves: number; readonly lines: RecipeLine[] };
  readonly carbonara: { readonly serves: number; readonly lines: RecipeLine[] };
} {
  const own = [
    exampleOwnFood(ownId(1), 'Example avocado', n(800, 2, 15, 2, 1, 0.5, 6, 10)),
    exampleOwnFood(ownId(2), 'Example salad leaves', n(60, 1.5, 0.3, 0.05, 1.5, 1, 2, 30)),
    exampleOwnFood(ownId(3), 'Example olive oil', n(3700, 0, 100, 14, 0, 0, 0, 0)),
    exampleOwnFood(ownId(4), 'Example lemon', n(120, 0.5, 0.2, 0, 2, 2, 1, 2)),
    exampleOwnFood(ownId(5), 'Example spaghetti', n(1500, 12, 1.5, 0.3, 70, 3, 3, 5), ['wheat']),
    exampleOwnFood(ownId(6), 'Example streaky bacon', n(1600, 14, 35, 13, 0, 0, 0, 1500)),
    exampleOwnFood(ownId(7), 'Example cream', n(1400, 2, 35, 22, 3, 3, 0, 40), ['milk']),
    exampleOwnFood(ownId(8), 'Example parmesan', n(1650, 35, 28, 18, 0, 0, 0, 1500), ['milk']),
    exampleOwnFood(ownId(9), 'Example egg', n(600, 12.5, 10, 3, 0.5, 0.5, 0, 140), ['egg']),
  ];
  const line = (k: number, rawG: number): RecipeLine => ({
    ingredientId: ownId(k),
    rawG,
    cookedG: null,
    displayAs: null,
  });
  return {
    own,
    avocadoSalad: { serves: 2, lines: [line(1, 200), line(2, 100), line(3, 10), line(4, 30)] },
    carbonara: {
      serves: 2,
      lines: [line(5, 200), line(6, 150), line(7, 200), line(8, 100), line(9, 100)],
    },
  };
}

/**
 * Owner corrections that give each seed complete synthetic figures (source estimate), for the
 * database and browser tests that need a copy the schema can store (design 6.4).
 */
export function overrideFiguresFor(ids: readonly string[]): IngredientOverrideRecord[] {
  const data = foodData();
  if (data.status !== 'ok') throw new Error('The shipped catalogue did not load');
  return ids.map((seedId) => {
    const seed = data.seedById.get(seedId);
    if (seed === undefined) throw new Error(`Not a seed: ${seedId}`);
    return {
      seedId,
      changes: [
        {
          field: 'nutrition',
          value: {
            nutrientsPer100g: { ...SYNTHETIC_PER_100G },
            unknownNutrients: [],
            carbBasisAsEntered: 'available',
            nutrientBasis: seed.basis,
            source: 'estimate',
            sourceCitation: null,
          },
        },
      ],
      createdAt: AT,
      updatedAt: AT,
    };
  });
}
