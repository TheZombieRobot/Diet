import { fillTemplate, recipeData } from '@diet/core';
import { gardenScreen, planner, recipes } from '@diet/core/copy/health';
import { ActionRow, Card, FoodIcon, LeafIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { appStorageStore } from '../db/runtime';
import { GateNotice } from '../onboarding/GateNotice';
import { ROUTE_TITLES, routeHref } from '../routes';
import { useStore } from '../store';
import { Placeholder } from './Placeholder';
import { FoodPlanner } from './planner/FoodPlanner';
import { PlannerStateCard } from './planner/parts';

export function FoodScreen(): ReactElement {
  // Item 20: the count comes from the shipped dataset, with no database read; a dataset that
  // cannot be read leaves the row out (the recipe screens say so).
  const result = recipeData();
  const storage = useStore(appStorageStore);
  return (
    <>
      {/* Item 22 (design 2.2): the readiness notice, then the planner's cards. */}
      <GateNotice feature="ketoCeiling" link linkWhen="actionable" />
      {storage === null ? (
        <PlannerStateCard label={planner.week.label} state="not-ready" />
      ) : (
        <FoodPlanner storage={storage} />
      )}
      {/* Item 19: the garden and pantry. */}
      <Card label={gardenScreen.foodLink.cardLabel}>
        <ActionRow
          href={routeHref('garden')}
          badge={<LeafIcon />}
          title={ROUTE_TITLES.garden}
          detail={gardenScreen.foodLink.detail}
        />
      </Card>
      {result.status === 'ok' ? (
        <Card label={recipes.foodLink.cardLabel}>
          <div data-testid="food-recipes-link">
            <ActionRow
              href={routeHref('recipes')}
              badge={<FoodIcon size={22} />}
              title={recipes.foodLink.title}
              detail={fillTemplate(recipes.foodLink.detail, {
                count: result.data.recipes.length,
              })}
            />
          </div>
        </Card>
      ) : null}
      <Placeholder partial coming="Food will hold the food log." />
    </>
  );
}
