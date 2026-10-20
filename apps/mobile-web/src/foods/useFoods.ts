/**
 * The live food catalogue (item 18 design 5.2 and 1.6): every seed as the owner's corrections
 * leave it, a resolver over seeds, corrections and the owner's own foods, and the profile's
 * allergens, gluten-free setting and dislikes. It reads the profile, ingredient_overrides and ingredients
 * stores and writes nothing. The list waits for all three, so it is never shown without the
 * owner's allergens; a missing profile is an error, never "no allergens" (fails closed, N21).
 */
import {
  allSeedViews,
  type Catalogue,
  catalogueEntriesFrom,
  effectiveIngredient,
  type FoodDataOk,
  type IngredientOverrideRecord,
  type IngredientRecord,
  type IngredientResolver,
  ingredientResolver,
  type IngredientView,
  PRE_DATASET_CATALOGUE,
  type ProfileRecord,
} from '@diet/core';
import { useMemo } from 'react';
import { useLiveQuery } from '../db/liveQuery';
import type { AppStorage } from '../db/runtime';
import { useFoodData } from './FoodDataContext';

export interface FoodInputs {
  readonly overrides: readonly IngredientOverrideRecord[];
  readonly own: readonly IngredientRecord[];
  readonly profile: ProfileRecord | null;
}

/** A failed read returns { ok: false } instead of throwing: a live query swallows errors. */
export type FoodInputsRead =
  { readonly ok: true; readonly inputs: FoodInputs } | { readonly ok: false };

export async function readFoodInputs(storage: AppStorage): Promise<FoodInputsRead> {
  const { repos } = storage;
  try {
    const [overrides, own, profile] = await Promise.all([
      repos.ingredientOverrides.list(),
      repos.ingredients.list(),
      repos.profile.get(),
    ]);
    return { ok: true, inputs: { overrides, own, profile } };
  } catch {
    return { ok: false };
  }
}

/** What the food screens read from the profile: allergens, the gluten-free setting and dislikes. */
export type FoodsProfile = Pick<
  ProfileRecord,
  'allergens' | 'glutenFreeHousehold' | 'dislikeIngredientIds' | 'dislikeTerms'
>;

export type FoodsState =
  | { readonly status: 'pending' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly data: FoodDataOk;
      /** Every seed with the owner's corrections, in catalogue order. */
      readonly views: readonly IngredientView[];
      readonly viewById: ReadonlyMap<string, IngredientView>;
      readonly resolve: IngredientResolver;
      readonly profile: FoodsProfile;
      readonly own: readonly IngredientRecord[];
    };

/** The pure part of useFoods, for a read already in hand. */
export function foodsState(data: FoodDataOk | null, read: FoodInputsRead | undefined): FoodsState {
  if (data === null) return { status: 'error' };
  if (read === undefined) return { status: 'pending' };
  if (!read.ok || read.inputs.profile === null) return { status: 'error' };
  const { overrides, own, profile } = read.inputs;
  const seeds = allSeedViews(data);
  const overrideById = new Map(overrides.map((o) => [o.seedId, o]));
  const views = seeds.map((view) => effectiveIngredient(view, overrideById.get(view.id) ?? null));
  return {
    status: 'ready',
    data,
    views,
    viewById: new Map(views.map((v) => [v.id, v])),
    resolve: ingredientResolver(seeds, overrides, own),
    profile: {
      allergens: profile.allergens,
      glutenFreeHousehold: profile.glutenFreeHousehold,
      dislikeIngredientIds: profile.dislikeIngredientIds,
      dislikeTerms: profile.dislikeTerms,
    },
    own,
  };
}

/** The live catalogue for a screen; the views are rebuilt only when the stored rows change. */
export function useFoods(storage: AppStorage | null): FoodsState {
  const { data } = useFoodData();
  const read = useLiveQuery(storage, readFoodInputs);
  return useMemo(
    () =>
      storage === null
        ? { status: 'pending' }
        : foodsState(data.status === 'ok' ? data : null, read),
    [storage, data, read],
  );
}

/**
 * Item 19's link catalogue (G12, G13): every seed and the owner's own foods once the dataset is
 * read; only silverbeet before that, or when it cannot be read.
 */
export function catalogueFrom(state: FoodsState): Catalogue {
  if (state.status !== 'ready') return PRE_DATASET_CATALOGUE;
  return { entries: catalogueEntriesFrom(state.views, state.own), hasDataset: true };
}

export function useFoodCatalogue(storage: AppStorage | null): Catalogue {
  const state = useFoods(storage);
  return useMemo(() => catalogueFrom(state), [state]);
}
