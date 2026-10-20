import { useSyncExternalStore } from 'react';
import { parseRoute, type RouteId } from './routes';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

const currentHash = (): string => window.location.hash;

/** The current screen, from the location hash; re-renders when the hash changes. */
export function useRoute(): RouteId {
  return parseRoute(useSyncExternalStore(subscribe, currentHash, () => ''));
}

/** Item 20: the whole location hash ('#/recipe/…?my=2'); re-renders when it changes. */
export function useHash(): string {
  return useSyncExternalStore(subscribe, currentHash, () => '');
}
