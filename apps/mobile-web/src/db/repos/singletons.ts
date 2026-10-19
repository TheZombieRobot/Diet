/**
 * The three singleton stores: profile, targets and settings (storage spec sections 4.4 and 8.2).
 * Each always has its one row after populate; get() returns it and update(patch) changes it.
 * settings.recordBackup(at) changes only lastBackupAt, and only after the owner has said they can
 * see the exported file (section 10.5 step 6; D21).
 *
 * The settings update also guards the order of setup (item 13, E62; HS-20, C41): it refuses to
 * clear the alcohol notice acknowledgement, and refuses to complete setup before the notice is
 * acknowledged and all seven readiness questions have a current answer. The check and the write
 * are one read-write transaction over settings and readiness, so another tab cannot slip between
 * them. Backup import and delete-all replace whole rows without this repository, so a restored
 * file may hold any state; the first-run guard in the app handles that.
 */
import {
  type Instant,
  localDateOf,
  missingReadinessAnswers,
  type ReadinessRecord,
  readinessInputFromRows,
  type SettingsRecord,
  type StoreRecords,
} from '@diet/core';
import Dexie from 'dexie';
import type { StorageEnv } from '../env';
import { rememberHomeTimeZone } from '../env';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { assertOp, type CrudRepo, crudRepo, stampUpdate, type UpdatePatch } from './crud';

type SingletonName = 'profile' | 'targets' | 'settings';

export interface SingletonRepo<K extends SingletonName> {
  readonly get: () => Promise<StoreRecords[K]>;
  readonly update: (patch: UpdatePatch<K>) => Promise<StoreRecords[K]>;
}

export interface SettingsRepo extends SingletonRepo<'settings'> {
  /** Records a backup the owner confirmed they can see (D21). Changes nothing else. */
  readonly recordBackup: (exportedAt: Instant) => Promise<StoreRecords['settings']>;
}

export function singletonRepo<K extends SingletonName>(
  ctx: RepoContext,
  table: K,
): SingletonRepo<K> {
  const crud = crudRepo(ctx, table) as unknown as CrudRepo<K> & {
    get(key: string): Promise<StoreRecords[K] | undefined>;
    update(key: string, patch: UpdatePatch<K>): Promise<StoreRecords[K]>;
  };
  return {
    get: async () => {
      const row = await crud.get('singleton');
      if (row === undefined) throw new StorageRuleError(table, 'not-found');
      return row;
    },
    update: (patch) => crud.update('singleton', patch),
  };
}

/**
 * Whether a settings write keeps setup in order (E62): the acknowledgement is never cleared, and
 * setup is completed only with the acknowledgement and every readiness question answered under its
 * current wording.
 */
export function onboardingOrderKept(
  stored: SettingsRecord,
  next: SettingsRecord,
  readiness: readonly ReadinessRecord[],
  env: StorageEnv,
): boolean {
  if (stored.alcoholNoticeAckAt !== null && next.alcoholNoticeAckAt === null) return false;
  if (stored.onboardingCompletedAt === null && next.onboardingCompletedAt !== null) {
    if (next.alcoholNoticeAckAt === null) return false;
    const today = localDateOf(env.now(), env.timeZone());
    if (missingReadinessAnswers(readinessInputFromRows(readiness, null, today)).length > 0) {
      return false;
    }
  }
  return true;
}

export function settingsRepo(ctx: RepoContext): SettingsRepo {
  const { db, env } = ctx;
  const base = singletonRepo(ctx, 'settings');
  const seen = (row: StoreRecords['settings']): StoreRecords['settings'] => {
    rememberHomeTimeZone(row.homeTimeZone);
    return row;
  };
  const update = async (patch: UpdatePatch<'settings'>): Promise<StoreRecords['settings']> => {
    assertOp('settings', 'update');
    const { before, after } = await guardedWrite(ctx, () =>
      db.transaction('rw', ['settings', 'readiness'], () =>
        Dexie.Promise.all([db.settings.get('singleton'), db.readiness.toArray()]).then(
          ([stored, readiness]) => {
            if (stored === undefined) throw new StorageRuleError('settings', 'not-found');
            const row = prepare(
              'settings',
              stampUpdate(
                'settings',
                stored as unknown as Record<string, unknown>,
                patch as Record<string, unknown>,
                env,
              ),
              env,
              stored,
            );
            if (!onboardingOrderKept(stored, row, readiness, env)) {
              throw new StorageRuleError('settings', 'onboarding-order');
            }
            return db.settings.put(row).then(() => ({ before: stored, after: row }));
          },
        ),
      ),
    );
    seen(after);
    // PWA-06 (section 12.1): ask again for persistent storage when onboarding first completes.
    if (before.onboardingCompletedAt === null && after.onboardingCompletedAt !== null) {
      ctx.hooks.onOnboardingCompleted?.();
    }
    return after;
  };
  return {
    get: async () => seen(await base.get()),
    update,
    recordBackup: (exportedAt) => update({ lastBackupAt: exportedAt }),
  };
}
