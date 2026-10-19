/**
 * App-level state of the weight screens that is never stored (item 14 design sections 2.3, 2.4.4
 * and 5.5): the end latch, the in-memory "eating window" notice, the page-level status line and the
 * focus request for the stop-sign card.
 */
import type { Id, KickstartEndReason, PresetChange } from '@diet/core';
import { createStore } from '../../store';

/**
 * The end latch (W13): a period whose end was due stays latched until endPeriod succeeds or is
 * refused as already over, so reopened gates or a return to keto never resume it in this session.
 */
export const endLatchStore = createStore<ReadonlyMap<Id, KickstartEndReason>>(new Map());

export function latchEnd(periodId: Id, reason: KickstartEndReason): void {
  if (endLatchStore.get().has(periodId)) return;
  endLatchStore.set(new Map([...endLatchStore.get(), [periodId, reason]]));
}

export function clearEndLatch(periodId: Id): void {
  if (!endLatchStore.get().has(periodId)) return;
  const next = new Map(endLatchStore.get());
  next.delete(periodId);
  endLatchStore.set(next);
}

/** The stored 23:1 → 22:2 move the reconciler just made, while no other card explains it (until OK or a reload). */
export const presetMovedStore = createStore<PresetChange | null>(null);

/** The weight screens' outcome line: a polite status, or an alert for a failure. */
export interface WeightStatusMessage {
  readonly text: string;
  readonly tone: 'status' | 'alert';
  /** The records are closed in this tab: offer Reload. */
  readonly reload?: boolean;
}

export const weightStatusStore = createStore<WeightStatusMessage | null>(null);

export function reportStatus(text: string): void {
  weightStatusStore.set({ text, tone: 'status' });
}

/** Focus the stop-sign card when it next shows (after a stop-sign answer, W33). */
export const stopSignFocusStore = createStore(false);
