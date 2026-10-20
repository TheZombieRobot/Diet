import { createStore } from './store';

/**
 * A screen's own heading for the top bar and the tab title (item 20 design 3.1): the recipe page
 * sets the dish name for its own hash once the recipe is known, and clears it on unmount. Shell
 * uses it only while the hash is still the one it was set for, else the route's title.
 */
export const screenTitleStore = createStore<{
  readonly hash: string;
  readonly title: string;
} | null>(null);
