/**
 * The profile repository (item 24 design 4.2b; J28). Same type as the other singletons, so item
 * 13's screens are unchanged, but an update that changes allergens, Gluten-free household or
 * dislikes also clears every stored grocery list's substitute hints, with one audit row per list,
 * in the same transaction. A hint is stored as a bare food name worked out under the profile of
 * its day, so this is the one place that keeps a stale hint off the screen, the exports and the
 * laptop, whoever writes the profile. The diet mode still has one writer (item 21).
 */
import { type AuditRecord, type GroceryListRecord, type StoreRecords } from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import { clearSubstituteHints, substituteFilterChanged } from '@diet/grocery';
import Dexie from 'dexie';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { assertOp, stampUpdate } from './crud';
import { type SingletonRepo, singletonRepo } from './singletons';

type Row = Record<string, unknown>;

export function profileRepo(ctx: RepoContext): SingletonRepo<'profile'> {
  const { db, env } = ctx;
  const base = singletonRepo(ctx, 'profile');
  /** The lists with hints cleared, each with its audit row (inside the profile write). */
  const clearHints = (lists: readonly GroceryListRecord[]): PromiseLike<unknown>[] =>
    lists.flatMap((list) => {
      const items = clearSubstituteHints(list.items);
      if (items === null) return [];
      const next = prepare(
        'grocery_lists',
        stampUpdate('grocery_lists', list as unknown as Row, { items }, env),
        env,
        list,
      );
      const audit: AuditRecord = prepare(
        'audit',
        {
          id: env.randomId(),
          at: next.updatedAt,
          timeZone: env.timeZone(),
          kind: 'grocery',
          table: 'grocery_lists',
          recordId: list.id,
          reason: grocery.audit.hintsCleared,
        },
        env,
      );
      return [db.grocery_lists.put(next), db.audit.add(audit)];
    });
  return {
    get: base.get,
    update: (patch) => {
      if (Object.hasOwn(patch, 'dietMode')) {
        return Promise.reject(new StorageRuleError('profile', 'diet-mode-switch-only'));
      }
      assertOp('profile', 'update');
      return guardedWrite(ctx, () =>
        db.transaction('rw', ['profile', 'grocery_lists', 'audit'], () =>
          db.profile.get('singleton').then((stored) => {
            if (stored === undefined) throw new StorageRuleError('profile', 'not-found');
            const row: StoreRecords['profile'] = prepare(
              'profile',
              stampUpdate('profile', stored as unknown as Row, patch as Row, env),
              env,
              stored,
            );
            if (!substituteFilterChanged(stored, row)) return db.profile.put(row).then(() => row);
            return db.grocery_lists
              .toArray()
              .then((lists) =>
                Dexie.Promise.all([db.profile.put(row), ...clearHints(lists)]).then(() => row),
              );
          }),
        ),
      );
    },
  };
}
