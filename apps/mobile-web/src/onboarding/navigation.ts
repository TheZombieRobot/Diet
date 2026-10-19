/** Where the flow sends the page when setup ends or a restore reloads (item 13 design 3.1, 3.10). */
import { routeHref } from '../routes';

/** Leaves setup for Today: the shell opens on Today, replacing the flow's history entry. */
export function openToday(): void {
  window.location.replace(routeHref('today'));
}

/** After a restore from setup the app opens on the restored answers, so they are checked first (E64). */
export function restoreReloadTarget(location: Pick<Location, 'pathname' | 'search'>): string {
  return `${location.pathname}${location.search}${routeHref('readiness')}`;
}
