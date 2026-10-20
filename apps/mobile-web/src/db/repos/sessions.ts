/**
 * Sessions (storage spec sections 4.9 and 8.2; item 26 3.14 point 5; item 27). The generic
 * repository, plus writes checked inside their own read-write transaction (item 27 review): the
 * caller's rule sees the row as it would be written, the row as stored (null for a new one) and
 * every stored row, and throws to refuse, so nothing changes between the check and the write. Two
 * tabs can then never both start a session, and a tab that has not caught up can never change a
 * row that has moved on since it was drawn (a finished session turned back into a rest). A rule
 * runs inside the transaction scope, so it must be synchronous and carry @transactionScope.
 */
import type { Id, SessionRecord } from '@diet/core';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import {
  assertOp,
  type CreateInput,
  type CrudRepo,
  crudRepo,
  stampCreate,
  stampUpdate,
  type UpdatePatch,
} from './crud';

/** Checks a sessions write on the rows it would leave; throws to refuse it (nothing is written). */
export type SessionsRule = (
  next: SessionRecord,
  stored: SessionRecord | null,
  rows: readonly SessionRecord[],
) => void;

export interface SessionsRepo extends CrudRepo<'sessions'> {
  readonly createChecked: (
    input: CreateInput<'sessions'>,
    rule: SessionsRule,
  ) => Promise<SessionRecord>;
  /** Sends only the patch, merged with the row as stored in the same transaction. */
  readonly updateChecked: (
    id: Id,
    patch: UpdatePatch<'sessions'>,
    rule: SessionsRule,
  ) => Promise<SessionRecord>;
  /** Removes the row only while `removable` holds for it as stored; says whether it did. */
  readonly removeIf: (id: Id, removable: (stored: SessionRecord) => boolean) => Promise<boolean>;
}

type Row = Record<string, unknown>;

export function sessionsRepo(ctx: RepoContext): SessionsRepo {
  const { db, env } = ctx;
  return {
    ...crudRepo(ctx, 'sessions'),
    createChecked: (input, rule) => {
      assertOp('sessions', 'create');
      return guardedWrite(ctx, () => {
        const row = prepare('sessions', stampCreate('sessions', input as unknown as Row, env), env);
        return db.transaction('rw', ['sessions'], () =>
          db.sessions
            .toArray()
            .then((rows) => {
              rule(row, null, rows);
              return db.sessions.add(row);
            })
            .then(() => row),
        );
      });
    },
    updateChecked: (id, patch, rule) => {
      assertOp('sessions', 'update');
      return guardedWrite(ctx, () =>
        db.transaction('rw', ['sessions'], () =>
          db.sessions.toArray().then((rows) => {
            const stored = rows.find((r) => r.id === id);
            if (stored === undefined) throw new StorageRuleError('sessions', 'not-found');
            const row = prepare(
              'sessions',
              stampUpdate('sessions', stored as unknown as Row, patch as Row, env),
              env,
              stored,
            );
            rule(row, stored, rows);
            return db.sessions.put(row).then(() => row);
          }),
        ),
      );
    },
    removeIf: (id, removable) => {
      assertOp('sessions', 'remove');
      return guardedWrite(ctx, () =>
        db.transaction('rw', ['sessions'], () =>
          db.sessions.get(id).then((stored) => {
            if (stored === undefined || !removable(stored)) return false;
            return db.sessions.delete(id).then(() => true);
          }),
        ),
      );
    },
  };
}
