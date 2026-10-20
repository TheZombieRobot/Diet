/**
 * A recipe's page (UX_SCREENS 3b; item 20 design 3.4): at a glance, ingredients with "Cooking
 * for", the method, one serve's nutrition, allergens and what next. Its figures are item 18's
 * (totalRows, ingredientMissingLines, foodBadge, nutritionFooter): before food data is loaded every
 * figure reads "not known" with no badge (HS-37). Cooking for changes the amounts only; the
 * nutrition card is one serve, or the planned portion when opened from a plan day (HS-23).
 */
import {
  allergenListText,
  type Confidence,
  eggCount,
  figureShown,
  figureText,
  fillTemplate,
  footerForViews,
  formatNumber,
  ingredientMissingLines,
  type IngredientView,
  joinList,
  myPortionNutrients,
  nutritionFooter,
  per100gRaw,
  type RecipeView,
  recipeView,
  SAT_FAT_REFERENCE_G,
  SCALE_SERVES_LIMITS,
  scaleLines,
  seedRecipe,
  totalRows,
} from '@diet/core';
import { foods, privacy, readiness, recipes, targets } from '@diet/core/copy/health';
import {
  ActionRow,
  Button,
  Card,
  Chip,
  LineItem,
  LineList,
  Notice,
  NutrientTable,
  Stepper,
  Switch,
} from '@diet/ui';
import { type ReactElement, useLayoutEffect, useMemo, useState } from 'react';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { recipeGramsText } from '../../format';
import { recipeHref, recipeRouteOf, routeHref } from '../../routes';
import { screenTitleStore } from '../../screenTitle';
import { useStore } from '../../store';
import { useHash } from '../../useRoute';
import { useGateOpen } from '../backup/focus';
import { useDayTargets, useTargetsClock } from '../targets/useDayTargets';
import { HeadChips, LabelNotices, RecipeStateCard, ReloadButton } from './parts';
import { RecipeActions } from './RecipeActions';
import { swapStatusStore } from './status';
import { type RecipeScreenState, useRecipeScreenData, viewContext } from './useRecipeScreenData';

type Ready = Extract<RecipeScreenState, { status: 'ready' }>;

/**
 * Sets the top bar's heading and the tab title to the dish name while this page shows it, for
 * this hash: a copy and its original share a title, so moving between them sets it again.
 */
function useScreenTitle(title: string | null, hash: string): void {
  useLayoutEffect(() => {
    if (title === null) return undefined;
    screenTitleStore.set({ hash, title });
    return () => {
      if (screenTitleStore.get()?.hash === hash) screenTitleStore.set(null);
    };
  }, [title, hash]);
}

function NotFound(): ReactElement {
  return (
    <Card label={recipes.routeTitles.recipe}>
      <p>{recipes.detail.notFound}</p>
      <ActionRow href={routeHref('recipes')} title={recipes.detail.allRecipes} />
    </Card>
  );
}

/** The carb-style line (design 4.6): never a bare style while the carbs are not worked out. */
function carbStyleLine(view: RecipeView): string {
  const { style, basis, complete, netCarbsPerServeG } = view.carbStyle;
  if (style === null || basis === 'none') return recipes.style.unknown;
  if (basis === 'written' && !complete)
    return `${recipes.style.written[style]} ${recipes.style.notYet}`;
  return fillTemplate(recipes.style.figures, {
    style: recipes.chips.style[style],
    amount: figureText('carbsG', figureShown(netCarbsPerServeG, !complete)),
  });
}

/** The heart line and its cap line (design 4.5): what the label is, and the limit it used. */
function heartLines(view: RecipeView, myServes: number, budgetG: number | null): string[] {
  const portion = myServes === 1 ? recipes.heart.portion.serve : recipes.heart.portion.mine;
  const capG = formatNumber(Math.floor(view.heart.capG * 10) / 10);
  const heart = view.heart;
  const line =
    heart.kind === 'heart-smart'
      ? fillTemplate(recipes.heart.heartSmart, { portion, capG })
      : heart.kind === 'flagged'
        ? fillTemplate(recipes.heart.flagged, {
            reasons: joinList(
              heart.reasons.map((r) => fillTemplate(recipes.heart.reasons[r], { capG, portion })),
              foods.listComma,
              foods.listAnd,
            ),
          })
        : heart.kind === 'neither'
          ? recipes.heart.neither
          : recipes.heart.unknown;
  const usesBudget = budgetG !== null && budgetG > 0 && budgetG < SAT_FAT_REFERENCE_G;
  const cap = usesBudget
    ? fillTemplate(recipes.heart.capBudget, { budgetG: formatNumber(budgetG) })
    : recipes.heart.capReference;
  return [line, cap];
}

const BADGE_WORDS: Readonly<Record<Confidence, string>> = foods.badges;

/** A sentence with its {title} as a link to that recipe ("Cook extra for <link>."). */
function TitleLink({
  template,
  recipe,
}: {
  readonly template: string;
  readonly recipe: { readonly id: string; readonly title: string };
}): ReactElement {
  const [before = '', after = ''] = template.split('{title}');
  return (
    <>
      {before}
      <a href={recipeHref(recipe.id)}>{recipe.title}</a>
      {after}
    </>
  );
}

function NutritionCard({
  view,
  myServes,
  budgetG,
  approved,
}: {
  readonly view: RecipeView;
  readonly myServes: number;
  readonly budgetG: number | null;
  readonly approved: Ready['foods']['approved'];
}): ReactElement {
  const [per100, setPer100] = useState(false);
  const badge = view.badge;
  const lineViews = view.nutrition.lines.flatMap((l): IngredientView[] =>
    l.view === null ? [] : [l.view],
  );
  const rows = per100
    ? totalRows(per100gRaw(view.nutrition), view.unknownNutrients)
    : totalRows(view.perServe, view.unknownNutrients);
  const [heartLine, capLine] = heartLines(view, myServes, budgetG);
  return (
    <Card
      label={recipes.nutrition.label}
      aside={
        badge === null || badge === 'label' ? undefined : (
          <Chip tone={badge === 'estimate' ? 'amber' : 'neutral'}>{BADGE_WORDS[badge]}</Chip>
        )
      }
    >
      <NutrientTable
        caption={per100 ? recipes.nutrition.caption100 : recipes.nutrition.caption}
        rows={rows}
      />
      {ingredientMissingLines(view.nutrition.lines).map((line) => (
        <p key={line} className="ui-text-muted">
          {line}
        </p>
      ))}
      <Switch
        label={recipes.nutrition.per100Switch}
        hint={recipes.nutrition.per100Note}
        checked={per100}
        onChange={setPer100}
      />
      {myServes === 1 ? null : (
        <>
          <h3>{recipes.nutrition.plannedLabel}</h3>
          <p className="ui-text-muted">
            {fillTemplate(recipes.nutrition.plannedServes, { serves: formatNumber(myServes) })}
          </p>
          <NutrientTable
            caption={recipes.nutrition.plannedLabel}
            rows={totalRows(
              myPortionNutrients({ perServe: view.perServe, myServes }),
              view.unknownNutrients,
            )}
          />
        </>
      )}
      {view.nutrition.noneLoaded ? null : (
        <>
          <p data-testid="recipe-heart">{heartLine}</p>
          <p className="ui-text-muted">{capLine}</p>
          <p className="ui-text-muted">{recipes.heart.why}</p>
        </>
      )}
      {badge === 'database' || badge === 'estimate' ? (
        <>
          <p className="ui-text-muted">{recipes.nutrition.confidenceHelp[badge]}</p>
          <p className="ui-text-muted">{recipes.nutrition.neverLabel}</p>
        </>
      ) : null}
      <p className="ui-text-muted" data-testid="recipe-footer">
        {nutritionFooter(footerForViews(lineViews, approved))}
      </p>
    </Card>
  );
}

function RecipePage({
  storage,
  state,
  view,
  myServes,
  budgetG,
}: {
  readonly storage: AppStorage;
  readonly state: Ready;
  readonly view: RecipeView;
  readonly myServes: number;
  readonly budgetG: number | null;
}): ReactElement {
  const writable = useGateOpen(storage.gate);
  const status = useStore(swapStatusStore);
  const [cookingFor, setCookingFor] = useState(Math.min(view.serves, SCALE_SERVES_LIMITS.max));
  const { labels } = state;
  const scaled = scaleLines(view.lines, view.serves, cookingFor);
  const copy =
    view.origin === 'seed'
      ? (state.rows.recipes.find((r) => r.derivedFromRecipeId === view.id) ?? null)
      : null;
  const ownStatus = status !== null && status.recipeId === view.id ? status : null;
  const undo = () => {
    if (ownStatus?.kind !== 'created' || view.seed === null) return;
    const seedId = view.seed.id;
    swapStatusStore.set(null);
    storage.repos.recipes.removeCopy(view.id).then(
      () => {
        swapStatusStore.set({ recipeId: seedId, kind: 'undone' });
        location.replace(recipeHref(seedId));
      },
      () => undefined,
    );
  };
  const facts = view.allergens.facts;
  return (
    <>
      {writable ? null : (
        <Notice tone="amber" role="status">
          <p>{privacy.backupCard.closed}</p>
          <ReloadButton />
        </Notice>
      )}
      {ownStatus === null ? null : (
        <Notice tone="info" role="status">
          <p>
            {ownStatus.kind === 'created'
              ? fillTemplate(recipes.swap.done, { from: ownStatus.from, to: ownStatus.to })
              : ownStatus.kind === 'updated'
                ? fillTemplate(recipes.swap.doneUpdate, { from: ownStatus.from, to: ownStatus.to })
                : ownStatus.kind === 'undone'
                  ? recipes.swap.undone
                  : recipes.remove.done}
          </p>
          {ownStatus.kind === 'created' ? (
            <Button disabled={!writable} onClick={undo}>
              {recipes.swap.undo}
            </Button>
          ) : null}
        </Notice>
      )}
      {copy === null ? null : (
        <Notice tone="info">
          <p>{recipes.detail.copyExists}</p>
          <ActionRow href={recipeHref(copy.id)} title={recipes.detail.openVersion} />
        </Notice>
      )}
      <Card label={recipes.detail.atAGlance}>
        {view.serving === 'conflict' ? (
          <Notice tone="amber" role="alert">
            <p>
              {fillTemplate(recipes.allergens.conflict, {
                allergens: allergenListText(view.conflicts),
              })}
            </p>
          </Notice>
        ) : null}
        {labels.pregnancyNote ? (
          <p className="ui-text-muted">{recipes.detail.pregnancyNote}</p>
        ) : null}
        <dl className="ui-facts">
          <div>
            <dt className="ui-facts__term">{recipes.detail.makesTerm}</dt>
            <dd className="ui-facts__value">
              {view.serves === 1
                ? recipes.detail.makesOne
                : fillTemplate(recipes.detail.makes, { serves: view.serves })}
            </dd>
          </div>
          {view.timeMinutes === null ? null : (
            <div>
              <dt className="ui-facts__term">{recipes.detail.timeTerm}</dt>
              <dd className="ui-facts__value">
                {fillTemplate(recipes.detail.time, { minutes: view.timeMinutes })}
              </dd>
            </div>
          )}
        </dl>
        <div className="ui-chip-row">
          <HeadChips view={view} labels={labels} />
        </div>
        {labels.carbLabels === 'shown' ? (
          <>
            <p data-testid="recipe-carb-style">{carbStyleLine(view)}</p>
            <p className="ui-text-muted">{targets.carbs.meaning}</p>
          </>
        ) : null}
        <LabelNotices labels={labels} />
        {view.origin === 'owner' && view.seed !== null ? (
          <>
            <p>{fillTemplate(recipes.detail.yourVersionOf, { title: view.seed.title })}</p>
            <ActionRow href={recipeHref(view.seed.id)} title={recipes.detail.seeOriginal} />
          </>
        ) : null}
      </Card>
      <Card label={recipes.ingredients.label}>
        <div id="recipe-scale" tabIndex={-1} className="ui-scale-target">
          <Stepper
            label={recipes.ingredients.cookingFor}
            value={cookingFor}
            min={SCALE_SERVES_LIMITS.min}
            max={SCALE_SERVES_LIMITS.max}
            onChange={setCookingFor}
            decreaseLabel={recipes.ingredients.fewer}
            increaseLabel={recipes.ingredients.more}
            hint={recipes.ingredients.cookingForHint}
          />
        </div>
        <p className="ui-text-muted">
          {cookingFor === 1
            ? recipes.ingredients.amountsForOne
            : fillTemplate(recipes.ingredients.amountsFor, { serves: cookingFor })}
        </p>
        <LineList>
          {scaled.map((line) => {
            const details: string[] = [];
            if (line.displayAs !== null)
              details.push(
                line.scaled
                  ? fillTemplate(recipes.ingredients.asWritten, {
                      serves: view.serves,
                      amount: line.displayAs,
                    })
                  : line.displayAs,
              );
            if (line.egg && line.scaled) {
              const count = eggCount(line.rawG);
              details.push(
                count === 1
                  ? recipes.ingredients.eggCountOne
                  : fillTemplate(recipes.ingredients.eggCount, { count }),
              );
            }
            if (line.cookedG !== null)
              details.push(
                fillTemplate(recipes.ingredients.cooked, { grams: recipeGramsText(line.cookedG) }),
              );
            if (line.leftover && view.usesLeftoversFrom !== null)
              details.push(
                fillTemplate(recipes.ingredients.leftoverLine, {
                  title: view.usesLeftoversFrom.title,
                }),
              );
            if (line.inSeason) details.push(recipes.ingredients.inSeason);
            if (line.swapHints.length > 0)
              details.push(
                fillTemplate(recipes.ingredients.swapHint, {
                  names: joinList(line.swapHints, foods.listComma, foods.listOr),
                }),
              );
            if (line.conflicts.length > 0)
              details.push(
                fillTemplate(foods.screen.rowConflict, { list: allergenListText(line.conflicts) }),
              );
            if (view.serving === 'unknown' && line.allergens.allergensUnknown)
              details.push(foods.screen.rowCheckLabel);
            if (labels.saltWording && line.salty)
              details.push(recipes.ingredients.addsSalt, readiness.bloodPressure.electrolyte);
            if (!line.resolved) details.push(recipes.ingredients.notInApp);
            return (
              <LineItem
                key={line.index}
                name={line.resolved ? line.name : recipes.ingredients.nameMissing}
                amount={recipeGramsText(line.rawG)}
                details={details}
                leaf={line.inGarden ? recipes.ingredients.inGarden : undefined}
              />
            );
          })}
        </LineList>
        {view.usesLeftoversFrom === null ? null : (
          <p>
            <TitleLink template={recipes.leftovers.uses} recipe={view.usesLeftoversFrom} />
          </p>
        )}
        {view.leftoversFeed.map((fed) => (
          <p key={fed.id}>
            <TitleLink template={recipes.leftovers.makes} recipe={fed} />
          </p>
        ))}
      </Card>
      <Card label={recipes.method.label}>
        <ol className="ui-method">
          {view.method.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        {view.origin === 'owner' ? (
          <p className="ui-text-muted">{recipes.detail.methodNote}</p>
        ) : null}
      </Card>
      <NutritionCard
        view={view}
        myServes={myServes}
        budgetG={budgetG}
        approved={state.foods.approved}
      />
      <Card label={recipes.allergens.label}>
        <p>
          {facts.allergens.length === 0
            ? recipes.allergens.noneRecorded
            : fillTemplate(recipes.allergens.contains, {
                allergens: allergenListText(facts.allergens),
              })}
        </p>
        {facts.allergensUnknown ? <p>{recipes.allergens.checkLabels}</p> : null}
        {view.origin === 'owner' && view.allergens.inheritedOnly.length > 0 ? (
          <p>
            {fillTemplate(recipes.allergens.inherited, {
              allergens: allergenListText(view.allergens.inheritedOnly),
            })}
          </p>
        ) : null}
        {view.serving === 'unknown' ? (
          <Notice tone="amber">
            <p>
              {fillTemplate(recipes.allergens.unknownForYou, {
                allergens: allergenListText(view.blocked),
              })}
            </p>
          </Notice>
        ) : null}
        {state.rows.profile.glutenFreeHousehold && view.glutenCereals.length > 0 ? (
          <p>
            {fillTemplate(recipes.allergens.glutenHousehold, {
              cereals: allergenListText(view.glutenCereals),
            })}
          </p>
        ) : null}
        <p className="ui-text-muted">{recipes.allergens.source}</p>
      </Card>
      <RecipeActions
        storage={storage}
        state={state}
        view={view}
        copyOfSeed={copy}
        cookingFor={cookingFor}
        writable={writable}
      />
    </>
  );
}

/** Item 21's saturated-fat budget for today, when there is one (the heart cap; C70). */
function useSatFatBudgetG(storage: AppStorage): number | null {
  const clock = useTargetsClock(storage);
  const day = useDayTargets(storage, clock);
  if (day.status !== 'ready') return null;
  const budget = day.view.targets.saturatedFat;
  return budget.kind === 'budget' ? budget.grams : null;
}

function RecipeBody({ storage }: { readonly storage: AppStorage }): ReactElement {
  const hash = useHash();
  const route = recipeRouteOf(hash);
  const state = useRecipeScreenData(storage);
  const budgetG = useSatFatBudgetG(storage);
  const myServes = route?.myServes ?? 1;
  const seed = route === null ? null : seedRecipe(route.id);
  const recipe =
    seed ?? (route !== null && state.status === 'ready' ? state.storedById.get(route.id) : null);
  const view = useMemo(
    () =>
      state.status === 'ready' && recipe !== null && recipe !== undefined
        ? recipeView(recipe, viewContext(state, { myServes, satFatBudgetG: budgetG }))
        : null,
    [state, recipe, myServes, budgetG],
  );
  useScreenTitle(view?.title ?? seed?.title ?? null, hash);
  if (state.status === 'data-error')
    return <RecipeStateCard label={recipes.routeTitles.recipe} state="data-error" />;
  // A seed id the dataset does not have, or a copy that is not stored once the rows are read.
  const known = route !== null && (seed !== null || state.status !== 'ready' || view !== null);
  if (!known) return <NotFound />;
  if (state.status !== 'ready' || view === null)
    return (
      <RecipeStateCard
        label={seed?.title ?? recipes.routeTitles.recipe}
        state={state.status === 'read-error' ? 'read-error' : 'not-ready'}
      />
    );
  // A new page for each recipe: the scale and panels start afresh.
  return (
    <RecipePage
      key={view.id}
      storage={storage}
      state={state}
      view={view}
      myServes={myServes}
      budgetG={budgetG}
    />
  );
}

export function RecipeScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  return storage === null ? (
    <RecipeStateCard label={recipes.routeTitles.recipe} state="not-ready" />
  ) : (
    <RecipeBody storage={storage} />
  );
}
