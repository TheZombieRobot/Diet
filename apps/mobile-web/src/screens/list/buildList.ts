/**
 * Making or updating the list from the plan (item 24 design 1.5 and 4.3). The inputs are read
 * first (the plan days of the seven days, the owner recipes they name, the profile and item 19's
 * stock), the pure builder runs, and one repository write stores the list and its audit rows. A
 * result too large for the validator is refused before any write (J43). Reads only: plan days,
 * recipes, profile, garden and pantry; never a health store.
 */
import {
  addDays,
  fillTemplate,
  type GroceryListRecord,
  isSeedId,
  type LocalDate,
  localDateOf,
  type PlanDayRecord,
  type RecipeRecord,
  type RefId,
  seedRecipe,
} from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import {
  type BuildInput,
  buildGroceryList,
  type DatedMeal,
  type ListFoods,
  MAX_LIST_ITEMS,
  previousListAt,
  type ResolvedRecipe,
} from '@diet/grocery';
import type { AppStorage } from '../../db/runtime';
import { readStockNow } from '../../garden/stock';
import { listWriteMessage, type ListMessage } from './writeErrors';

export type BuildMode = 'new' | 'update';

export interface BuildRequest {
  readonly mode: BuildMode;
  readonly firstDay: LocalDate;
  /** The current list as the panel showed it (the one to update, or the one a new list replaces). */
  readonly current: GroceryListRecord | null;
}

export type BuildOutcome =
  | { readonly ok: true; readonly text: string; readonly listId: string; readonly skipped: number }
  | { readonly ok: false; readonly message: ListMessage };

/** The plan's seven days, from `firstDay`. */
export function readPlanRange(storage: AppStorage, firstDay: LocalDate): Promise<PlanDayRecord[]> {
  return storage.repos.planDays.listByIndex('date', firstDay, addDays(firstDay, 6));
}

/** The owner recipes the rows name, each read once. */
export async function readOwnerRecipes(
  storage: AppStorage,
  rows: readonly PlanDayRecord[],
): Promise<ReadonlyMap<RefId, RecipeRecord>> {
  const ids = [...new Set(rows.flatMap((r) => r.meals.map((m) => m.recipeId)))].filter(
    (id) => !isSeedId(id),
  );
  const found = await Promise.all(ids.map((id) => storage.repos.recipes.get(id)));
  return new Map(
    found.filter((r): r is RecipeRecord => r !== undefined).map((r) => [r.id, r] as const),
  );
}

/** A planned meal's recipe: a seed from item 20's data, an owner copy from the store. */
export function recipeResolver(
  owner: ReadonlyMap<RefId, RecipeRecord>,
): (id: RefId) => ResolvedRecipe | null {
  return (id) => {
    if (isSeedId(id)) {
      const seed = seedRecipe(id);
      return seed === null
        ? null
        : { title: seed.title, serves: seed.serves, lines: seed.lines, seedLines: null };
    }
    const own = owner.get(id);
    if (own === undefined) return null;
    const base = own.derivedFromRecipeId === null ? null : seedRecipe(own.derivedFromRecipeId);
    return {
      title: own.title,
      serves: own.serves,
      lines: own.lines,
      seedLines: base?.lines ?? null,
    };
  };
}

export async function gatherBuildInput(
  storage: AppStorage,
  foods: ListFoods,
  request: BuildRequest,
): Promise<{ readonly input: BuildInput; readonly storeName: string }> {
  const { repos, env } = storage;
  const [rows, profile, stock] = await Promise.all([
    readPlanRange(storage, request.firstDay),
    repos.profile.get(),
    readStockNow(storage),
  ]);
  const owner = await readOwnerRecipes(storage, rows);
  const meals: DatedMeal[] = rows.flatMap((row) =>
    row.meals.map((meal) => ({ date: row.date, meal })),
  );
  const now = env.now();
  const timeZone = env.timeZone();
  return {
    storeName: profile.storeName,
    input: {
      meals,
      recipeOf: recipeResolver(owner),
      foods,
      profile,
      stock,
      ctx: {
        now,
        today: localDateOf(now, timeZone),
        timeZone,
        previousListAt: previousListAt(request.current),
      },
      previous: request.mode === 'update' ? request.current : null,
      randomId: () => env.randomId(),
    },
  };
}

/** Builds and writes; every refusal and failure is a message and nothing is written. */
export async function runBuild(
  storage: AppStorage,
  foods: ListFoods,
  request: BuildRequest,
): Promise<BuildOutcome> {
  try {
    const { input, storeName } = await gatherBuildInput(storage, foods, request);
    const result = buildGroceryList(input);
    if (!result.ok) {
      const text =
        result.reason === 'too-many-lines'
          ? fillTemplate(grocery.build.tooMany, { max: MAX_LIST_ITEMS })
          : fillTemplate(grocery.build.tooLarge, { item: result.item });
      return { ok: false, message: { text, tone: 'alert' } };
    }
    const { current } = request;
    const written =
      request.mode === 'update' && current !== null
        ? await storage.repos.groceryBuild.updateList(
            current.id,
            () => ({ items: result.items, storeName, audits: result.audits }),
            { build: { expectedVersion: current.version } },
          )
        : await storage.repos.groceryBuild.create(
            { storeName, items: result.items },
            result.audits,
          );
    return {
      ok: true,
      text: request.mode === 'update' ? grocery.build.updated : grocery.build.made,
      listId: written.id,
      skipped: result.skippedMeals,
    };
  } catch (error) {
    return { ok: false, message: listWriteMessage(error, 'build') };
  }
}
