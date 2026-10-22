/**
 * The day's water guide for Today's Water card and the food log (item 23 design 1.6; cross-item
 * rulings 12 and 24; item 21 T25, T26): item 21's water guide plus item 27's heat water for the
 * date, and item 27's electrolyte lines when the heat adds water. Null while the targets or the
 * sessions load, or after either failed: the card then works as before, with no guide.
 */
import {
  type LocalDate,
  type SessionRecord,
  type TargetsClock,
  type WaterGuideView,
  waterGuideView,
} from '@diet/core';
import { useCallback, useMemo } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { useDayTargets } from '../targets/useDayTargets';
import { heatElectrolyteLinesFor, heatExtraMlFor } from './integration';

export interface WaterGuide extends WaterGuideView {
  /** Item 27's electrolyte lines, shown under the heat line (empty with no heat water). */
  readonly heatLines: readonly string[];
}

type SessionsRead = { readonly ok: true; readonly rows: SessionRecord[] } | { readonly ok: false };

export function useWaterGuide(
  storage: AppStorage,
  clock: TargetsClock,
  date: LocalDate,
): WaterGuide | null {
  const targets = useDayTargets(storage, clock);
  const query = useCallback(
    async (s: AppStorage): Promise<SessionsRead> => {
      try {
        return { ok: true, rows: await s.repos.sessions.listByIndex('date', date, date) };
      } catch {
        return { ok: false };
      }
    },
    [date],
  );
  const sessions = useLiveQuery(storage, query);
  return useMemo(() => {
    if (targets.status !== 'ready' || sessions === undefined || !sessions.ok) return null;
    const { records, view } = targets;
    const extra = heatExtraMlFor(date, sessions.rows, records.profile);
    const shown = waterGuideView(view.targets.water, extra, view.display);
    return {
      ...shown,
      heatLines:
        shown.guide !== null && shown.guide.heatExtraMl > 0
          ? heatElectrolyteLinesFor(records.profile.dietMode, view.gates)
          : [],
    };
  }, [targets, sessions, date]);
}
