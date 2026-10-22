import { type ComponentType, lazy, type LazyExoticComponent } from 'react';
import { ScreenLoadFailed } from './ScreenLoading';

/**
 * A screen whose code, with any data only it reads, is a chunk of its own, fetched when the screen
 * first opens and kept (code split). Every chunk is in the offline copy, so this works offline too.
 * Until it arrives the shell shows ScreenLoading; if it cannot be fetched, ScreenLoadFailed takes
 * its place. Today, setup, About and the help numbers are never lazy: they open at once.
 */
export function lazyScreen<K extends string, M extends Readonly<Record<K, ComponentType>>>(
  load: () => Promise<M>,
  name: K,
): LazyExoticComponent<ComponentType> {
  return lazy<ComponentType>(() =>
    load().then(
      (module) => ({ default: module[name] }),
      () => ({ default: ScreenLoadFailed }),
    ),
  );
}
