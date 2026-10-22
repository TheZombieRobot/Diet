/**
 * The week the Meal plan card shows (item 22 design 2.2; V52): null means the current week. Kept
 * in memory for the session, so Back from a day returns to the same week; nothing is stored.
 */
import type { LocalDate } from '@diet/core';
import { createStore } from '../../store';

export const planWeekStore = createStore<LocalDate | null>(null);
