import { today } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';

/**
 * A Today card whose feature a later checklist step builds (Nutrition so far, Movement): one line
 * that says so, and no figure, button or sample data (design section 1.5, T3).
 */
export function LaterStepCard({ card }: { readonly card: 'nutrition' | 'movement' }): ReactElement {
  return (
    <Card label={today.cards[card]}>
      <p className="ui-text-muted" data-testid="later-step">
        {today.laterStep[card]}
      </p>
    </Card>
  );
}
