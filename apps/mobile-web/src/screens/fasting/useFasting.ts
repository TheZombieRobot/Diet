/**
 * The live fasting picture for the Fast card and the Fasting screen (item 15 design 3.10): the
 * records in one live query built per local date (so its ranges move at midnight), item 13's live
 * gates, item 14's end latch and the clock every 15 seconds and on return to the app. Everything
 * is recomputed from stored instants at each render; the timer is never an in-memory counter
 * (FS-03).
 */
import { type Instant, localDateOf, type LocalDate, type TimeZone } from '@diet/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { type ReadinessGateView, useReadinessGates } from '../../onboarding/state';
import { useStore } from '../../store';
import { useNow } from '../../useNow';
import { loadPreStartStopSign, preStartStopSignStore } from '../weight/preStartCheck';
import { endLatchStore } from '../weight/stores';
import { type FastingInputs, readFastingInputs } from './inputs';
import { fastingContext } from './integration';
import { type FastingContext, type FastingView, fastingView } from './view';

/** The clock refresh of the fasting screens (F16): minute resolution, never more than 15 s late. */
export const FASTING_TICK_MS = 15_000;

export interface FastingState {
  readonly inputs: FastingInputs;
  readonly context: FastingContext;
  readonly view: FastingView;
  readonly gateView: ReadinessGateView;
  readonly now: Instant;
  readonly nowMs: number;
  readonly today: LocalDate;
  readonly deviceTimeZone: TimeZone;
}

export type FastingRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | ({ readonly kind: 'ready' } & FastingState);

export function useFasting(storage: AppStorage): FastingRead {
  const now = useNow(storage.env, FASTING_TICK_MS);
  const deviceTimeZone = storage.env.timeZone();
  const today = localDateOf(now, deviceTimeZone);
  const query = useCallback((s: AppStorage) => readFastingInputs(s, today), [today]);
  const fresh = useLiveQuery(storage, query);
  // At midnight the query for the new date starts empty: keep the last result until it arrives,
  // so the card does not disappear for a moment.
  const [last, setLast] = useState(fresh);
  if (fresh !== undefined && fresh !== last) setLast(fresh);
  const read = fresh ?? last;
  const gateView = useReadinessGates(storage);
  const endsPending = useStore(endLatchStore);
  // Item 14's pre-start stop-sign "yes", held for the day: no fast is timed to a window (F20).
  const preStartStopSignDate = useStore(preStartStopSignStore);
  useEffect(() => {
    loadPreStartStopSign(storage.platform);
  }, [storage]);
  return useMemo((): FastingRead => {
    if (read !== undefined && !read.ok) return { kind: 'error' };
    if (read === undefined || gateView === undefined) return { kind: 'loading' };
    const context = fastingContext({
      inputs: read.inputs,
      gateInput: gateView.input,
      gates: gateView.gates,
      now,
      deviceTimeZone,
      endsPending,
      preStartStopSignDate,
    });
    const nowMs = Date.parse(now);
    return {
      kind: 'ready',
      inputs: read.inputs,
      context,
      view: fastingView(read.inputs, context, nowMs, deviceTimeZone),
      gateView,
      now,
      nowMs,
      today: read.inputs.today,
      deviceTimeZone,
    };
  }, [read, gateView, now, deviceTimeZone, endsPending, preStartStopSignDate]);
}
