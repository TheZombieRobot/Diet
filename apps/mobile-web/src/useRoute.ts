import { useSyncExternalStore } from 'react';
import { parseRoute, routeDetail, type RouteId } from './routes';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

const currentHash = (): string => window.location.hash;

/** The current screen, from the location hash; re-renders when the hash changes. */
export function useRoute(): RouteId {
  return parseRoute(useLocationHash());
}

/** The whole location hash ('#/move-session/a/finish'); re-renders when it changes. */
export function useLocationHash(): string {
  return useSyncExternalStore(subscribe, currentHash, () => '');
}

/** Item 19: the second segment of the hash ('harvest' in #/garden/harvest); re-renders when it changes. */
export function useRouteDetail(): string | null {
  return routeDetail(useSyncExternalStore(subscribe, currentHash, () => ''));
}
