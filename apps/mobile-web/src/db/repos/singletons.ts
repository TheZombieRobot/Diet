/**
 * The three singleton stores: profile, targets and settings (storage spec sections 4.4 and 8.2).
 * Each always has its one row after populate; get() returns it and update(patch) changes it.
 * settings.recordBackup(at) changes only lastBackupAt, and only after the owner has said they can
 * see the exported file (section 10.5 step 6; D21).
 */
import type { Instant, StoreRecords } from '@diet/core';
import { rememberHomeTimeZone } from '../env';
import { StorageRuleError } from '../errors';
import type { RepoContext } from './context';
import { type CrudRepo, crudRepo, type UpdatePatch } from './crud';

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

export function settingsRepo(ctx: RepoContext): SettingsRepo {
  const base = singletonRepo(ctx, 'settings');
  const seen = (row: StoreRecords['settings']): StoreRecords['settings'] => {
    rememberHomeTimeZone(row.homeTimeZone);
    return row;
  };
  const update = async (patch: UpdatePatch<'settings'>): Promise<StoreRecords['settings']> => {
    const before = await base.get();
    const after = seen(await base.update(patch));
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
