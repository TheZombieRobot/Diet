/**
 * Parts the planner screens share (item 22 design 2.5, 2.13, 2.17): the state card, the write
 * gate notice, a refusal with what follows it, the failure line for a thrown write, and the
 * status notice that takes focus after a write.
 */
import type { EatingWindow, LocalDate } from '@diet/core';
import { fasting, planner, privacy } from '@diet/core/copy/health';
import { ActionRow, Button, Card, Notice } from '@diet/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import type { AppStorage } from '../../db/runtime';
import { fastingHref, ROUTE_TITLES, routeHref } from '../../routes';
import { setDayWindows } from '../fasting/actions';
import { ReloadButton } from '../recipes/parts';
import type { ReasonText } from './reasonText';
import type { PlannerState } from './usePlanner';

/** "Saved." and the like after a write: it takes focus, so focus is never left on the page (2.9). */
export function StatusNotice({ text }: { readonly text: string }): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, [text]);
  return (
    <div ref={box} tabIndex={-1} className="ui-focus-target">
      <Notice tone="info" role="status">
        <p>{text}</p>
      </Notice>
    </div>
  );
}

/** A card while the planner cannot show its days: still opening, unreadable, or no dataset. */
export function PlannerStateCard({
  label,
  state,
}: {
  readonly label: string;
  readonly state: Exclude<PlannerState['status'], 'ready'>;
}): ReactElement {
  return (
    <Card label={label}>
      {state === 'not-ready' ? (
        <p className="ui-text-muted">{privacy.backupCard.notReady}</p>
      ) : (
        <Notice tone="amber" role="alert">
          <p>{state === 'data-error' ? planner.screen.dataFailed : planner.screen.readFailed}</p>
          <ReloadButton />
        </Notice>
      )}
    </Card>
  );
}

/** The write gate is closed (another tab replaced the records): values stay, nothing writes. */
export function ClosedNotice(): ReactElement {
  return (
    <Notice tone="amber" role="status">
      <p>{privacy.backupCard.closed}</p>
      <ReloadButton />
    </Notice>
  );
}

const scheduleRow = (
  <ActionRow href={routeHref('eating-schedule')} title={ROUTE_TITLES['eating-schedule']} />
);

/**
 * What follows a refusal's sentence (design 2.17, HS-18): the 5 pm snack when it fits, the widen
 * line with the eating schedule (and the pharmacist line while answer 4 applies), or the reflux
 * options. Never an instruction the owner cannot follow.
 */
export function ReasonFollowUp({
  reason,
  storage,
  date,
  snack,
  pharmacist,
  writable,
}: {
  readonly reason: ReasonText;
  readonly storage: AppStorage;
  readonly date: LocalDate;
  /** The date's 5 pm snack window when it fits now. */
  readonly snack: EatingWindow | null;
  readonly pharmacist: boolean;
  readonly writable: boolean;
}): ReactElement | null {
  switch (reason.then) {
    case 'add-snack':
      return snack === null ? null : (
        <AddSnackButton storage={storage} date={date} snack={snack} writable={writable} />
      );
    case 'widen-and-schedule':
      return (
        <>
          <p>{fasting.mealCheck.widen}</p>
          <p>{fasting.mealCheck.widenDetail}</p>
          {scheduleRow}
          {pharmacist ? <p className="ui-text-muted">{fasting.pharmacist}</p> : null}
        </>
      );
    case 'schedule':
      return scheduleRow;
    case 'reflux-options':
      return <ActionRow href={fastingHref('reflux')} title={fasting.pattern.refluxLink} />;
    case null:
      return null;
  }
}

/**
 * Item 15's "Add 5 pm snack" for a date, with item 15's own action: the snack window is the one
 * core's snackThatFits gave (its 23-hour rule already checked).
 */
export function AddSnackButton({
  storage,
  date,
  snack,
  writable,
  label = fasting.mealCheck.addSnack,
  variant = 'quiet',
}: {
  readonly storage: AppStorage;
  readonly date: LocalDate;
  readonly snack: EatingWindow;
  readonly writable: boolean;
  readonly label?: string;
  readonly variant?: 'quiet' | 'on-amber';
}): ReactElement {
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        disabled={!writable || busy}
        onClick={() => {
          setBusy(true);
          setFailure(null);
          void setDayWindows(storage, [{ date, window: snack }]).then((result) => {
            setBusy(false);
            if (!result.ok) setFailure(result.failure.message);
          });
        }}
      >
        {label}
      </Button>
      {failure === null ? null : (
        <Notice tone="amber" role="alert">
          <p>{failure}</p>
        </Notice>
      )}
    </>
  );
}
