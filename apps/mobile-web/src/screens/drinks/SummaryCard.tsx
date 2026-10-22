/**
 * Today and this week (UX 2 card 7 and 5a; item 28 design 2.7 and 2.14; HS-05, NN-09, C21, C94,
 * C105; A2 to A4, A13). Drinks, standard drinks to 2 decimals and energy as a fact, in the neutral
 * colour. The "more than the guidance" lines compare the shown totals, say no figure and appear
 * only strictly above; the figures themselves appear only in the guidance line, which ends "No
 * alcohol use is risk-free." With readiness answer 2 "yes" or unanswered the pregnancy line takes
 * its place and nothing is compared (F30). Nothing is drawn or worded as a target.
 */
import { energyDisplay, fillTemplate, type GuidanceShown, type PeriodTotals } from '@diet/core';
import { alcohol, privacy } from '@diet/core/copy/health';
import { Card, StatGrid, StatTile } from '@diet/ui';
import type { ReactElement } from 'react';
import { formatMeasure } from '../../format';
import { drinkingDayText, energyText, freeDaysText, totalsText } from './drinksText';
import type { DrinksView } from './view';

const s = alcohol.summary;

function tileValue(t: PeriodTotals): { value: string; spoken?: string } {
  if (t.drinks === 0) return { value: s.noneLogged };
  const { shown, spoken } = totalsText(t);
  return { value: shown, spoken };
}

/** The guidance line for what the screen shows: the set's figures, or the pregnancy line (F30). */
export function GuidanceLine({ shown }: { readonly shown: GuidanceShown }): ReactElement {
  return (
    <p className="ui-drinks-guidance" data-testid="drinks-guidance">
      {shown.kind === 'pregnancy' ? alcohol.guidance.pregnancy : alcohol.guidance.line[shown.set]}
    </p>
  );
}

/** C21 point 4: the footnote, only where an alcohol-free count is shown with it. */
export function FreeDaysNote({ view }: { readonly view: DrinksView }): ReactElement | null {
  return view.weekFree.countedDays > 0 ? <p className="ui-text-muted">{s.freeNote}</p> : null;
}

/** The two tiles; energy with kJ on the Drinks screen, kcal only on Today's card (A4). */
export function DrinkTiles({
  view,
  kj,
}: {
  readonly view: DrinksView;
  readonly kj: boolean;
}): ReactElement {
  const todayEnergy = energyText(energyDisplay(view.todayTotals), kj);
  const weekEnergy = energyText(energyDisplay(view.weekTotals), kj);
  const free = view.weekFree.countedDays > 0 ? freeDaysText(view.weekFree.count) : null;
  const weekDetail =
    weekEnergy === null
      ? free
      : free === null
        ? weekEnergy
        : fillTemplate(s.detail, { energy: weekEnergy, free });
  return (
    <StatGrid>
      <StatTile label={s.today} {...tileValue(view.todayTotals)} detail={todayEnergy} />
      <StatTile label={s.week} {...tileValue(view.weekTotals)} detail={weekDetail} />
    </StatGrid>
  );
}

/** Up to three lines of a period's breakdown, then "and N more". */
function Breakdown({
  title,
  totals,
}: {
  readonly title: string;
  readonly totals: PeriodTotals;
}): ReactElement | null {
  if (totals.breakdown.length === 0) return null;
  const shown = totals.breakdown.slice(0, 3);
  const more = totals.breakdown.length - shown.length;
  return (
    <div>
      <p className="ui-text-muted">{title}</p>
      <ul className="ui-plain-list">
        {shown.map((line) => (
          <li key={`${line.name}|${line.volumeMl}`}>
            {fillTemplate(s.breakdown, {
              count: line.count,
              name: line.name,
              volume: formatMeasure(line.volumeMl),
            })}
          </li>
        ))}
        {more > 0 ? <li>{fillTemplate(s.breakdownMore, { count: more })}</li> : null}
      </ul>
    </div>
  );
}

export function SummaryCard({ view }: { readonly view: DrinksView }): ReactElement {
  return (
    <Card label={s.cardLabel}>
      <DrinkTiles view={view} kj />
      <Breakdown title={s.today} totals={view.todayTotals} />
      <Breakdown title={s.week} totals={view.weekTotals} />
      {view.todayAbove ? <p>{s.dayAbove}</p> : null}
      {view.weekAbove ? <p>{s.weekAbove}</p> : null}
      <GuidanceLine shown={view.shown} />
      <FreeDaysNote view={view} />
      <p className="ui-text-muted">{drinkingDayText(view.ctx.cutoverMinutes)}</p>
      {view.weekTotals.zoneFallback ? (
        <p className="ui-text-muted">{privacy.zoneFallback}</p>
      ) : null}
    </Card>
  );
}
