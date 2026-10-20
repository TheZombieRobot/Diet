/**
 * The ratings and note typed on a finish card and not saved yet, by session row (item 27 design
 * section 1.10; item 27 review). They live in this page's memory, outside the card, so "Back to the
 * session", midnight passing (the card becomes the finish-only one), Android Back and coming back
 * to the session all keep them. Nothing is kept in web storage: a note can hold health details.
 * A draft is dropped after its Save, and delete-all clears them all (db/runtime.ts).
 */
import type { FinishValues, Id } from '@diet/core';
import { createStore } from '../../store';

export const finishDraftStore = createStore<Readonly<Record<Id, FinishValues>>>({});

export function setFinishDraft(rowId: Id, values: FinishValues): void {
  finishDraftStore.set({ ...finishDraftStore.get(), [rowId]: values });
}

export function dropFinishDraft(rowId: Id): void {
  finishDraftStore.set(
    Object.fromEntries(Object.entries(finishDraftStore.get()).filter(([id]) => id !== rowId)),
  );
}
