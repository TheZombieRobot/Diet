import { gardenScreen } from '@diet/core/copy/health';
import { ActionRow, Card, LeafIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { GateNotice } from '../onboarding/GateNotice';
import { ROUTE_TITLES, routeHref } from '../routes';
import { Placeholder } from './Placeholder';

export function FoodScreen(): ReactElement {
  return (
    <>
      {/* Item 19: the garden and pantry, above everything else on Food (design 1.2). */}
      <Card label={gardenScreen.foodLink.cardLabel}>
        <ActionRow
          href={routeHref('garden')}
          badge={<LeafIcon />}
          title={ROUTE_TITLES.garden}
          detail={gardenScreen.foodLink.detail}
        />
      </Card>
      <GateNotice feature="ketoCeiling" link />
      <Placeholder
        partial
        coming="Food will hold the week's meal plan, recipes and the food log."
      />
    </>
  );
}
