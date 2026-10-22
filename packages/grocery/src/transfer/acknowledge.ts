/**
 * What a recorded send and a verified acknowledgement change on the phone's list (item 31 design
 * 2.2; the item-30/31 transfer contract, section 6.3; C52, NN-07; cross-item ruling 15). Pure:
 * the repository (groceryTransfer) applies them inside its transaction.
 *
 * "Received on laptop" may follow only from an acknowledgement that names the very send the
 * phone recorded (its version and transferId), under the current pairing. An acknowledgement of
 * an older version is recorded whatever its transferId: it says the laptop holds an older copy.
 */
import { type GroceryListRecord, type Id, type Instant, instantMs } from '@diet/core';
import type { AckPayload } from './payload';

export type TransferFields = Pick<
  GroceryListRecord,
  'sentVersion' | 'sentAt' | 'transferId' | 'receivedVersion' | 'receivedAt' | 'laptopReceivedAt'
>;
export type AckRefusal =
  | 'other-list'
  | 'not-sent'
  | 'before-pairing'
  | 'above-sent'
  | 'other-send'
  | 'already-recorded'
  | 'older-than-recorded';
export type AckDecision =
  { readonly accept: true } | { readonly accept: false; readonly reason: AckRefusal };

type AckedList = Pick<
  GroceryListRecord,
  'id' | 'sentVersion' | 'sentAt' | 'transferId' | 'receivedVersion'
>;

/**
 * The send fields for a send the relay stored, or null for no change: never above the list's
 * version, never lower than what was sent. A same-version re-send, or a receipt recorded before
 * the current pairing, clears the received fields, so the new send shows "waiting" until its own
 * acknowledgement; an older version received since the pairing is kept (it drives olderCopy).
 */
export function afterSend(
  list: Pick<
    GroceryListRecord,
    'version' | 'sentVersion' | 'receivedVersion' | 'receivedAt' | 'laptopReceivedAt'
  >,
  send: { readonly sentVersion: number; readonly sentAt: Instant; readonly transferId: Id },
  pairedAt: Instant,
): TransferFields | null {
  if (send.sentVersion > list.version) return null;
  if (list.sentVersion !== null && send.sentVersion < list.sentVersion) return null;
  const clear =
    list.receivedVersion === send.sentVersion ||
    (list.receivedAt !== null && instantMs(list.receivedAt) < instantMs(pairedAt));
  return {
    sentVersion: send.sentVersion,
    sentAt: send.sentAt,
    transferId: send.transferId,
    receivedVersion: clear ? null : list.receivedVersion,
    receivedAt: clear ? null : list.receivedAt,
    laptopReceivedAt: clear ? null : list.laptopReceivedAt,
  };
}

/** Whether an opened acknowledgement may be recorded (contract 6.3, first match wins). */
export function acknowledgementDecision(
  list: AckedList,
  pairedAt: Instant,
  ack: AckPayload,
): AckDecision {
  const refuse = (reason: AckRefusal): AckDecision => ({ accept: false, reason });
  if (ack.listId !== list.id) return refuse('other-list');
  if (list.sentVersion === null || list.sentAt === null || list.transferId === null) {
    return refuse('not-sent');
  }
  if (instantMs(list.sentAt) < instantMs(pairedAt)) return refuse('before-pairing');
  if (ack.version > list.sentVersion) return refuse('above-sent');
  if (ack.version === list.sentVersion && ack.transferId !== list.transferId) {
    return refuse('other-send');
  }
  if (ack.version === list.receivedVersion) return refuse('already-recorded');
  if (list.receivedVersion !== null && ack.version < list.receivedVersion) {
    return refuse('older-than-recorded');
  }
  return { accept: true };
}

/**
 * The received fields an accepted acknowledgement writes, or null: receivedAt is this phone's
 * clock, laptopReceivedAt the laptop's, as it reported it (STORAGE_DESIGN 4.11).
 */
export function afterAcknowledgement(
  list: AckedList,
  pairedAt: Instant,
  ack: AckPayload,
  now: Instant,
): Pick<TransferFields, 'receivedVersion' | 'receivedAt' | 'laptopReceivedAt'> | null {
  if (!acknowledgementDecision(list, pairedAt, ack).accept) return null;
  return { receivedVersion: ack.version, receivedAt: now, laptopReceivedAt: ack.receivedAt };
}
