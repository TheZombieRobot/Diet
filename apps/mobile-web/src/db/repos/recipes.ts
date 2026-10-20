/**
 * The owner's recipes (storage spec section 4.7; item 20 design 6.2 and 6.3): the generic
 * repository, with every write passing the allergen union, plus the recipe screens' read and the
 * swap that saves an owner's copy (HS-24, C43, C107).
 *
 * - An allergen is never lost: create, update and swapLine store the union of the row's list, the
 *   stored list, the recipe it was made from (followed back through its copies) and every line's
 *   current allergens, so an update can only add one; a copy's origin can never be changed.
 * - A swap the screen would not offer is refused (a food known to carry an allergen the owner
 *   listed, a hidden gluten-free swap, a disliked or alcohol food), whoever asks.
 * - A copy is saved only when the schema can store its figures (D35): before food data is loaded
 *   no copy can be stored, and the swap is refused before the validator would refuse it.
 * - A copy still in the meal plan is not removed.
 * Restore and upgrade write rows as they are (HS-15); every reader unions the origin's allergens.
 */
import {
  allergenUnion,
  allSeedViews,
  applySwap,
  APPROVED_NUTRIENT_SOURCES,
  type FoodDataOk,
  foodData,
  type Id,
  type IngredientOverrideRecord,
  type IngredientRecord,
  ingredientResolver,
  isSeedId,
  originAllergens,
  type ProfileRecord,
  type RecipeData,
  recipeData,
  type RecipeFoods,
  type RecipeRecord,
  type RefId,
  type SeedId,
  type SeedRecipe,
  seedRecipe,
  substituteOptions,
} from '@diet/core';
import Dexie from 'dexie';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { type CrudRepo, crudRepo, stampCreate, stampUpdate } from './crud';

/** What the recipe screens read, in one transaction (design 6.2). */
export interface RecipeContextRows {
  readonly own: IngredientRecord[];
  readonly overrides: IngredientOverrideRecord[];
  /** The owner's copies. */
  readonly recipes: RecipeRecord[];
  /** Garden rows' linked ingredients. */
  readonly gardenIngredientIds: RefId[];
  readonly profile: Pick<
    ProfileRecord,
    'allergens' | 'dislikeIngredientIds' | 'dislikeTerms' | 'glutenFreeHousehold'
  >;
  readonly hiddenSeedIds: SeedId[];
  /** Every planned meal's recipe (none until item 22). */
  readonly plannedRecipeIds: RefId[];
}

export interface RecipesRepo extends CrudRepo<'recipes'> {
  readonly context: () => Promise<RecipeContextRows>;
  /** Saves the owner's copy of a seed with one line swapped (created), or swaps a line of a copy. */
  readonly swapLine: (input: {
    readonly recipeId: RefId;
    readonly lineIndex: number;
    readonly ingredientId: RefId;
  }) => Promise<{ readonly record: RecipeRecord; readonly created: boolean }>;
  /** Removes an owner copy (Undo, "Go back to the original recipe"); refused while it is planned. */
  readonly removeCopy: (id: Id) => Promise<void>;
}

type Row = Record<string, unknown>;

/** The data a write checks against, read before its transaction (both are pure and cached). */
function shippedData(): { readonly foods: FoodDataOk; readonly data: RecipeData } {
  const foods = foodData();
  const recipes = recipeData();
  if (foods.status !== 'ok' || recipes.status !== 'ok')
    throw new StorageRuleError('recipes', 'recipe-not-found');
  return { foods, data: recipes.data };
}

/** The foods as a write sees them: the shipped seeds with the owner's corrections and own foods. */
function writeFoods(
  data: FoodDataOk,
  overrides: readonly IngredientOverrideRecord[],
  own: readonly IngredientRecord[],
): RecipeFoods {
  return {
    resolve: ingredientResolver(allSeedViews(data), overrides, own),
    seedById: data.seedById,
    approved: APPROVED_NUTRIENT_SOURCES,
  };
}

const storedMap = (rows: readonly RecipeRecord[]) => new Map(rows.map((r) => [r.id, r]));

export function recipesRepo(ctx: RepoContext): RecipesRepo {
  const { db, env } = ctx;
  const crud = crudRepo(ctx, 'recipes');
  const FOOD_STORES = ['recipes', 'ingredients', 'ingredient_overrides'] as const;

  const create: RecipesRepo['create'] = (input) =>
    guardedWrite(ctx, () => {
      const { foods: shipped, data } = shippedData();
      const stamped = stampCreate('recipes', input, env);
      return db.transaction('rw', [...FOOD_STORES], () =>
        Dexie.Promise.all([
          db.ingredients.toArray(),
          db.ingredient_overrides.toArray(),
          db.recipes.toArray(),
        ]).then(([own, overrides, stored]) => {
          const foods = writeFoods(shipped, overrides, own);
          const row = prepare(
            'recipes',
            {
              ...stamped,
              allergens: allergenUnion({
                declared: input.allergens,
                previous: null,
                origin: originAllergens(input.derivedFromRecipeId, data, storedMap(stored), foods),
                lines: input.lines,
                foods,
              }),
            },
            env,
          );
          return db.recipes.add(row).then(() => row);
        }),
      );
    });

  const update: RecipesRepo['update'] = (id, patch) =>
    guardedWrite(ctx, () => {
      const { foods: shipped, data } = shippedData();
      return db.transaction('rw', [...FOOD_STORES], () =>
        Dexie.Promise.all([
          db.ingredients.toArray(),
          db.ingredient_overrides.toArray(),
          db.recipes.toArray(),
        ]).then(([own, overrides, rows]) => {
          const stored = rows.find((r) => r.id === id);
          if (stored === undefined) throw new StorageRuleError('recipes', 'not-found');
          // An origin can never be changed to escape its allergens.
          if (
            patch.derivedFromRecipeId !== undefined &&
            patch.derivedFromRecipeId !== stored.derivedFromRecipeId
          )
            throw new StorageRuleError('recipes', 'recipe-origin-fixed');
          const foods = writeFoods(shipped, overrides, own);
          const merged = stampUpdate('recipes', stored as unknown as Row, patch, env);
          const next = merged as unknown as RecipeRecord;
          const row = prepare(
            'recipes',
            {
              ...merged,
              allergens: allergenUnion({
                declared: next.allergens,
                previous: stored.allergens,
                origin: originAllergens(stored.derivedFromRecipeId, data, storedMap(rows), foods),
                lines: next.lines,
                foods,
              }),
            },
            env,
            stored,
          );
          return db.recipes.put(row).then(() => row);
        }),
      );
    });

  const removeCopy = (id: Id): Promise<void> =>
    guardedWrite(ctx, () =>
      db.transaction('rw', ['recipes', 'plan_days'], () =>
        db.plan_days.toArray().then((days) => {
          if (days.some((day) => day.meals.some((meal) => meal.recipeId === id)))
            throw new StorageRuleError('recipes', 'recipe-in-plan');
          return db.recipes.delete(id);
        }),
      ),
    ).then(() => undefined);

  const swapLine: RecipesRepo['swapLine'] = ({ recipeId, lineIndex, ingredientId }) =>
    guardedWrite(ctx, () => {
      const { foods: shipped, data } = shippedData();
      // D15: the new id and the time are taken before the transaction.
      const newId = env.randomId();
      const now = env.now();
      return db.transaction(
        'rw',
        ['recipes', 'ingredients', 'ingredient_overrides', 'profile', 'garden'],
        () =>
          Dexie.Promise.all([
            db.ingredients.toArray(),
            db.ingredient_overrides.toArray(),
            db.recipes.toArray(),
            db.profile.get('singleton'),
            db.garden.toArray(),
          ]).then(([own, overrides, stored, profile, garden]) => {
            if (profile === undefined) throw new StorageRuleError('profile', 'not-found');
            const foods = writeFoods(shipped, overrides, own);
            const seed: SeedRecipe | null = isSeedId(recipeId) ? seedRecipe(recipeId) : null;
            const copy = seed === null ? stored.find((r) => r.id === recipeId) : undefined;
            const base = seed ?? copy;
            const line = base?.lines[lineIndex];
            if (base === undefined || line === undefined || !Number.isInteger(lineIndex))
              throw new StorageRuleError('recipes', 'recipe-not-found');
            if (seed !== null && stored.some((r) => r.derivedFromRecipeId === seed.id))
              throw new StorageRuleError('recipes', 'recipe-copy-exists');
            const copySeed =
              copy === undefined || copy.derivedFromRecipeId === null
                ? null
                : seedRecipe(copy.derivedFromRecipeId);
            const options = substituteOptions({
              line,
              seedLines: copy === undefined ? null : (copySeed?.lines ?? null),
              foods,
              profile,
              gardenIngredientIds: new Set(
                garden.flatMap((row) => (row.ingredientId === null ? [] : [row.ingredientId])),
              ),
            });
            if (!options.candidates.some((c) => c.id === ingredientId))
              throw new StorageRuleError('recipes', 'recipe-swap-not-allowed');
            const origin =
              copy === undefined
                ? []
                : originAllergens(copy.derivedFromRecipeId, data, storedMap(stored), foods);
            const draft = applySwap({ base, lineIndex, ingredientId, origin, foods });
            const { snapshot } = draft;
            if (snapshot === null) throw new StorageRuleError('recipes', 'recipe-figures-unknown');
            if (seed !== null) {
              const row = prepare(
                'recipes',
                {
                  id: newId,
                  title: seed.title,
                  serves: seed.serves,
                  timeMinutes: seed.timeMinutes,
                  lines: draft.lines,
                  method: [...seed.method],
                  tags: [],
                  allergens: draft.allergens,
                  derivedFromRecipeId: seed.id,
                  ...snapshot,
                  createdAt: now,
                  updatedAt: now,
                },
                env,
              );
              return db.recipes.add(row).then(() => ({ record: row, created: true }));
            }
            const previous = copy;
            if (previous === undefined) throw new StorageRuleError('recipes', 'recipe-not-found');
            const row = prepare(
              'recipes',
              stampUpdate(
                'recipes',
                previous as unknown as Row,
                {
                  lines: draft.lines,
                  allergens: allergenUnion({
                    declared: draft.allergens,
                    previous: previous.allergens,
                    origin,
                    lines: draft.lines,
                    foods,
                  }),
                  ...snapshot,
                },
                env,
              ),
              env,
              previous,
            );
            return db.recipes.put(row).then(() => ({ record: row, created: false }));
          }),
      );
    });

  const context = (): Promise<RecipeContextRows> =>
    db.transaction(
      'r',
      [
        'ingredients',
        'ingredient_overrides',
        'recipes',
        'garden',
        'profile',
        'settings',
        'plan_days',
      ],
      () =>
        Dexie.Promise.all([
          db.ingredients.toArray(),
          db.ingredient_overrides.toArray(),
          db.recipes.toArray(),
          db.garden.toArray(),
          db.profile.get('singleton'),
          db.settings.get('singleton'),
          db.plan_days.toArray(),
        ]).then(([own, overrides, recipes, garden, profile, settings, days]) => {
          // Fails closed: the recipe screens never show allergens without the owner's list.
          if (profile === undefined) throw new StorageRuleError('profile', 'not-found');
          return {
            own,
            overrides,
            recipes,
            gardenIngredientIds: garden.flatMap((row) =>
              row.ingredientId === null ? [] : [row.ingredientId],
            ),
            profile: {
              allergens: profile.allergens,
              dislikeIngredientIds: profile.dislikeIngredientIds,
              dislikeTerms: profile.dislikeTerms,
              glutenFreeHousehold: profile.glutenFreeHousehold,
            },
            hiddenSeedIds: settings?.hiddenSeedIds ?? [],
            plannedRecipeIds: days.flatMap((day) => day.meals.map((meal) => meal.recipeId)),
          };
        }),
    );

  return {
    ...crud,
    create,
    update,
    remove: removeCopy,
    context,
    swapLine,
    removeCopy,
  };
}
