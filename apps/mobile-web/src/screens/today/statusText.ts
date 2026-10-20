/**
 * Today's top line in words (item 16 design section 1.2), from item 15's fasting.status strings,
 * its over-24-hours sentence, its widen line and the Fast card's "fine to eat now" lines. The clock
 * times read from the real instant in the device zone, as on the Fast card.
 */
import {
  fillTemplate,
  formatElapsed,
  instantMs,
  type StatusWindow,
  type TimeZone,
  type TodayStatus,
} from '@diet/core';
import { fasting } from '@diet/core/copy/health';
import { clockAt } from '../fasting/fastingText';

const status = fasting.status;

function windowText(window: StatusWindow, zone: TimeZone): string {
  // No time past a running fast's 24-hour point: the Fast card's own words (item 15).
  if (window.kind === 'widen') return fasting.mealCheck.widen;
  if (window.kind === 'eat-now') return fasting.card.fineToEat;
  if (window.kind === 'open-now') return fasting.card.windowOpen;
  const time = clockAt(instantMs(window.at), zone);
  switch (window.kind) {
    case 'open-until':
      return fillTemplate(status.windowOpenUntil, { time });
    case 'snack-opens':
      return fillTemplate(status.snackOpens, { time });
    case 'opens-today':
      return fillTemplate(status.windowOpens, { time });
    case 'opens-tomorrow':
      return fillTemplate(status.windowOpensTomorrow, { time });
  }
}

const fastingFor = (minutes: number): string =>
  fillTemplate(status.fasting, { duration: formatElapsed(minutes * 60_000, 'text') });

/** The line, or null when there is none (no fast running, and fasting off or no pattern). */
export function statusText(today: TodayStatus, zone: TimeZone): string | null {
  switch (today.kind) {
    case 'none':
      return null;
    case 'over-ceiling':
      return `${fastingFor(today.elapsedMinutes)} ${fasting.card.overCeiling}`;
    case 'open-while-off':
      return fillTemplate(status.openWhileOff, {
        duration: formatElapsed(today.elapsedMinutes * 60_000, 'text'),
      });
    case 'fasting': {
      const { window } = today;
      if (window === null) return fastingFor(today.elapsedMinutes);
      return `${fastingFor(today.elapsedMinutes)} ${windowText(window, zone)}`;
    }
    case 'not-fasting':
      return windowText(today.window, zone);
  }
}
