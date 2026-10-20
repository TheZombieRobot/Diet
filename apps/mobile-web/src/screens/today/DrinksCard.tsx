import type { AlcoholGuidanceSet } from '@diet/core';
import { alcohol, today } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { GateNotice } from '../../onboarding/GateNotice';

/**
 * Today's Drinks card before drink logging exists (UX_SCREENS section 2, card 7; design section
 * 1.8, T10, T11). The NZ guidance for the set that applies, always in one line that ends "No
 * alcohol use is risk-free." (NN-09, C66), and a line saying logging arrives later: no totals, no
 * counts and nothing that scores. Under 18 the card stays with item 13's reason and no figures.
 */
export function DrinksCard({
  drinks,
}: {
  readonly drinks:
    { readonly kind: 'gated' } | { readonly kind: 'guidance'; readonly set: AlcoholGuidanceSet };
}): ReactElement {
  return (
    <Card label={today.cards.drinks}>
      {drinks.kind === 'gated' ? (
        <GateNotice feature="alcoholLogging" link linkWhen="actionable" />
      ) : (
        <>
          <p data-testid="drinks-guidance">{alcohol.guidance.line[drinks.set]}</p>
          <p className="ui-text-muted" data-testid="later-step">
            {today.laterStep.drinks}
          </p>
        </>
      )}
    </Card>
  );
}
