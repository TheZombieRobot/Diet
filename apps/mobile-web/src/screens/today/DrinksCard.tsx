import type { GuidanceShown } from '@diet/core';
import { today } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { GateNotice } from '../../onboarding/GateNotice';
import { drinkingDayText } from '../drinks/drinksText';
import { DrinkTiles, FreeDaysNote, GuidanceLine } from '../drinks/SummaryCard';
import type { DrinksState } from '../drinks/useDrinksView';

/**
 * Today's Drinks card (UX_SCREENS section 2, card 7; item 16 design section 1.8, item 28 design
 * 2.14; mock-up Main): today's drinking day and the Monday-start week as two tiles, in drinks,
 * standard drinks and kcal (A3, A4, C105), then the NZ guidance for the set that applies, always in
 * one line that ends "No alcohol use is risk-free." (NN-09, C66). With readiness answer 2 "yes" or
 * unanswered the pregnancy line replaces the figures (F30). Nothing scores or compares, and there
 * is no "Add drink" button (A45): the "+" and the Drinks tab are each one tap away. Under 18 the
 * card stays with item 13's reason and no figures (RD-01). When the drinking day does not start at
 * midnight the card says when it does, since the Nutrition card beside it counts the calendar day.
 */
export function DrinksCard({
  drinks,
  state,
}: {
  readonly drinks: { readonly kind: 'gated' } | GuidanceShown;
  /** The shared drinks read; the tiles appear once its first result arrives. */
  readonly state: DrinksState;
}): ReactElement {
  return (
    <Card label={today.cards.drinks}>
      {drinks.kind === 'gated' ? (
        <GateNotice feature="alcoholLogging" link linkWhen="actionable" />
      ) : (
        <>
          {state.kind === 'ready' ? <DrinkTiles view={state.view} kj={false} /> : null}
          <GuidanceLine shown={drinks} />
          {state.kind === 'ready' ? (
            <>
              <FreeDaysNote view={state.view} />
              {state.view.ctx.cutoverMinutes > 0 ? (
                <p className="ui-text-muted">{drinkingDayText(state.view.ctx.cutoverMinutes)}</p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Card>
  );
}
