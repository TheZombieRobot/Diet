/**
 * Seeds as every reader sees them (item 18 design 3.2). A seed with no release row is "not loaded":
 * all eight figures are listed as unknown (stored as 0 only by D35's convention, which app code
 * never reads: knownFigure), it has no citation, and it has no badge. A view is never stored.
 *
 * The release's figures are read as published, with two conversions for a USDA row only (N5):
 * kcal to kJ when the row has no kJ figure, and carbohydrate by difference to available
 * carbohydrate using that food's own fibre; with no fibre figure the carbohydrate is not known.
 */
import {
  type Confidence,
  confidenceOf,
  NUTRITION_SOURCES,
  type NutritionSource,
} from '../nutrition/confidence';
import { toAvailableCarbsG } from '../nutrition/netCarbs';
import { type CarbBasis, KJ_PER_KCAL, NUTRIENT_KEYS, type Nutrients } from '../nutrition/nutrients';
import type { FoodSource, IngredientView } from '../storage/overrides';
import type { SeedId } from '../storage/primitives';
import type { NutrientKey } from '../storage/records';
import type { LocalDate } from '../util/time';
import { APPROVED_NUTRIENT_SOURCES } from './approval';
import type { FoodDataOk } from './dataset';
import type {
  DatabaseSource,
  ReleaseRow,
  ReleaseSourceInfo,
  SeedIngredient,
  SeedPacks,
} from './types';

/** A release row's figures per 100 g as the app uses them, and the figures it does not have. */
export function canonicalFigures(row: ReleaseRow): {
  readonly nutrients: Nutrients;
  readonly unknown: NutrientKey[];
  readonly carbBasisAsEntered: CarbBasis;
} {
  const nutrients: Nutrients = {
    energyKj: 0,
    proteinG: 0,
    fatG: 0,
    saturatedFatG: 0,
    carbsG: 0,
    sugarsG: 0,
    fibreG: 0,
    sodiumMg: 0,
  };
  const unknown = new Set<NutrientKey>();
  for (const key of NUTRIENT_KEYS) {
    const v = row.values[key];
    if (v === null) unknown.add(key);
    else nutrients[key] = v.unit === 'kcal' ? v.value * KJ_PER_KCAL : v.value;
  }
  if (row.source === 'usda' && !unknown.has('carbsG')) {
    if (unknown.has('fibreG')) {
      unknown.add('carbsG');
      nutrients.carbsG = 0;
    } else {
      nutrients.carbsG = toAvailableCarbsG({
        carbsG: nutrients.carbsG,
        fibreG: nutrients.fibreG,
        carbBasis: 'total',
      });
    }
  }
  return {
    nutrients,
    unknown: NUTRIENT_KEYS.filter((k) => unknown.has(k)),
    carbBasisAsEntered: row.source === 'usda' ? 'total' : 'available',
  };
}

/**
 * A seed as a view: with its release row and source, or not loaded (row and info null). Every
 * array is a fresh frozen copy; the view is frozen.
 */
export function seedView(
  seed: SeedIngredient,
  row: ReleaseRow | null,
  info: ReleaseSourceInfo | null,
  revisedOn: LocalDate,
): IngredientView {
  if (row !== null && info?.id !== row.source)
    throw new RangeError('A loaded seed view needs its own source');
  const figures =
    row === null
      ? {
          nutrients: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as unknown as Nutrients,
          unknown: [...NUTRIENT_KEYS],
          carbBasisAsEntered: 'available' as const,
        }
      : canonicalFigures(row);
  const packSizesG = seed.packs?.unit === 'g' ? [...seed.packs.sizes] : [];
  const at = `${revisedOn}T00:00:00.000Z`;
  return Object.freeze({
    id: seed.id,
    name: seed.name,
    aliases: Object.freeze([...seed.aliases]) as string[],
    aisle: seed.aisle,
    packSizesG: Object.freeze(packSizesG) as number[],
    packSizeSource: packSizesG.length > 0 ? 'typical' : null,
    packSizeEnteredAt: null,
    nutrientsPer100g: Object.freeze(figures.nutrients),
    unknownNutrients: Object.freeze(figures.unknown) as NutrientKey[],
    carbBasisAsEntered: figures.carbBasisAsEntered,
    nutrientBasis: seed.basis,
    cookedYield: null,
    yieldCitation: null,
    source: row === null ? 'not-loaded' : row.source,
    sourceCitation:
      row === null || info === null ? null : `${info.title}, ${info.edition}, food ${row.foodId}`,
    allergensIfComplete: seed.allergensComplete ? Object.freeze([...seed.allergens]) : null,
    allergensAtLeast: Object.freeze([...seed.allergens]),
    gardenFlag: seed.gardenFlag,
    seasonMonths: Object.freeze([...seed.seasonMonths]) as number[],
    substitutes: Object.freeze([...seed.substitutes]) as string[],
    gramsPerEach: seed.gramsPerEach,
    servingSizeG: null,
    createdAt: at,
    updatedAt: at,
  });
}

/** Every seed as a view, in catalogue order, with its release row while the release is readable. */
export function allSeedViews(data: FoodDataOk): IngredientView[] {
  const infoById = new Map(data.release.sources.map((s) => [s.id, s]));
  return data.catalogue.foods.map((seed) => {
    const row = data.releaseStatus === 'ok' ? (data.release.foods[seed.id] ?? null) : null;
    return seedView(
      seed,
      row,
      row === null ? null : (infoById.get(row.source) ?? null),
      data.catalogue.revisedOn,
    );
  });
}

/**
 * The pack sizes to show and to buy by: the owner's grams when they corrected them (a millilitre
 * or count container word is not carried over to grams), else the seed's packs, else any stored
 * grams, else none.
 */
export function effectivePacks(
  seed: SeedIngredient | null,
  view: Pick<IngredientView, 'packSizeSource' | 'packSizesG'>,
): SeedPacks | null {
  if (view.packSizeSource === 'owner') {
    return {
      unit: 'g',
      sizes: [...view.packSizesG],
      container: seed?.packs?.unit === 'g' ? seed.packs.container : null,
    };
  }
  if (seed !== null) return seed.packs;
  return view.packSizesG.length > 0
    ? { unit: 'g', sizes: [...view.packSizesG], container: null }
    : null;
}

/** A raw food and its cooked form, from either side (C67); null for a food with no twin. */
export function twinOf(
  data: FoodDataOk,
  id: string,
): { readonly raw: SeedId; readonly cooked: SeedId } | null {
  const food = data.seedById.get(id);
  if (food === undefined) return null;
  if (food.cookedOf !== null) return { raw: food.cookedOf, cooked: food.id };
  const cooked = data.catalogue.foods.find((f) => f.cookedOf === id);
  return cooked === undefined ? null : { raw: id, cooked: cooked.id };
}

const isDatabaseSource = (source: FoodSource): source is DatabaseSource =>
  source === 'nz-fcdb' || source === 'usda';

/**
 * The source a view is shown and counted as (C97, N43): a database that was not approved (one that
 * reached the app through a restored override or own food) is Estimate.
 */
export function displaySource(
  view: Pick<IngredientView, 'source'>,
  approved: readonly DatabaseSource[] = APPROVED_NUTRIENT_SOURCES,
): FoodSource {
  return isDatabaseSource(view.source) && !approved.includes(view.source)
    ? 'estimate'
    : view.source;
}

const allUnknown = (view: Pick<IngredientView, 'unknownNutrients'>): boolean =>
  NUTRIENT_KEYS.every((k) => view.unknownNutrients.includes(k));

/** The badge of a food's own figures; null (no badge) when it shows no number (X4). */
export function foodConfidence(
  view: Pick<IngredientView, 'source' | 'unknownNutrients'>,
  approved: readonly DatabaseSource[] = APPROVED_NUTRIENT_SOURCES,
): Confidence | null {
  const source = displaySource(view, approved);
  if (source === 'not-loaded' || allUnknown(view)) return null;
  return confidenceOf(source);
}

/**
 * The source a recipe line counts as in its source mix and confidence (C32, FL-02): a line with
 * no figures counts as Estimate, so a recipe with one is never better than Estimate.
 */
export function lineSourceForMix(
  view: Pick<IngredientView, 'source' | 'unknownNutrients'>,
  approved: readonly DatabaseSource[] = APPROVED_NUTRIENT_SOURCES,
): NutritionSource {
  const source = displaySource(view, approved);
  return source === 'not-loaded' || allUnknown(view) ? 'estimate' : source;
}

/** Database sources in NUTRITION_SOURCES order. */
export function sortSources(sources: Iterable<DatabaseSource>): DatabaseSource[] {
  const present = new Set(sources);
  return NUTRITION_SOURCES.filter(
    (s): s is DatabaseSource => isDatabaseSource(s) && present.has(s),
  );
}
