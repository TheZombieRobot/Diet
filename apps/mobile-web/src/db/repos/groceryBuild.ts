/**
 * The grocery list's writes (item 24 design 4.2a; J5, J24, J34, J41). A list change and the audit
 * rows it causes are written in one transaction, so a deduction is never saved without its audit
 * line, nor an audit line without the deduction. Every change is a pure function applied to the
 * list as read inside the transaction, so quick ticks each apply to the latest version and never
 * refuse each other, while a change that no longer applies (the line is gone or changed) is
 * refused as 'list-changed' rather than overwriting. The current list is the newest by creation
 * time (the greater id on a tie); older lists are kept, unseen (J4).
 *
 * A new list, and a build of the current one, are refused while the phone's clock reads earlier
 * than the current list's last change (StorageClockError), so a new list is never hidden behind an
 * older one and no stock re-check can be got round by setting the clock back. This repository
 * writes only grocery_lists, audit and profile.storeName: never a garden, pantry, plan or health
 * row (item 19 G18; HS-23). It never writes item 31's send fields, except that create sets them
 * to null.
 */
import {
  type AuditRecord,
  type GroceryItem,
  type GroceryListRecord,
  type Id,
  type Instant,
  parseInstant,
} from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import type { AuditDraft } from '@diet/grocery';
import Dexie from 'dexie';
import type { DietDb } from '../db';
import type { StorageEnv } from '../env';
import { StorageClockError, StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { stampCreate, stampUpdate } from './crud';

export interface GroceryListChange {
  readonly items: GroceryItem[];
  readonly storeName?: string;
  readonly audits: readonly AuditDraft[];
}

export interface GroceryBuildRepo {
  /** The current list (the newest by createdAt, the greater id on a tie), or null. */
  readonly current: () => Promise<GroceryListRecord | null>;
  /** The newest time substitutes were cleared on list `id` (its hints-cleared audit rows), or null. */
  readonly hintsClearedAt: (id: Id) => Promise<Instant | null>;
  /** A new list and its audit rows in one transaction; the six send fields null. */
  readonly create: (
    input: { readonly storeName: string; readonly items: GroceryItem[] },
    audits: readonly AuditDraft[],
  ) => Promise<GroceryListRecord>;
  /**
   * Applies `change` (pure and synchronous; null means it no longer applies) to list `id` as read
   * inside the transaction, then puts it (version + 1) with its audit rows. With `build`: refused
   * as list-changed unless the version read is `expectedVersion`, and with StorageClockError while
   * now is earlier than the list's updatedAt.
   */
  readonly updateList: (
    id: Id,
    change: (list: GroceryListRecord) => GroceryListChange | null,
    options?: { readonly build?: { readonly expectedVersion: number } },
  ) => Promise<GroceryListRecord>;
  /** profile.storeName and, when it differs, the current list's, in one transaction. */
  readonly setStoreName: (name: string) => Promise<void>;
}

type Row = Record<string, unknown>;

/** The newest list by createdAt, the greater id on a tie (a Dexie request chain). */
function newestList(db: DietDb): PromiseLike<GroceryListRecord | null> {
  return db.grocery_lists
    .orderBy('createdAt')
    .last()
    .then((last) =>
      last === undefined
        ? null
        : db.grocery_lists
            .where('createdAt')
            .equals(last.createdAt)
            .toArray()
            .then((ties) => ties.reduce((a, b) => (b.id > a.id ? b : a), last)),
    );
}

const clockBehind = (env: StorageEnv, list: GroceryListRecord | null): boolean =>
  list !== null && parseInstant(env.now()) < parseInstant(list.updatedAt);

function auditRows(env: StorageEnv, audits: readonly AuditDraft[], at: Instant): AuditRecord[] {
  return audits.map((a) =>
    prepare(
      'audit',
      {
        id: env.randomId(),
        at,
        timeZone: env.timeZone(),
        kind: 'grocery',
        table: a.table,
        recordId: a.recordId,
        reason: a.reason,
      },
      env,
    ),
  );
}

export function groceryBuildRepo(ctx: RepoContext): GroceryBuildRepo {
  const { db, env } = ctx;
  return {
    current: () => Promise.resolve(newestList(db)),
    hintsClearedAt: async (id) => {
      const rows = await db.audit.where('[table+recordId]').equals(['grocery_lists', id]).toArray();
      const times = rows
        .filter((r) => r.kind === 'grocery' && r.reason === grocery.audit.hintsCleared)
        .map((r) => r.at)
        .sort();
      return times.at(-1) ?? null;
    },
    create: (input, audits) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['grocery_lists', 'audit'], () =>
          Dexie.Promise.all([newestList(db)]).then(([current]) => {
            if (clockBehind(env, current ?? null)) throw new StorageClockError();
            const row = prepare(
              'grocery_lists',
              stampCreate(
                'grocery_lists',
                {
                  storeName: input.storeName,
                  sentVersion: null,
                  sentAt: null,
                  transferId: null,
                  receivedVersion: null,
                  receivedAt: null,
                  laptopReceivedAt: null,
                  items: input.items,
                },
                env,
              ),
              env,
            );
            return Dexie.Promise.all([
              db.grocery_lists.add(row),
              db.audit.bulkAdd(auditRows(env, audits, row.updatedAt)),
            ]).then(() => row);
          }),
        ),
      ),
    updateList: (id, change, options = {}) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['grocery_lists', 'audit'], () =>
          db.grocery_lists.get(id).then((stored) => {
            if (stored === undefined) throw new StorageRuleError('grocery_lists', 'not-found');
            const build = options.build;
            if (build !== undefined) {
              if (stored.version !== build.expectedVersion) {
                throw new StorageRuleError('grocery_lists', 'list-changed');
              }
              if (clockBehind(env, stored)) throw new StorageClockError();
            }
            const next = change(stored);
            if (next === null) throw new StorageRuleError('grocery_lists', 'list-changed');
            const patch: Row = { items: next.items };
            if (next.storeName !== undefined) patch['storeName'] = next.storeName;
            const row = prepare(
              'grocery_lists',
              stampUpdate('grocery_lists', stored as unknown as Row, patch, env),
              env,
              stored,
            );
            return Dexie.Promise.all([
              db.grocery_lists.put(row),
              db.audit.bulkAdd(auditRows(env, next.audits, row.updatedAt)),
            ]).then(() => row);
          }),
        ),
      ),
    setStoreName: (name) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['profile', 'grocery_lists'], () =>
          Dexie.Promise.all([db.profile.get('singleton'), newestList(db)]).then(
            ([profile, current]) => {
              if (profile === undefined) throw new StorageRuleError('profile', 'not-found');
              const row = prepare(
                'profile',
                stampUpdate('profile', profile as unknown as Row, { storeName: name }, env),
                env,
                profile,
              );
              const writes: PromiseLike<unknown>[] = [db.profile.put(row)];
              if (current !== null && current.storeName !== name) {
                writes.push(
                  db.grocery_lists.put(
                    prepare(
                      'grocery_lists',
                      stampUpdate(
                        'grocery_lists',
                        current as unknown as Row,
                        { storeName: name },
                        env,
                      ),
                      env,
                      current,
                    ),
                  ),
                );
              }
              return Dexie.Promise.all(writes).then(() => undefined);
            },
          ),
        ),
      ),
  };
}
