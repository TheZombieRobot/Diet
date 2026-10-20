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
import { type ReactElement, useMemo } from 'react';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { recipeHref } from '../../routes';
import { useStore } from '../../store';
import { LabelNotices, ListChips, RecipeStateCard } from './parts';
import { type RecipeScreenState, useRecipeScreenData, viewContext } from './useRecipeScreenData';

const SECTION_LABELS: Readonly<Record<RecipeSection, string>> = recipes.list.sections;

interface Row {
  readonly view: RecipeView;
  readonly day: number | null;
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
  return (
    <>
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
    </>
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
