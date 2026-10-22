/**
 * The live targets and intake (item 21 design section 5.3; T30). One clock feeds every query and
 * the engine, so the 7-day weight window, the food log, the drinks and the Kickstart state are all
 * for the same day; a new local day starts new live queries. The records are item 14's one
 * consistent read (readWeightInputs), so the targets and the weight screens decide from the same
 * rows. A failed read or engine call is a value ('error'), never an endless "still opening"; a
 * closed database keeps the last values on screen until the reload, as everywhere else.
 */
import {
  dayIntake,
  type DayIntake,
  dayTargetsFromRecords,
  type DayTargetsView,
  type DrinkLogRecord,
  type FoodLogRecord,
  type LocalDate,
  localDateOf,
  type TargetsClock,
} from '@diet/core';
import { useMemo } from 'react';
import { StorageClosedError } from '../../db/errors';
import type { WriteGate } from '../../db/gate';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { useStore } from '../../store';
import { useNow } from '../../useNow';
import { preStartStopSignStore } from '../weight/preStartCheck';
import { endLatchStore } from '../weight/stores';
import { readWeightInputs, type WeightInputs } from '../weight/useWeightView';

/** A read's result, so an error reaches the screen instead of being swallowed by the live query. */
type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

const isClosedDatabaseError = (error: unknown): boolean =>
  error instanceof StorageClosedError ||
  (typeof error === 'object' && error !== null && 'name' in error
    ? error.name === 'DatabaseClosedError'
    : false);

/** Runs `read`; a closed database still throws, so the live query keeps its last value. */
async function asRead<T>(read: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    if (isClosedDatabaseError(error)) throw error;
    return { ok: false };
  }
}

/**
 * The one clock of a screen: the instant, its local date and the device zone, with the end latch
 * and this page's hold of a pre-start stop-sign "yes" (no deficit for the rest of that day).
 */
export function useTargetsClock(storage: AppStorage): TargetsClock {
  const at = useNow(storage.env);
  const deviceZone = storage.env.timeZone();
  const endsPending = useStore(endLatchStore);
  const preStartHeld = useStore(preStartStopSignStore);
  return useMemo(
    () => ({ at, today: localDateOf(at, deviceZone), deviceZone, endsPending, preStartHeld }),
    [at, deviceZone, endsPending, preStartHeld],
  );
}

export type DayTargetsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly records: WeightInputs; readonly view: DayTargetsView };

const readTargetRecords = (storage: AppStorage): Promise<Read<WeightInputs>> =>
  asRead(() => readWeightInputs(storage));

/** The day's targets, live: a weigh-in, a readiness change or a saved target re-renders at once (RD-06). */
export function useDayTargets(storage: AppStorage, clock: TargetsClock): DayTargetsState {
  const read = useLiveQuery(storage, readTargetRecords);
  return useMemo((): DayTargetsState => {
    if (read === undefined) return { status: 'loading' };
    if (!read.ok) return { status: 'error' };
    try {
      return {
        status: 'ready',
        records: read.value,
        view: dayTargetsFromRecords(read.value, clock),
      };
    } catch {
      return { status: 'error' };
    }
  }, [read, clock]);
}

interface DaySource {
  readonly gate: WriteGate;
  readonly storage: AppStorage;
  readonly today: LocalDate;
}

interface DayRows {
  readonly food: FoodLogRecord[];
  readonly drinks: DrinkLogRecord[];
}

const readDayRows = (source: DaySource): Promise<Read<DayRows>> =>
  asRead(async () => {
    const [food, drinks] = await Promise.all([
      source.storage.repos.foodLog.forLocalDate(source.today),
      source.storage.repos.drinks.forLocalDates(source.today, source.today),
    ]);
    return { food, drinks };
  });

export type DayIntakeState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly intake: DayIntake;
      /** The day's food entries, in time order. */
      readonly entries: readonly FoodLogRecord[];
    };

/**
 * The calendar day's food and drinks (T16), live. Drinks are read only to show alcohol energy as
 * its own part; no check reads them (C11).
 */
export function useDayIntake(storage: AppStorage, today: LocalDate): DayIntakeState {
  const source = useMemo(() => ({ gate: storage.gate, storage, today }), [storage, today]);
  const read = useLiveQuery(source, readDayRows);
  return useMemo((): DayIntakeState => {
    if (read === undefined) return { status: 'loading' };
    if (!read.ok) return { status: 'error' };
    try {
      return {
        status: 'ready',
        intake: dayIntake(read.value.food, read.value.drinks),
        entries: read.value.food,
      };
    } catch {
      return { status: 'error' };
    }
  }, [read]);
}
