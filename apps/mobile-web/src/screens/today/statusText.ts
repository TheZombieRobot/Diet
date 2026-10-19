/**
 * Today's top line in words (item 16 design section 1.2), from item 15's fasting.status strings,
 * its over-24-hours sentence and its widen line. The clock times read from the real instant in the
 * device zone, as on the Fast card.
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

function windowText(window: Exclude<StatusWindow, { kind: 'widen' }>, zone: TimeZone): string {
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
      const rest = window.kind === 'widen' ? fasting.mealCheck.widen : windowText(window, zone);
      return `${fastingFor(today.elapsedMinutes)} ${rest}`;
    }
    case 'not-fasting':
      return windowText(today.window, zone);
  }
}
