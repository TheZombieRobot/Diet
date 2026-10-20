import { fillTemplate, recipeData } from '@diet/core';
import { recipes } from '@diet/core/copy/health';
import { ActionRow, Card, FoodIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { GateNotice } from '../onboarding/GateNotice';
import { routeHref } from '../routes';
import { Placeholder } from './Placeholder';

export function FoodScreen(): ReactElement {
  // Item 20: the count comes from the shipped dataset, with no database read; a dataset that
  // cannot be read leaves the row out (the recipe screens say so).
  const result = recipeData();
  return (
    <>
      <GateNotice feature="ketoCeiling" link />
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
      <Placeholder
        partial
        coming="Food will hold the week's meal plan, the food log, and the garden and pantry lists."
      />
    </>
  );
}
