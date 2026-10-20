import { type AlcoholHelpTrigger, helpCardNextChange, helpCardState, instantMs } from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { Button, Card } from '@diet/ui';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { NoticeHelpRows } from '../../onboarding/NoticeHelpRows';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';
import { useRedrawAt } from '../backup/redraw';
import type { DrinksState } from '../drinks/useDrinksView';

const CARD = 'alcohol-help';

/**
 * The "talk to someone" card (HEALTH_SAFETY section 5; HS-06, AL-06 to AL-09b; C44, C58; item 13
 * design section 3.14, item 28 design 2.2): one card for all four triggers, first on Today and at
 * the top of Drinks, from the same live read (useDrinksView), so the two always agree. Question 7
 * yes or unanswered shows it from day one; 7 or more drinking days in a run, 7 days in a row coming
 * to double the weekly guidance figure, or a shaky-or-sick tick within 30 days show it while they
 * hold, under 18 too. "Not now" dismisses every trigger showing, and each comes back by its own
 * registry rule: question 7 after 720 hours, the others at the next drinking-day cut-over while
 * they hold (cardHidden: a done time is ignored and a dismissal dated ahead hides nothing). There
 * is no "done" control; the card can never be turned off (C46). It never names the trigger that
 * fired. Its visibility is worked out at its own render from the clock, and it is drawn again when
 * the app comes back into view and when a dismissal ends (redraw.ts), so it returns without
 * waiting for another redraw.
 */
export function AlcoholHelpCard({
  storage,
  drinks,
  onHidden,
}: {
  readonly storage: AppStorage;
  readonly drinks: DrinksState;
  /** After "Not now": the Drinks screen moves focus to its jump row (Today's focus rescue does its own). */
  readonly onHidden?: (() => void) | undefined;
}): ReactElement | null {
  const save = useSave();
  const marking = useRef(false);
  const whyId = useId();
  const [whyOpen, setWhyOpen] = useState(false);
  const now = storage.env.now();
  const view = drinks.kind === 'ready' ? drinks.view : null;
  const active: readonly AlcoholHelpTrigger[] = view?.helpActive ?? [];
  const rows = view?.cardRows ?? {};
  const cutover = view?.ctx.cutoverMinutes ?? 0;
  useRedrawAt(
    view === null ? null : helpCardNextChange(active, rows, now, cutover),
    instantMs(now),
  );
  const help = helpCardState(active, rows, now, cutover);
  const unmarked = help.showing.filter((t) => (rows[t]?.firstShownAt ?? null) === null);

  // The first time a trigger shows, record it. Not something the owner did, so a failure is
  // silent and is tried again on a later render (item 13 design section 3.15).
  useEffect(() => {
    if (unmarked.length === 0 || marking.current) return;
    marking.current = true;
    const done = () => {
      marking.current = false;
    };
    unmarked
      .reduce<Promise<unknown>>(
        (chain, t) => chain.then(() => storage.repos.cardState.markShown(CARD, t)),
        Promise.resolve(),
      )
      .then(done, done);
  });

  if (!help.visible) return null;
  return (
    <Card label={alcohol.helpCardLabel}>
      <p data-testid="alcohol-help-card">{alcohol.helpCard}</p>
      <NoticeHelpRows />
      <Button
        variant="quiet"
        aria-expanded={whyOpen}
        aria-controls={whyId}
        onClick={() => {
          setWhyOpen((open) => !open);
        }}
      >
        {alcohol.helpCardWhyTitle}
      </Button>
      <div id={whyId} hidden={!whyOpen}>
        {whyOpen ? <p>{alcohol.helpCardWhy}</p> : null}
      </div>
      <SaveError save={save} />
      <Button
        variant="quiet"
        disabled={save.busy}
        onClick={() => {
          const showing = help.showing;
          void save
            .run(() =>
              showing.reduce<Promise<unknown>>(
                (chain, t) => chain.then(() => storage.repos.cardState.dismiss(CARD, t)),
                Promise.resolve(),
              ),
            )
            .then((ok) => {
              if (ok) onHidden?.();
            });
        }}
      >
        {alcohol.helpCardNotNow}
      </Button>
      <p className="ui-text-muted">
        {help.returns === 'next-drinking-day'
          ? alcohol.helpCardReturnsNextDay
          : alcohol.helpCardReturns}
      </p>
    </Card>
  );
}
