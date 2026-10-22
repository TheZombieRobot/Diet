/**
 * Send and acknowledgement fields of a grocery list (storage spec sections 4.11 and 8.4;
 * checklist item 31 design 4.2; C52, NN-07). The generic update would add 1 to `version` and move
 * `updatedAt`, which would turn every send into "Changed since you sent it", so these writes leave
 * both alone. The rules are @diet/grocery/transfer's afterSend and afterAcknowledgement; a null
 * from them writes nothing. The stored row is passed to prepare as `previous`, as crud.update
 * does, so a phone whose clock moved back after the last edit still records.
 */
import type { GroceryListRecord, Id, Instant } from '@diet/core';
import {
  type AckDecision,
  type AckPayload,
  acknowledgementDecision,
  afterAcknowledgement,
  afterSend,
} from '@diet/grocery/transfer';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';

export interface GroceryTransferRepo {
  /** Records a send the relay stored. Leaves version and updatedAt alone. */
  readonly recordSend: (
    listId: Id,
    send: { readonly sentVersion: number; readonly sentAt: Instant; readonly transferId: Id },
    pairedAt: Instant,
  ) => Promise<{ readonly recorded: boolean; readonly list: GroceryListRecord }>;
  /** Records a verified acknowledgement. Leaves version and updatedAt alone. */
  readonly recordAcknowledgement: (
    listId: Id,
    ack: AckPayload,
    pairedAt: Instant,
  ) => Promise<{ readonly decision: AckDecision; readonly list: GroceryListRecord }>;
  /** The latest sentAt over every stored grocery list, or null (for monotonicSentAt). */
  readonly latestSentAt: () => Promise<Instant | null>;
}

export function groceryTransferRepo(ctx: RepoContext): GroceryTransferRepo {
  const { db, env } = ctx;
  return {
    recordSend: (listId, send, pairedAt) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['grocery_lists'], () =>
          db.grocery_lists.get(listId).then((stored) => {
            if (stored === undefined) throw new StorageRuleError('grocery_lists', 'not-found');
            const fields = afterSend(stored, send, pairedAt);
            if (fields === null) return { recorded: false, list: stored };
            const row = prepare('grocery_lists', { ...stored, ...fields }, env, stored);
            return db.grocery_lists.put(row).then(() => ({ recorded: true, list: row }));
          }),
        ),
      ),
    recordAcknowledgement: (listId, ack, pairedAt) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['grocery_lists'], () =>
          db.grocery_lists.get(listId).then((stored) => {
            if (stored === undefined) throw new StorageRuleError('grocery_lists', 'not-found');
            const decision = acknowledgementDecision(stored, pairedAt, ack);
            const fields = afterAcknowledgement(stored, pairedAt, ack, env.now());
            if (fields === null) return { decision, list: stored };
            const row = prepare('grocery_lists', { ...stored, ...fields }, env, stored);
            return db.grocery_lists.put(row).then(() => ({ decision, list: row }));
          }),
        ),
      ),
    // A read: no write gate. A paste code is never recorded, so its time is not included.
    latestSentAt: () =>
      db.grocery_lists
        .toArray()
        .then((lists) =>
          lists.reduce<Instant | null>(
            (latest, list) =>
              list.sentAt !== null &&
              (latest === null || Date.parse(list.sentAt) > Date.parse(latest))
                ? list.sentAt
                : latest,
            null,
          ),
        ),
  };
}
