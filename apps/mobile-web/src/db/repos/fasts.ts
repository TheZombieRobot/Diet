/**
 * Fasts (storage spec sections 4.6, 5 rule 3 and 8.2; HS-02, C30, D47). The generic repository
 * (get, list, update of times and note, remove), plus start, end and the running fast.
 *
 * start() refuses while a fast is running. It copies the planned length only when it is a whole
 * number of minutes from 1 to 1440 and otherwise stores null; it never fails because of it (the
 * New Zealand autumn night legitimately gives 1470). There is no maximum fast length: logging
 * must stay honest.
 */
import {
  type ClockTime,
  type FastRecord,
  MAX_PLANNED_FAST_MINUTES,
  StorageInvariantError,
} from '@diet/core';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext, storesViolation } from './context';
import { type CrudRepo, crudRepo } from './crud';

export interface StartFastInput {
  readonly plannedFastMinutes?: number | null;
  readonly snackTime?: ClockTime | null;
  readonly dinnerTime?: ClockTime | null;
  readonly note?: string | null;
}

export interface FastsRepo extends Omit<CrudRepo<'fasts'>, 'create'> {
  readonly start: (input?: StartFastInput) => Promise<FastRecord>;
  readonly end: (id: string) => Promise<FastRecord>;
  /** The running fast (only the latest fast can be running), or undefined. */
  readonly running: () => Promise<FastRecord | undefined>;
}

/** The planned figure when it is storable (1–1440 whole minutes), else null (D47). */
export function storablePlannedMinutes(minutes: number | null | undefined): number | null {
  return typeof minutes === 'number' &&
    Number.isInteger(minutes) &&
    minutes >= 1 &&
    minutes <= MAX_PLANNED_FAST_MINUTES
    ? minutes
    : null;
}

export function fastsRepo(ctx: RepoContext): FastsRepo {
  const { db, env } = ctx;
  const crud = crudRepo(ctx, 'fasts');
  return {
    get: crud.get,
    list: crud.list,
    listByIndex: crud.listByIndex,
    update: crud.update,
    remove: crud.remove,
    start: (input = {}) =>
      guardedWrite(ctx, () => {
        const row = prepare(
          'fasts',
          {
            id: env.randomId(),
            startedAt: env.now(),
            timeZone: env.timeZone(),
            endedAt: null,
            endedTimeZone: null,
            plannedFastMinutes: storablePlannedMinutes(input.plannedFastMinutes),
            snackTime: input.snackTime ?? null,
            dinnerTime: input.dinnerTime ?? null,
            note: input.note ?? null,
          },
          env,
        );
        return db.transaction('rw', ['fasts'], () =>
          db.fasts
            .toArray()
            .then((fasts) => {
              if (fasts.some((f) => f.endedAt === null)) {
                throw new StorageInvariantError('fast-running');
              }
              const rule = storesViolation({ fasts: [...fasts, row] });
              if (rule !== null) throw new StorageInvariantError(rule);
              return db.fasts.add(row);
            })
            .then(() => row),
        );
      }),
    end: (id) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['fasts'], () =>
          db.fasts.get(id).then((stored) => {
            if (stored === undefined) throw new StorageRuleError('fasts', 'not-found');
            if (stored.endedAt !== null) throw new StorageRuleError('fasts', 'already-ended');
            const row = prepare(
              'fasts',
              { ...stored, endedAt: env.now(), endedTimeZone: env.timeZone() },
              env,
              stored,
            );
            return db.fasts.put(row).then(() => row);
          }),
        ),
      ),
    running: async () => {
      const latest = await db.fasts.orderBy('startedAt').last();
      return latest?.endedAt === null ? latest : undefined;
    },
  };
}
