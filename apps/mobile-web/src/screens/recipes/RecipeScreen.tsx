/**
 * A recipe's page (UX_SCREENS 3b; item 20 design 3.4): at a glance, ingredients with "Cooking
 * for", the method, one serve's nutrition, allergens and what next. Its figures are item 18's
 * (totalRows, ingredientMissingLines, foodBadge, nutritionFooter): before food data is loaded every
 * figure reads "not known" with no badge (HS-37). Cooking for changes the amounts only; the
 * nutrition card is one serve, or the planned portion when opened from a plan day (HS-23).
 */
import {
  allergenListText,
  carbStyleLine,
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
  type HeartCapBudget,
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
import { keepOnEntry, keptOnEntry, replaceKeepingEntry } from '../../navigation';
import { HeadChips, LabelNotices, RecipeStateCard, ReloadButton } from './parts';
import { RecipeActions } from './RecipeActions';
import { COOKING_FOR, cookingForOn, removeFailure, swapStatusStore } from './status';
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

/**
 * The carb-style line (design 4.6; HS-39): a style word only on complete carbs or on a lower
 * bound that proves it (balanced); otherwise what the recipe was written for.
 */
function carbStyleText(view: RecipeView): string {
  const { netCarbsPerServeG, complete } = view.carbStyle;
  const amount = figureText('carbsG', figureShown(netCarbsPerServeG, !complete));
  const line = carbStyleLine(view.carbStyle);
  switch (line.kind) {
    case 'figures':
      return fillTemplate(recipes.style.figures, {
        style: recipes.chips.style[line.style],
        amount,
      });
    case 'written':
      return `${recipes.style.written[line.written]} ${recipes.style.notYet}`;
    case 'written-above':
      return `${recipes.style.written[line.written]} ${fillTemplate(recipes.style.knownAbove, { amount })}`;
    case 'unknown':
      return recipes.style.unknown;
  }
}

/** The heart line and its cap line (design 4.5): what the label is, and the limit it used. */
function heartLines(view: RecipeView, myServes: number, budgetG: HeartCapBudget): string[] {
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
          : budgetG === 'not-read'
            ? recipes.heart.budgetNotRead
            : recipes.heart.unknown;
  const cap =
    typeof budgetG === 'number' && budgetG > 0 && budgetG < SAT_FAT_REFERENCE_G
      ? fillTemplate(recipes.heart.capBudget, { budgetG: formatNumber(budgetG) })
      : recipes.heart.capReference;
  return [line, cap];
}

const BADGE_WORDS: Readonly<Record<Confidence, string>> = foods.badges;

/**
 * A sentence with its {title} as a link to that recipe ("Cook extra for <link>."). The link is a
 * 48 px tap target inside the sentence (item 37).
 */
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
      <a className="ui-link-button" href={recipeHref(recipe.id)}>
        {recipe.title}
      </a>
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
  readonly budgetG: HeartCapBudget;
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

/**
 * "Cooking for" as the owner left it on this history entry (Back returns to it, and a swap or
 * Undo carries it to the recipe that replaces this one), else the recipe's own serves.
 */
function initialCookingFor(view: RecipeView): number {
  const kept = keptOnEntry(COOKING_FOR);
  if (typeof kept === 'object' && kept !== null) {
    const { id, serves } = kept as Readonly<Record<string, unknown>>;
    if (
      id === view.id &&
      typeof serves === 'number' &&
      Number.isInteger(serves) &&
      serves >= SCALE_SERVES_LIMITS.min &&
      serves <= SCALE_SERVES_LIMITS.max
    )
      return serves;
  }
  return Math.min(view.serves, SCALE_SERVES_LIMITS.max);
}

function RecipePage({
  storage,
  state,
  view,
  myServes,
}: {
  readonly storage: AppStorage;
  readonly state: Ready;
  readonly view: RecipeView;
  readonly myServes: number;
}): ReactElement {
  const writable = useGateOpen(storage.gate);
  const status = useStore(swapStatusStore);
  const [cookingFor, setCookingForState] = useState(() => initialCookingFor(view));
  const setCookingFor = (serves: number) => {
    setCookingForState(serves);
    keepOnEntry(cookingForOn(view.id, serves));
  };
  const [undoing, setUndoing] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const { labels } = state;
  const scaled = scaleLines(view.lines, view.serves, cookingFor);
  const copy =
    view.origin === 'seed'
      ? (state.rows.recipes.find((r) => r.derivedFromRecipeId === view.id) ?? null)
      : null;
  const ownStatus = status !== null && status.recipeId === view.id ? status : null;
  // The status stays until the copy is removed: a refused Undo says why, and Undo stays.
  const undo = () => {
    if (ownStatus?.kind !== 'created' || view.seed === null || undoing.busy) return;
    const seedId = view.seed.id;
    setUndoing({ busy: true, error: null });
    storage.repos.recipes.removeCopy(view.id).then(
      () => {
        swapStatusStore.set({ recipeId: seedId, kind: 'undone' });
        replaceKeepingEntry(recipeHref(seedId), cookingForOn(seedId, cookingFor));
      },
      (error: unknown) => {
        setUndoing({ busy: false, error: removeFailure(error) });
      },
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
      {/* A swap that updated this copy is confirmed in "What next", where it was made. */}
      {ownStatus === null || ownStatus.kind === 'updated' ? null : (
        <Notice tone="info" role="status">
          <p>
            {ownStatus.kind === 'created'
              ? fillTemplate(recipes.swap.done, { from: ownStatus.from, to: ownStatus.to })
              : ownStatus.kind === 'undone'
                ? recipes.swap.undone
                : recipes.remove.done}
          </p>
          {ownStatus.kind === 'created' ? (
            <Button
              disabled={!writable}
              aria-disabled={undoing.busy ? 'true' : undefined}
              onClick={undo}
            >
              {recipes.swap.undo}
            </Button>
          ) : null}
        </Notice>
      )}
      {ownStatus?.kind === 'created' && undoing.error !== null ? (
        <Notice tone="amber" role="alert">
          <p>{undoing.error}</p>
        </Notice>
      ) : null}
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
            <p data-testid="recipe-carb-style">{carbStyleText(view)}</p>
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
            // P41: also beside a conflict, for the other allergens the owner listed.
            if (view.labelCheck.length > 0 && line.allergens.allergensUnknown)
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
        budgetG={state.satFatBudgetG}
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
        {view.labelCheck.length > 0 ? (
          <Notice tone="amber">
            <p>
              {fillTemplate(recipes.allergens.unknownForYou, {
                allergens: allergenListText(view.labelCheck),
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
        myServes={myServes}
        writable={writable}
      />
    </>
  );
}

function RecipeBody({ storage }: { readonly storage: AppStorage }): ReactElement {
  const hash = useHash();
  const route = recipeRouteOf(hash);
  const state = useRecipeScreenData(storage);
  const myServes = route?.myServes ?? 1;
  const seed = route === null ? null : seedRecipe(route.id);
  const recipe =
    seed ?? (route !== null && state.status === 'ready' ? state.storedById.get(route.id) : null);
  const view = useMemo(
    () =>
      state.status === 'ready' && recipe !== null && recipe !== undefined
        ? recipeView(recipe, viewContext(state, { myServes }))
        : null,
    [state, recipe, myServes],
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
    <RecipePage key={view.id} storage={storage} state={state} view={view} myServes={myServes} />
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
