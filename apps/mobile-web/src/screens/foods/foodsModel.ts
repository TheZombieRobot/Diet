/**
 * Everything the "Foods in the app" screen shows, built from the live catalogue (item 18 design
 * 1.3). Pure: FoodsView renders it and formats nothing, so every figure goes through core's
 * per100gRows ("not known", never 0), and every allergen through foodAllergenFacts.
 */
import {
  allergenRowPart,
  allergenSummary,
  allergenSummaryText,
  allergenWarning,
  allowedSwaps,
  type AttributionMap,
  conflictText,
  type DatabaseSource,
  displaySource,
  effectivePacks,
  fillTemplate,
  foodAllergenFacts,
  foodConfidence,
  type FoodDataOk,
  footerForViews,
  formatNumber,
  type IngredientResolver,
  type IngredientView,
  joinList,
  matchKey,
  MIN_QUERY_LENGTH,
  NUTRIENT_KEYS,
  type NutrientRowView,
  nutritionFooter,
  OTHER_AISLE,
  packsText,
  per100gRows,
  type ProfileRecord,
  searchFoods,
  SEED_AISLES,
  seasonText,
  type TimeZone,
  twinOf,
} from '@diet/core';
import { foods } from '@diet/core/copy/health';
import { formatLocalDate } from '../../format';

export interface FoodsModelInput {
  readonly data: FoodDataOk;
  readonly approved: readonly DatabaseSource[];
  readonly attributions: AttributionMap;
  /** Every seed with the owner's corrections. */
  readonly views: readonly IngredientView[];
  readonly resolve: IngredientResolver;
  readonly profile: Pick<ProfileRecord, 'allergens' | 'glutenFreeHousehold'>;
  readonly query: string;
  readonly openId: string | null;
  readonly timeZone: TimeZone;
}

export interface FoodFact {
  readonly term: string;
  readonly lines: readonly string[];
  readonly amberNotices: readonly string[];
}

export interface FoodPanelModel {
  readonly facts: readonly FoodFact[];
  readonly badge: string | null;
  readonly table: { readonly caption: string; readonly rows: readonly NutrientRowView[] };
  readonly notice: string | null;
  readonly sourceLine: string | null;
  readonly footer: string;
}

export interface FoodRowModel {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly flag: string | null;
  /** Only for the open row. */
  readonly panel: FoodPanelModel | null;
}

export interface FoodsCardModel {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly FoodRowModel[];
}

export interface FoodsModel {
  readonly statusText: string;
  readonly cards: readonly FoodsCardModel[];
  /** Null when the open row is not among the rows shown. */
  readonly openId: string | null;
}

const byName = (a: IngredientView, b: IngredientView) => a.name.localeCompare(b.name, 'en-NZ');
const list = (items: readonly string[]) => joinList(items, foods.listComma, foods.listAnd);

/** The conflicts with the owner's listed allergens (never empty-handed for a brand-dependent food). */
function conflictsOf(input: FoodsModelInput, view: IngredientView) {
  return allergenWarning(input.profile.allergens, foodAllergenFacts(view)).conflicts;
}

function rowDetail(input: FoodsModelInput, view: IngredientView): string | null {
  const seed = input.data.seedById.get(view.id);
  const parts = [
    view.gardenFlag ? foods.screen.rowGarden : null,
    (seed?.cookedOf ?? null) !== null ? foods.screen.rowCooked : null,
    allergenRowPart(allergenSummary(view)),
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

function packsFact(input: FoodsModelInput, view: IngredientView): FoodFact | null {
  const seed = input.data.seedById.get(view.id) ?? null;
  const term = foods.detail.packs;
  const rawId = seed?.cookedOf ?? null;
  if (rawId !== null) {
    const raw = input.resolve(rawId);
    return raw === null
      ? null
      : { term, lines: [fillTemplate(foods.detail.notSold, { name: raw.name })], amberNotices: [] };
  }
  const packs = effectivePacks(seed, view);
  const countWord = seed?.countWord ?? null;
  if (packs === null || (packs.unit === 'each' && countWord === null)) return null;
  const lines = [
    packsText(packs, seed?.loose ?? false, countWord),
    view.packSizeSource === 'owner' && view.packSizeEnteredAt !== null
      ? fillTemplate(foods.detail.packsOwner, {
          date: formatLocalDate(view.packSizeEnteredAt, input.timeZone),
        })
      : foods.detail.packsTypical,
  ];
  if (view.gramsPerEach !== null && countWord !== null) {
    lines.push(
      fillTemplate(foods.detail.eachWeighs, {
        one: countWord.one,
        grams: formatNumber(view.gramsPerEach),
      }),
    );
  }
  return { term, lines, amberNotices: [] };
}

function swapsFact(input: FoodsModelInput, view: IngredientView): FoodFact | null {
  if (view.substitutes.length === 0) return null;
  const { swaps } = allowedSwaps(view, input.resolve, input.profile);
  const names = swaps.map((s) =>
    s.checkLabel ? fillTemplate(foods.detail.swapCheckLabel, { name: s.view.name }) : s.view.name,
  );
  return {
    term: foods.detail.swaps,
    lines: [names.length === 0 ? foods.detail.swapsNoneShown : names.join(foods.listComma)],
    amberNotices: [],
  };
}

function panelOf(input: FoodsModelInput, view: IngredientView): FoodPanelModel {
  const { data, approved, attributions, profile } = input;
  const facts: FoodFact[] = [];
  const add = (term: string, lines: readonly (string | null)[], amberNotices: string[] = []) => {
    const present = lines.filter((l): l is string => l !== null);
    if (present.length > 0) facts.push({ term, lines: present, amberNotices });
  };

  add(foods.detail.otherNames, [
    view.aliases.length === 0 ? foods.detail.noOtherNames : view.aliases.join(foods.listComma),
  ]);
  add(foods.detail.aisle, [view.aisle]);
  const packs = packsFact(input, view);
  if (packs !== null) facts.push(packs);

  // Allergens always show; for an owner who lists any, conflicts and "not fully known" in amber.
  const amber: string[] = [];
  if (profile.allergens.length > 0) {
    const conflicts = conflictsOf(input, view);
    if (conflicts.length > 0)
      amber.push(
        fillTemplate(foods.detail.allergenConflict, {
          list: conflictText(profile.allergens, conflicts),
        }),
      );
    if (foodAllergenFacts(view).allergensUnknown) amber.push(foods.detail.allergenUnknownForYou);
  }
  facts.push({
    term: foods.detail.allergens,
    lines: [allergenSummaryText(allergenSummary(view))],
    amberNotices: amber,
  });

  const season = seasonText(view.seasonMonths);
  add(foods.detail.season, season === null ? [] : [season, foods.detail.seasonNote]);
  add(foods.detail.garden, [view.gardenFlag ? foods.detail.gardenYes : null]);
  const swaps = swapsFact(input, view);
  if (swaps !== null) facts.push(swaps);
  const twin = twinOf(data, view.id);
  if (twin !== null && twin.raw === view.id) {
    const cooked = input.resolve(twin.cooked);
    add(foods.detail.cookedFormLabel, [
      cooked === null ? null : fillTemplate(foods.detail.cookedForm, { name: cooked.name }),
    ]);
  }

  // A food with no figure shows no badge; its eight figures read "not known".
  const confidence = foodConfidence(view, approved);
  const unknown = NUTRIENT_KEYS.filter((k) => view.unknownNutrients.includes(k));
  let notice: string | null = null;
  if (view.source === 'not-loaded')
    notice = data.releaseStatus === 'unreadable' ? foods.releaseUnreadable : foods.notLoaded;
  else if (unknown.length > 0 && confidence !== null)
    notice = fillTemplate(foods.partlyKnown[confidence], {
      list: list(unknown.map((k) => foods.nutrientNamesLower[k])),
    });

  const source = displaySource(view, approved);
  const row = data.release.foods[view.id];
  let sourceLine: string | null = null;
  if ((source === 'nz-fcdb' || source === 'usda') && row?.source === source) {
    const name = attributions[source]?.name;
    if (name !== undefined)
      sourceLine = fillTemplate(foods.sourceLine, { source: name, foodName: row.foodName });
  } else if (source === 'label' || source === 'estimate') {
    sourceLine = foods.sourceOwn[source];
  }

  return {
    facts,
    badge:
      confidence === null
        ? null
        : fillTemplate(foods.detail.badgeLine, { badge: foods.badges[confidence] }),
    table: {
      caption: foods.detail.nutritionCaption[view.nutrientBasis],
      rows: per100gRows(view),
    },
    notice,
    sourceLine,
    footer: nutritionFooter(footerForViews([view], approved), attributions),
  };
}

function rowOf(input: FoodsModelInput, view: IngredientView, openId: string | null): FoodRowModel {
  const conflicts = input.profile.allergens.length > 0 ? conflictsOf(input, view) : [];
  return {
    id: view.id,
    title: view.name,
    detail: rowDetail(input, view),
    flag:
      conflicts.length === 0
        ? null
        : fillTemplate(foods.screen.rowConflict, {
            list: conflictText(input.profile.allergens, conflicts),
          }),
    panel: view.id === openId ? panelOf(input, view) : null,
  };
}

/** The aisle cards: the generic aisles in order, an owner's own aisles by name, then "Other". */
function aisleCards(views: readonly IngredientView[]): { key: string; foods: IngredientView[] }[] {
  const byAisle = new Map<string, IngredientView[]>();
  for (const view of views) byAisle.set(view.aisle, [...(byAisle.get(view.aisle) ?? []), view]);
  const seedAisles: readonly string[] = SEED_AISLES;
  const own = [...byAisle.keys()]
    .filter((a) => !seedAisles.includes(a) && a !== OTHER_AISLE)
    .sort((a, b) => a.localeCompare(b, 'en-NZ'));
  return [...seedAisles, ...own, OTHER_AISLE]
    .filter((aisle) => byAisle.has(aisle))
    .map((aisle) => ({ key: aisle, foods: [...(byAisle.get(aisle) ?? [])].sort(byName) }));
}

export function foodsModel(input: FoodsModelInput): FoodsModel {
  const active = matchKey(input.query).length >= MIN_QUERY_LENGTH;
  const groups = active
    ? [
        {
          key: 'matches',
          label: foods.screen.matchesLabel,
          foods: searchFoods(input.views, input.query),
        },
      ].filter((g) => g.foods.length > 0)
    : aisleCards(input.views).map((g) => ({ ...g, label: g.key }));
  const shown = new Set(groups.flatMap((g) => g.foods.map((f) => f.id)));
  const openId = input.openId !== null && shown.has(input.openId) ? input.openId : null;
  const count = shown.size;
  const statusText = !active
    ? fillTemplate(foods.screen.count, { count: input.views.length })
    : count === 0
      ? foods.screen.noMatch
      : count === 1
        ? foods.screen.matchOne
        : fillTemplate(foods.screen.matchCount, { count });
  return {
    statusText,
    cards: groups.map((g) => ({
      key: g.key,
      label: g.label,
      rows: g.foods.map((view) => rowOf(input, view, openId)),
    })),
    openId,
  };
}
