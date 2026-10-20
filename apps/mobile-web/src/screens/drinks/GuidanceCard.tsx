/**
 * NZ guidance (UX 5c; item 28 design 2.11; HS-05, NN-09, C25, C46, C60, C66, C78; A13, A26, A27).
 * Only the set that applies is shown, and its figures appear only inside the guidance line, which
 * ends "No alcohol use is risk-free." The single-occasion line is context only: never a trigger or
 * a per-occasion total. Sources are named in plain text, with no links out of the app.
 */
import { alcohol } from '@diet/core/copy/health';
import { Card } from '@diet/ui';
import type { ReactElement } from 'react';
import { drinkingDayText } from './drinksText';
import type { DrinksView } from './view';

const g = alcohol.guidance;

export function GuidanceCard({ view }: { readonly view: DrinksView }): ReactElement {
  const { set, basis } = view.guidance;
  return (
    <Card label={g.cardLabel}>
      <p className="ui-drinks-guidance">{g.line[set]}</p>
      <p>{g.singleOccasion[set]}</p>
      <p>
        {basis === 'profile'
          ? g.basis.profile[set]
          : basis === 'no-sex'
            ? g.basis.noSex
            : g.basis.chosen}
      </p>
      <p>{g.notPersonal}</p>
      <p className="ui-text-muted">{g.howWorkedOut}</p>
      <p className="ui-text-muted">{drinkingDayText(view.ctx.cutoverMinutes)}</p>
      <p className="ui-text-muted">{g.sources}</p>
    </Card>
  );
}
