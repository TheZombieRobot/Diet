/**
 * What both recipe screens read (item 20 design 3.3): the shipped dataset, the owner's rows in one
 * live read (their foods, corrections, copies, garden, allergens and hidden recipes), the readiness
 * gates for the diet labels, today's saturated-fat budget for the heart cap, and the month for "In
 * season now". A failed read is a state of its own, never an endless "still opening"; nothing is
 * shown before the owner's allergens and the day's budget are read, so the list and a recipe's
 * page always judge heart-smart against the same cap.
 */
import {
  allSeedViews,
  featureGateOf,
  joinList,
  localDateOf,
  type RecipeData,
  recipeData,
  type RecipeFoods,
  type RecipeRecord,
  type RecipeViewContext,
  type RefId,
  readinessGates,
  ingredientResolver,
  type HeartCapBudget,
} from '@diet/core';
import { readiness } from '@diet/core/copy/health';
import { useMemo } from 'react';
import { type LiveQueryState, useLiveQueryState } from '../../db/liveQuery';
import type { RecipeContextRows } from '../../db/repos/recipes';
import type { AppStorage } from '../../db/runtime';
import { useFoodData } from '../../foods/FoodDataContext';
import { gateInputOf, useOnboardingState } from '../../onboarding/state';
import { useNow } from '../../useNow';
import { useDayTargets, useTargetsClock } from '../targets/useDayTargets';

/**
 * The carb-style labels (P13): shown only while the keto carb ceiling is available; off (with the
 * reason) when readiness closes it; and not shown while the answers load or cannot be read.
 */
export type CarbLabels = 'shown' | 'off' | 'failed' | 'loading';

export interface RecipeLabels {
  readonly carbLabels: CarbLabels;
  /** "You told the app about …" for the labels-off notice; null unless carbLabels is 'off'. */
  readonly offReasons: string | null;
  /** Answer 3 yes or unanswered without the prescriber's agreement (HS-33). */
  readonly prescriberCheck: boolean;
  /** Answer 2 yes or unanswered, or the answers not known yet (P40). */
  readonly pregnancyNote: boolean;
  /** Answer 4 yes or unanswered, or not known yet (C102). */
  readonly saltWording: boolean;
}

export type RecipeScreenState =
  | { readonly status: 'data-error' }
  | { readonly status: 'not-ready' }
  | { readonly status: 'read-error' }
  | {
      readonly status: 'ready';
      readonly data: RecipeData;
      readonly foods: RecipeFoods;
      readonly rows: RecipeContextRows;
      readonly storedById: ReadonlyMap<RefId, RecipeRecord>;
      readonly labels: RecipeLabels;
      /** 1–12 in the device zone. */
      readonly month: number;
      /** Item 21's budget for today when it is a budget, null when there is none (C70). */
      readonly satFatBudgetG: HeartCapBudget;
    };

/** The view context of a ready screen: the owner's own serve on the screens (meal 'own'). */
export function viewContext(
  state: Extract<RecipeScreenState, { status: 'ready' }>,
  options: { readonly myServes?: number } = {},
): RecipeViewContext {
  return {
    data: state.data,
    foods: state.foods,
    storedById: state.storedById,
    profile: state.rows.profile,
    meal: 'own',
    gardenIngredientIds: new Set(state.rows.gardenIngredientIds),
    hiddenSeedIds: new Set(state.rows.hiddenSeedIds),
    month: state.month,
    myServes: options.myServes ?? 1,
    satFatBudgetG: state.satFatBudgetG,
  };
}

/**
 * Item 21's saturated-fat budget for today: grams when it is a budget, null when there is none,
 * 'not-read' when the day's targets could not be read, and undefined while they load.
 */
function useSatFatBudgetG(storage: AppStorage): HeartCapBudget | undefined {
  const clock = useTargetsClock(storage);
  const day = useDayTargets(storage, clock);
  if (day.status === 'loading') return undefined;
  if (day.status === 'error') return 'not-read';
  const budget = day.view.targets.saturatedFat;
  return budget.kind === 'budget' ? budget.grams : null;
}

const readRows = (storage: AppStorage): Promise<RecipeContextRows> =>
  storage.repos.recipes.context();

export function useRecipeScreenData(storage: AppStorage): RecipeScreenState {
  const rows: LiveQueryState<RecipeContextRows> = useLiveQueryState(storage, readRows);
  const onboarding = useOnboardingState(storage);
  const { approved } = useFoodData();
  const at = useNow(storage.env);
  const month = Number(localDateOf(at, storage.env.timeZone()).slice(5, 7));
  const satFatBudgetG = useSatFatBudgetG(storage);
  const labels = useMemo((): RecipeLabels => {
    if (onboarding === undefined || !onboarding.ok) {
      const carbLabels = onboarding === undefined ? 'loading' : 'failed';
      return {
        carbLabels,
        offReasons: null,
        prescriberCheck: false,
        pregnancyNote: true,
        saltWording: true,
      };
    }
    const gates = readinessGates(gateInputOf(onboarding.state, storage.env));
    const shown = gates.ketoCeilingAvailable;
    return {
      carbLabels: shown ? 'shown' : 'off',
      offReasons: shown
        ? null
        : joinList(
            featureGateOf(gates, 'ketoCeiling').reasons.map((r) => readiness.reasonPhrases[r]),
            readiness.listComma,
            readiness.listAnd,
          ),
      prescriberCheck: shown && !gates.carbCeilingBelow50Allowed,
      pregnancyNote: gates.reasons.includes('pregnant-or-breastfeeding'),
      saltWording: gates.bloodPressureSaltWording,
    };
  }, [onboarding, storage.env]);
  return useMemo((): RecipeScreenState => {
    const result = recipeData();
    if (result.status !== 'ok') return { status: 'data-error' };
    if (rows.status === 'pending' || satFatBudgetG === undefined) return { status: 'not-ready' };
    if (rows.status === 'error') return { status: 'read-error' };
    const { own, overrides, recipes } = rows.value;
    return {
      status: 'ready',
      data: result.data,
      foods: {
        resolve: ingredientResolver(allSeedViews(result.foods), overrides, own),
        seedById: result.foods.seedById,
        approved,
      },
      rows: rows.value,
      storedById: new Map(recipes.map((r) => [r.id, r])),
      labels,
      month,
      satFatBudgetG,
    };
  }, [rows, approved, labels, month, satFatBudgetG]);
}
