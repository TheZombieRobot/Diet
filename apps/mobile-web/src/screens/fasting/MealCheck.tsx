import { addDays, type EatingWindow, fillTemplate, formatClockRange } from '@diet/core';
import { fasting } from '@diet/core/copy/health';
import { BowlIcon, Button, ButtonRow, Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import type { AppStorage } from '../../db/runtime';
import { clearDayWindow, dismissSnack, setDayWindows } from './actions';
import { headlineText } from './fastingText';
import { ActionError } from './ActionError';
import { useAction } from './useAction';
import type { MealCheckView } from './view';

const copy = fasting.mealCheck;

/**
 * One date's meal check on the Fast card (item 15 design 3.7; FL-10, FL-12, FL-13, HS-18, C62):
 * the decision table's kind, as the view worked it out. Every offer and after-window line says it
 * is fine to eat or widen the window, the widen line stays whenever the check fails, and nothing
 * here talks of a broken fast or a streak. The amber button styles are only inside the amber
 * notice, so the card keeps one teal primary action.
 */
export function MealCheck({
  storage,
  check,
  proteinTargetG,
}: {
  readonly storage: AppStorage;
  readonly check: MealCheckView;
  readonly proteinTargetG: number;
}): ReactElement | null {
  const action = useAction();
  const { kind, day, date, snack, headline, reasons } = check;
  if (kind === 'hidden') return null;

  const addSnack = (on: string, window: EatingWindow) => {
    void action.run(() => setDayWindows(storage, [{ date: on, window }]));
  };
  const undo = () => {
    void action.run(() => clearDayWindow(storage, date));
  };
  const snackAdded =
    snack.added === null ? null : (
      <p>
        {fillTemplate(copy.snackAdded[day], {
          range: formatClockRange(snack.added.start, snack.added.end),
        })}{' '}
        {check.undoSnackAllowed ? (
          <Button variant="quiet" disabled={action.busy} onClick={undo}>
            {copy.undo}
          </Button>
        ) : null}
      </p>
    );
  const energyLine = check.energyChecked ? null : (
    <p className="ui-text-muted">{copy.energyUnavailable}</p>
  );

  if (kind === 'after') {
    const tomorrow = check.tomorrowSnack;
    const uncheckedOnly = reasons.every((r) => r === 'energy-unknown');
    const line = check.refluxDay
      ? uncheckedOnly
        ? copy.afterWindowUncheckedReflux
        : copy.afterWindowReflux
      : uncheckedOnly
        ? copy.afterWindowUnchecked
        : copy.afterWindow;
    return (
      <div data-testid="meal-check-after">
        <Notice tone="info">
          <p>{line}</p>
          {tomorrow === null ? null : <p>{copy.afterWindowTomorrow}</p>}
        </Notice>
        {tomorrow === null ? null : (
          <Button
            variant="secondary"
            disabled={action.busy}
            onClick={() => {
              addSnack(addDays(date, 1), tomorrow);
            }}
          >
            {copy.addSnackTomorrow}
          </Button>
        )}
        <ActionError action={action} />
      </div>
    );
  }

  if (kind === 'offer') {
    // Without a headline, protein and energy share the one "plan comes in under" line.
    const planShort =
      headline === null && (reasons.includes('protein') || reasons.includes('energy'));
    const fits = snack.fits;
    return (
      <div data-testid="meal-check">
        <Notice
          icon={<BowlIcon />}
          actions={
            fits === null ? undefined : (
              <ButtonRow>
                <Button
                  variant="on-amber"
                  disabled={action.busy}
                  onClick={() => {
                    addSnack(date, fits);
                  }}
                >
                  {copy.addSnack}
                </Button>
                <Button
                  variant="on-amber-outline"
                  disabled={action.busy}
                  onClick={() => {
                    void action.run(() => dismissSnack(storage, date));
                  }}
                >
                  {copy.notNow}
                </Button>
              </ButtonRow>
            )
          }
        >
          {headline === null ? null : (
            <p className="ui-text-strong">{headlineText(headline, day)}</p>
          )}
          {headline !== null && reasons.includes('protein') ? (
            <p>{fillTemplate(copy.proteinShort, { target: proteinTargetG })}</p>
          ) : null}
          {headline !== null && reasons.includes('energy') ? <p>{copy.energyShort}</p> : null}
          {planShort ? <p>{copy.planShort[day]}</p> : null}
          {reasons.includes('portion') ? <p>{copy.portionLarge}</p> : null}
          {snackAdded}
          {fits === null ? (
            <>
              <p>{copy.widen}</p>
              <p>{copy.widenDetail}</p>
            </>
          ) : (
            <p>{copy.offerSnack}</p>
          )}
          {energyLine}
        </Notice>
        <ActionError action={action} />
      </div>
    );
  }

  const fits = snack.fits;
  const quietAdd =
    fits === null ? null : (
      <Button
        variant={kind === 'offer-collapsed' ? 'quiet' : 'secondary'}
        disabled={action.busy}
        onClick={() => {
          addSnack(date, fits);
        }}
      >
        {copy.addSnack}
      </Button>
    );
  return (
    <div data-testid="meal-check">
      {kind === 'offer-collapsed' ? <p className="ui-text-muted">{copy.widen}</p> : null}
      {kind === 'ok' && headline !== null ? <p>{headlineText(headline, day)}</p> : null}
      {kind === 'one-meal-unavailable' ? (
        <p className="ui-text-muted">{copy.unavailableOneMeal}</p>
      ) : null}
      {snackAdded}
      {kind === 'offer-collapsed' || kind === 'one-meal-unavailable' ? quietAdd : null}
      {kind === 'offer-collapsed' || kind === 'ok' ? energyLine : null}
      <ActionError action={action} />
    </div>
  );
}
