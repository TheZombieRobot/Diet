/**
 * Fasts (storage spec sections 4.6, 5 rule 3 and 8.2; HS-02, C30, D47; item 15). The generic
 * repository (get, list, remove), plus start, end, undoEnd, an update of times and note, and the
 * running fast.
 *
 * start() refuses while a fast is running. It copies the planned length only when it is a whole
 * number of minutes from 1 to 1440 and otherwise stores null; it never fails because of it (the
 * New Zealand autumn night legitimately gives 1470). There is no maximum fast length: logging
 * must stay honest.
 *
 * Only undoEnd() reopens an ended fast: the latest one, within UNDO_END_WINDOW_MS of its end. An
 * update never reopens one ('reopen') and never sets a time later than now ('future-time').
 *
 * start() and undoEnd() refuse while fasting is switched off ('fasting-gated'; FS-08, HS-03). The
 * gate is worked out inside the same transaction from the stored answers, profile and weigh-ins,
 * with the rule every screen uses (core weightGateInput, then readinessGates), so a tab that has
 * not re-rendered since an answer changed cannot start a fast. Ending one is never refused.
 */
import {
  type ClockTime,
  type FastRecord,
  instantMs,
  localDateOf,
  MAX_PLANNED_FAST_MINUTES,
  type ProfileRecord,
  type ReadinessRecord,
  readinessGates,
  type SettingsRecord,
  StorageInvariantError,
  weightGateInput,
  type WeightRecord,
} from '@diet/core';
import Dexie from 'dexie';
import type { StorageEnv } from '../env';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext, storesViolation } from './context';
import { assertOp, type CrudRepo, crudRepo, stampUpdate, type UpdatePatch } from './crud';

/**
 * How long after its end a fast can still be reopened by Undo. The card hides Undo 60 seconds
 * after the stored end; this limit covers a view that has not re-rendered.
 */
export const UNDO_END_WINDOW_MS = 5 * 60_000;

export interface StartFastInput {
  readonly plannedFastMinutes?: number | null;
  readonly snackTime?: ClockTime | null;
  readonly dinnerTime?: ClockTime | null;
  readonly note?: string | null;
}

export interface FastsRepo extends Omit<CrudRepo<'fasts'>, 'create'> {
  readonly start: (input?: StartFastInput) => Promise<FastRecord>;
  readonly end: (id: string) => Promise<FastRecord>;
  /** Reopens the latest fast, ended at most UNDO_END_WINDOW_MS ago. */
  readonly undoEnd: (id: string) => Promise<FastRecord>;
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

/** Throws unless the fasts a write would leave keep section 5 rule 3 (one running, no overlap). */
function checkFasts(fasts: readonly FastRecord[]): void {
  const rule = storesViolation({ fasts: [...fasts] });
  if (rule !== null) throw new StorageInvariantError(rule);
}

/** The stores a fast start or reopen reads besides `fasts`, for the readiness gate. */
const GATE_STORES = ['readiness', 'profile', 'weights', 'settings'] as const;

/** Throws 'fasting-gated' when the stored records switch fasting off today (the device's date). */
function refuseWhileGated(
  env: StorageEnv,
  readiness: readonly ReadinessRecord[],
  profile: ProfileRecord | undefined,
  weights: readonly WeightRecord[],
  settings: SettingsRecord | undefined,
): void {
  if (profile === undefined || settings === undefined) {
    throw new StorageRuleError('profile', 'not-found');
  }
  const input = weightGateInput(
    { readiness, profile, weights, homeTimeZone: settings.homeTimeZone },
    localDateOf(env.now(), env.timeZone()),
  );
  if (readinessGates(input).fastingGated) throw new StorageRuleError('fasts', 'fasting-gated');
}

export function fastsRepo(ctx: RepoContext): FastsRepo {
  const { db, env } = ctx;
  const crud = crudRepo(ctx, 'fasts');
  const laterThanNow = (at: string | null | undefined): boolean =>
    typeof at === 'string' && instantMs(at) > instantMs(env.now());
  return {
    get: crud.get,
    list: crud.list,
    listByIndex: crud.listByIndex,
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
        return db.transaction('rw', ['fasts', ...GATE_STORES], () =>
          Dexie.Promise.all([
            db.fasts.toArray(),
            db.readiness.toArray(),
            db.profile.get('singleton'),
            db.weights.toArray(),
            db.settings.get('singleton'),
          ])
            .then(([fasts, readiness, profile, weights, settings]) => {
              refuseWhileGated(env, readiness, profile, weights, settings);
              if (fasts.some((f) => f.endedAt === null)) {
                throw new StorageInvariantError('fast-running');
              }
              checkFasts([...fasts, row]);
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
    undoEnd: (id) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['fasts', ...GATE_STORES], () =>
          Dexie.Promise.all([
            db.fasts.toArray(),
            db.readiness.toArray(),
            db.profile.get('singleton'),
            db.weights.toArray(),
            db.settings.get('singleton'),
          ]).then(([fasts, readiness, profile, weights, settings]) => {
            const stored = fasts.find((f) => f.id === id);
            if (stored === undefined) throw new StorageRuleError('fasts', 'not-found');
            if (stored.endedAt === null) throw new StorageRuleError('fasts', 'not-ended');
            const latest = fasts.reduce(
              (a, b) => (instantMs(b.startedAt) > instantMs(a.startedAt) ? b : a),
              stored,
            );
            if (latest.id !== id) throw new StorageRuleError('fasts', 'not-latest');
            if (instantMs(env.now()) - instantMs(stored.endedAt) > UNDO_END_WINDOW_MS) {
              throw new StorageRuleError('fasts', 'undo-expired');
            }
            refuseWhileGated(env, readiness, profile, weights, settings);
            const row = prepare(
              'fasts',
              { ...stored, endedAt: null, endedTimeZone: null },
              env,
              stored,
            );
            checkFasts([...fasts.filter((f) => f.id !== id), row]);
            return db.fasts.put(row).then(() => row);
          }),
        ),
      ),
    update: (id, patch: UpdatePatch<'fasts'>) => {
      assertOp('fasts', 'update');
      return guardedWrite(ctx, () => {
        if (laterThanNow(patch.startedAt) || laterThanNow(patch.endedAt)) {
          throw new StorageRuleError('fasts', 'future-time');
        }
        return db.transaction('rw', ['fasts'], () =>
          db.fasts.toArray().then((fasts) => {
            const stored = fasts.find((f) => f.id === id);
            if (stored === undefined) throw new StorageRuleError('fasts', 'not-found');
            if (patch.endedAt === null && stored.endedAt !== null) {
              throw new StorageRuleError('fasts', 'reopen');
            }
            const row = prepare(
              'fasts',
              stampUpdate(
                'fasts',
                stored as unknown as Record<string, unknown>,
                patch as Record<string, unknown>,
                env,
              ),
              env,
              stored,
            );
            checkFasts([...fasts.filter((f) => f.id !== id), row]);
            return db.fasts.put(row).then(() => row);
          }),
        );
      });
    },
    running: async () => {
      const latest = await db.fasts.orderBy('startedAt').last();
      return latest?.endedAt === null ? latest : undefined;
    },
  };
}
