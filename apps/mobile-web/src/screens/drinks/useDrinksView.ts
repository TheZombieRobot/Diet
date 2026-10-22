/**
 * The live drinks picture (item 28 design 3.8), shared by the Drinks screen, the Today Drinks card
 * and the Talk to someone card, so the three always agree. The clock is item 16's useNow, so
 * "today" (the current drinking day, A33) rolls over at the cut-over without a reload; the read is
 * rebuilt only when the day range moves. While a new range is read, and after a later read fails,
 * the last good records stay on screen, as on Today.
 */
import {
  addDays,
  DEFAULT_HOME_TIME_ZONE,
  DRINKING_DAY_CUTOVER_MINUTES,
  drinkingDayOf,
  type LocalDate,
  localDateOf,
  resolveZone,
  weekStartOf,
} from '@diet/core';
import { useMemo, useState } from 'react';
import { type LiveQueryState, useLiveQueryState } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { useReadinessGates } from '../../onboarding/state';
import { useNow } from '../../useNow';
import { type DrinksData, type DrinksSource, loadDrinksData } from './load';
import { buildDrinksView, type DrinksView } from './view';

export type DrinksState =
  | { readonly kind: 'opening' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly view: DrinksView };

/** Display weeks (8) plus the 3 before them that the 4-week average needs. */
const WEEKS_READ = 11;

/** The live read of one range of drinking days; rebuilt only when the range moves. */
function useDrinksRead(
  storage: AppStorage,
  from: LocalDate,
  to: LocalDate,
): LiveQueryState<DrinksData> {
  const source = useMemo<DrinksSource>(
    () => ({ gate: storage.gate, storage, from, to }),
    [storage, from, to],
  );
  return useLiveQueryState(source, loadDrinksData);
}

export function useDrinksView(storage: AppStorage): DrinksState {
  const now = useNow(storage.env);
  const deviceZone = resolveZone(storage.env.timeZone(), DEFAULT_HOME_TIME_ZONE).timeZone;
  const gateView = useReadinessGates(storage);
  // The cut-over from item 13's live settings read, so the range moves with the setting.
  const cutover =
    gateView?.state.settings.drinkingDayCutoverMinutes ?? DRINKING_DAY_CUTOVER_MINUTES.default;
  const range = drinkingDayOf(now, deviceZone, cutover);
  const from = addDays(weekStartOf(range), 7 - 7 * WEEKS_READ);
  const read = useDrinksRead(storage, from, range);
  const [last, setLast] = useState<DrinksData | null>(null);
  if (read.status === 'ready' && read.value !== last) setLast(read.value);
  const data = read.status === 'ready' ? read.value : last;
  if (data === null || gateView === undefined) {
    return read.status === 'error' ? { kind: 'failed' } : { kind: 'opening' };
  }
  const view = buildDrinksView(data, gateView.gates, {
    now,
    deviceZone,
    // The records' own cut-over: a changed setting moves "today" at once.
    today: drinkingDayOf(now, deviceZone, data.settings.drinkingDayCutoverMinutes),
    noteToday: localDateOf(now, deviceZone),
  });
  return { kind: 'ready', view };
}
