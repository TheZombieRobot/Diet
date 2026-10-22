import {
  fillTemplate,
  listRecipes,
  RECIPE_SECTIONS,
  recipeData,
  type RecipeSection,
  type RecipeView,
  recipeView,
} from '@diet/core';
import { recipes } from '@diet/core/copy/health';
import { Card, LinkList, LinkRow } from '@diet/ui';
import { type MouseEvent, type ReactElement, useEffect, useMemo } from 'react';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { keepOnEntry, keptOnEntry } from '../../navigation';
import { recipeHref } from '../../routes';
import { useStore } from '../../store';
import { LabelNotices, ListChips, RecipeStateCard } from './parts';
import { type RecipeScreenState, useRecipeScreenData, viewContext } from './useRecipeScreenData';

const SECTION_LABELS: Readonly<Record<RecipeSection, string>> = recipes.list.sections;

interface Row {
  readonly view: RecipeView;
  readonly day: number | null;
}

/** Where the list keeps the owner's place on its history entry: the scroll and the row opened. */
const LIST_PLACE = 'dietRecipeListPlace';

/** Before a row opens its recipe: remember the place, so Back returns to it. */
function keepPlace(event: MouseEvent<HTMLElement>): void {
  const link = (event.target as Element).closest('a.ui-link-row');
  const href = link?.getAttribute('href');
  if (href === null || href === undefined) return;
  keepOnEntry({ [LIST_PLACE]: { y: window.scrollY, href } });
}

/**
 * Back to the list returns to where the owner was: the scroll position and focus on the row they
 * opened. After Shell's own route change (which scrolls to the top and focuses the heading).
 */
function useRestoredPlace(): void {
  useEffect(() => {
    const place = keptOnEntry(LIST_PLACE);
    if (typeof place !== 'object' || place === null) return undefined;
    const { y, href } = place as Readonly<Record<string, unknown>>;
    if (typeof y !== 'number' || typeof href !== 'string') return undefined;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, y);
      const row = [...document.querySelectorAll<HTMLAnchorElement>('main a.ui-link-row')].find(
        (a) => a.getAttribute('href') === href,
      );
      row?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
}

function ReadyList({
  state,
}: {
  readonly state: Extract<RecipeScreenState, { status: 'ready' }>;
}): ReactElement {
  const sections = useMemo(() => {
    const ctx = viewContext(state);
    const bySection = new Map<RecipeSection, Row[]>();
    for (const entry of listRecipes(state.data, state.rows.recipes)) {
      const rows = bySection.get(entry.section) ?? [];
      rows.push({ view: recipeView(entry.recipe, ctx), day: entry.day });
      bySection.set(entry.section, rows);
    }
    return RECIPE_SECTIONS.flatMap((section) => {
      const rows = bySection.get(section);
      return rows === undefined ? [] : [{ section, rows }];
    });
  }, [state]);
  useRestoredPlace();
  return (
    // Only notes the place before a row's own navigation (Enter on a link is a click too).
    <div onClickCapture={keepPlace}>
      <p className="ui-text-lead">{recipes.list.intro}</p>
      <LabelNotices labels={state.labels} />
      {sections.map(({ section, rows }) => (
        <Card key={section} label={SECTION_LABELS[section]}>
          {section === 'week' ? (
            <>
              <p className="ui-text-muted">{recipes.list.weekHint}</p>
              <p className="ui-text-muted">{recipes.list.weekMedicines}</p>
            </>
          ) : null}
          <LinkList>
            {rows.map(({ view, day }) => (
              <LinkRow
                key={view.id}
                href={recipeHref(view.id)}
                title={view.title}
                overline={day === null ? undefined : fillTemplate(recipes.list.dayLabel, { day })}
                detail={
                  view.timeMinutes === null
                    ? fillTemplate(recipes.list.serves, { serves: view.serves })
                    : fillTemplate(recipes.list.servesTime, {
                        serves: view.serves,
                        minutes: view.timeMinutes,
                      })
                }
                chips={
                  <ListChips
                    view={view}
                    labels={state.labels}
                    glutenFreeHousehold={state.rows.profile.glutenFreeHousehold}
                  />
                }
              />
            ))}
          </LinkList>
        </Card>
      ))}
    </div>
  );
}

function RecipesBody({ storage }: { readonly storage: AppStorage }): ReactElement {
  const state = useRecipeScreenData(storage);
  if (state.status !== 'ready')
    return <RecipeStateCard label={recipes.routeTitles.recipes} state={state.status} />;
  return <ReadyList state={state} />;
}

/**
 * Food, Recipes (UX_SCREENS 3; item 20 design 3.3): the silverbeet week in day order, then the
 * other dinners, snacks and breakfast and lunch, each with its serves, time and chips. Carb-style
 * chips follow the readiness answers (P13); a recipe whose allergens conflict stays in its place
 * with an amber chip; "Check labels for allergens" shows only for an owner who lists an allergen.
 * The list writes nothing.
 */
export function RecipesScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  if (recipeData().status === 'error')
    return <RecipeStateCard label={recipes.routeTitles.recipes} state="data-error" />;
  return storage === null ? (
    <RecipeStateCard label={recipes.routeTitles.recipes} state="not-ready" />
  ) : (
    <RecipesBody storage={storage} />
  );
}
