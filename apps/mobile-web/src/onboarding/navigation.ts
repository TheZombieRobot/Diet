/** Where the flow sends the page when setup ends or a restore reloads (item 13 design 3.1, 3.10). */
import { routeHref } from '../routes';
import { leaveFlow } from './useFlowHistory';

/** Set when setup has just ended in this page, so the shell's first screen takes focus. */
let arrivedFromSetup = false;

/**
 * Leaves setup for Today: the shell opens on Today on the one history entry the app had before
 * setup, so a single back gesture then leaves the app (E59), and Today's heading takes focus.
 */
export function openToday(): void {
  arrivedFromSetup = true;
  leaveFlow(routeHref('today'));
}

/** True once, on the shell's first screen after setup ended in this page. */
export function takeArrivedFromSetup(): boolean {
  const arrived = arrivedFromSetup;
  arrivedFromSetup = false;
  return arrived;
}

/** After a restore from setup the app opens on the restored answers, so they are checked first (E64). */
export function restoreReloadTarget(location: Pick<Location, 'pathname' | 'search'>): string {
  return `${location.pathname}${location.search}${routeHref('readiness')}`;
}
