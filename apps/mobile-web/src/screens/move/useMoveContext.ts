/**
 * What every Move view reads (item 27 design section 1.2): the gates, the Move records in one
 * live query, item 14's pre-start answer and the dataset, put together by core moveContext.
 * RD-05 is decided before anything else is waited on or can fail, so the gate's reason always
 * shows while readiness answer 6 is open.
 */
import {
  type CardStateRecord,
  type ExerciseData,
  localDateOf,
  type MoveContext,
  moveContext,
  type MoveRecords,
  preStartStopSignDay,
  type ReadinessGates,
} from '@diet/core';
import { useMemo } from 'react';
import type { WriteGate } from '../../db/gate';
import { useLiveQueryState } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { useReadinessGateRead } from '../../onboarding/state';
import { useStore } from '../../store';
import { useNow } from '../../useNow';
import { preStartStopSignStore } from '../weight/preStartCheck';
import { exerciseDataOrNull } from './exerciseData';

export type MoveRead =
  | { readonly status: 'pending' }
  | { readonly status: 'read-error' }
  | { readonly status: 'blocked'; readonly gates: ReadinessGates }
  | { readonly status: 'data-error' }
  | { readonly status: 'ready'; readonly data: ExerciseData; readonly ctx: MoveContext };

interface MoveSource {
  readonly gate: WriteGate;
  readonly storage: AppStorage;
}

type StoredMoveRecords = Omit<MoveRecords, 'preStartStopSignDay'> & {
  /** The card_state rows, for item 14's pre-start "yes" (core weight/preStart.ts). */
  readonly cardStates: readonly CardStateRecord[];
};

/**
 * The Move records in one live query: every session row, the fasts, the stop-sign checks and the
 * card_state rows that hold a pre-start "yes".
 */
async function readMoveRecords({ storage }: MoveSource): Promise<StoredMoveRecords> {
  const { repos } = storage;
  const [profile, settings, sessions, fasts, kickstartChecks, cardStates] = await Promise.all([
    repos.profile.get(),
    repos.settings.get(),
    repos.sessions.list(),
    repos.fasts.list(),
    repos.kickstart.listChecks(),
    storage.db.card_state.toArray(),
  ]);
  return {
    profile,
    weeklyPattern: settings.weeklyPattern,
    sessions,
    fasts,
    kickstartChecks,
    cardStates,
  };
}

export function useMoveContext(storage: AppStorage): MoveRead {
  const now = useNow(storage.env);
  const today = localDateOf(now, storage.env.timeZone());
  const gateRead = useReadinessGateRead(storage);
  const source = useMemo<MoveSource>(() => ({ gate: storage.gate, storage }), [storage]);
  const records = useLiveQueryState(source, readMoveRecords);
  const preStartHeld = useStore(preStartStopSignStore);

  if (gateRead.status === 'pending') return { status: 'pending' };
  if (gateRead.status === 'error') return { status: 'read-error' };
  const { gates } = gateRead.view;
  // Compared as unknown: only exactly true opens exercise plans (C41; RD-05).
  if ((gates.exercisePlansAvailable as unknown) !== true) return { status: 'blocked', gates };
  if (records.status === 'pending') return { status: 'pending' };
  if (records.status === 'error') return { status: 'read-error' };
  const data = exerciseDataOrNull();
  if (data === null) return { status: 'data-error' };
  const clock = { today, now };
  // Item 14's pre-start "yes": its record, or this page's hold until the record is written.
  const preStart = preStartStopSignDay(records.value.cardStates, preStartHeld, clock);
  const ctx = moveContext(data, { ...records.value, preStartStopSignDay: preStart }, gates, clock);
  return { status: 'ready', data, ctx };
}
