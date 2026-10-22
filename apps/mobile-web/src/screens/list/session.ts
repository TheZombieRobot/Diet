/**
 * The skipped-meals notice of the List (item 24 design 1.6a): kept for this session only, until
 * the owner dismisses it, the list is built again or the app reloads.
 */
import type { Id } from '@diet/core';
import { createStore } from '../../store';

export const listSessionStore = createStore<{ readonly listId: Id; readonly count: number } | null>(
  null,
);
