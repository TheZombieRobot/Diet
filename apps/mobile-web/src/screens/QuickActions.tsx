import { Card, FloatingActionPanel } from '@diet/ui';
import type { ReactElement } from 'react';

/** The floating "+" on Today. The quick actions themselves arrive with the Today dashboard. */
export function QuickActions(): ReactElement {
  return (
    <FloatingActionPanel label="Quick actions">
      <Card label="Quick actions">
        <p>
          Quick ways to log weight, finish a meal, add a drink or open the grocery list arrive with
          the Today dashboard at a later step of the build checklist.
        </p>
      </Card>
    </FloatingActionPanel>
  );
}
