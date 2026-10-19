/** The Log weight request from elsewhere on Today (item 16's quick action calls openWeightEntry). */
import { createStore } from '../../store';

/** Requests to open Today's Log weight panel (item 16's "+" uses openWeightEntry). */
export const weightEntryRequestStore = createStore(0);

/** Opens the Log weight panel on Today's Weight card, focuses the field and scrolls it into view. */
export function openWeightEntry(): void {
  weightEntryRequestStore.set(weightEntryRequestStore.get() + 1);
}
