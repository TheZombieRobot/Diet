/**
 * What leaves the phone, and what comes back (item 30 design 1.9; the item-30/31 transfer contract,
 * sections 5 and 6; cross-item rulings 14 and 15).
 *
 * The list payload carries the list's to-buy lines only, eight fields each, with the store name,
 * the list id and version, a send id made fresh for every send and the send time. Already-have
 * lines, prices, garden and pantry amounts, audit notes, ingredient ids, line origins and the
 * list's own times never leave the phone: every object is built field by field, never spread, so
 * nothing else can ride along. The acknowledgement names the list, the version the laptop holds,
 * the send that brought that version and when the laptop accepted it.
 *
 * Decoding is strict, never throws and returns a new object. Values are checked with the frozen
 * version-1 grocery_lists rules on a synthetic record, so the transfer rules cannot drift from the
 * stored ones (a test fails when those rules change, asking for a payload version decision).
 */
import {
  checkRow,
  type GroceryItem,
  type GroceryListRecord,
  type Id,
  type Instant,
  instantMs,
  isId,
  isInstant,
  isInt,
  isPlainObject,
  TABLES_V1,
  utf8Decode,
  utf8Encode,
} from '@diet/core';

export const LIST_PAYLOAD_KIND = 'diet-list';
export const ACK_PAYLOAD_KIND = 'diet-ack';
/** The payloads' schema version. A new one needs a DECISIONS row (item 30 P7). */
export const TRANSFER_PAYLOAD_VERSION = 1;
/** The eight fields of a line that leave the phone, in encoding order. */
export const TRANSFER_ITEM_FIELDS = Object.freeze([
  'id',
  'text',
  'quantity',
  'unit',
  'packSuggestion',
  'aisle',
  'substituteHint',
  'ticked',
] as const);

export type TransferItem = Pick<GroceryItem, (typeof TRANSFER_ITEM_FIELDS)[number]>;

export interface TransferList {
  readonly storeName: string;
  readonly items: readonly TransferItem[];
}

export interface ListPayload {
  readonly kind: 'diet-list';
  readonly v: 1;
  readonly listId: Id;
  readonly version: number;
  /** Fresh for every send (STORAGE_DESIGN 4.11). */
  readonly transferId: Id;
  /** The phone's clock, never earlier than any recorded send (monotonicSentAt). */
  readonly sentAt: Instant;
  readonly list: TransferList;
}

export interface AckPayload {
  readonly kind: 'diet-ack';
  readonly v: 1;
  readonly listId: Id;
  readonly version: number;
  /** The send that gave the laptop this version. */
  readonly transferId: Id;
  /** The laptop's clock when it accepted that send. */
  readonly receivedAt: Instant;
}

const LIST_KEYS = ['kind', 'v', 'listId', 'version', 'transferId', 'sentAt', 'list'] as const;
const ACK_KEYS = ['kind', 'v', 'listId', 'version', 'transferId', 'receivedAt'] as const;
const TRANSFER_LIST_KEYS = ['storeName', 'items'] as const;

const transferItemOf = (item: TransferItem): TransferItem => ({
  id: item.id,
  text: item.text,
  quantity: item.quantity,
  unit: item.unit,
  packSuggestion: item.packSuggestion,
  aisle: item.aisle,
  substituteHint: item.substituteHint,
  ticked: item.ticked,
});

/** The to-buy lines, in stored order, eight fields each, and the store name. */
export function transferListOf(list: GroceryListRecord): TransferList {
  return {
    storeName: list.storeName,
    items: list.items.filter((item) => item.section === 'to-buy').map(transferItemOf),
  };
}

/**
 * The payload for one send. Throws RangeError('transfer send') for a bad transferId or sentAt, and
 * RangeError('transfer payload') when the result would not decode (a fault in the app; item 31
 * treats any throw while sealing as "refused"). Neither message carries a value.
 */
export function listPayload(
  list: GroceryListRecord,
  send: { readonly transferId: Id; readonly sentAt: Instant },
): ListPayload {
  if (!isId(send.transferId) || !isInstant(send.sentAt)) throw new RangeError('transfer send');
  const payload: ListPayload = {
    kind: LIST_PAYLOAD_KIND,
    v: TRANSFER_PAYLOAD_VERSION,
    listId: list.id,
    version: list.version,
    transferId: send.transferId,
    sentAt: send.sentAt,
    list: transferListOf(list),
  };
  if (decodeListPayload(encodeTransferPayload(payload)) === null) {
    throw new RangeError('transfer payload');
  }
  return payload;
}

/** An acknowledgement (item 33, and tests). Throws RangeError('acknowledgement') for a bad value. */
export function ackPayload(a: {
  readonly listId: Id;
  readonly version: number;
  readonly transferId: Id;
  readonly receivedAt: Instant;
}): AckPayload {
  const ack: AckPayload = {
    kind: ACK_PAYLOAD_KIND,
    v: TRANSFER_PAYLOAD_VERSION,
    listId: a.listId,
    version: a.version,
    transferId: a.transferId,
    receivedAt: a.receivedAt,
  };
  if (!isValidAck(ack)) throw new RangeError('acknowledgement');
  return ack;
}

/** JSON in the key order of the types, no spacing, then UTF-8. Same input, same bytes. */
export function encodeTransferPayload(p: ListPayload | AckPayload): Uint8Array {
  const value =
    p.kind === LIST_PAYLOAD_KIND
      ? {
          kind: p.kind,
          v: p.v,
          listId: p.listId,
          version: p.version,
          transferId: p.transferId,
          sentAt: p.sentAt,
          list: { storeName: p.list.storeName, items: p.list.items.map(transferItemOf) },
        }
      : {
          kind: p.kind,
          v: p.v,
          listId: p.listId,
          version: p.version,
          transferId: p.transferId,
          receivedAt: p.receivedAt,
        };
  return utf8Encode(JSON.stringify(value));
}

/** A plain object whose own keys are exactly `keys` (so never __proto__, constructor or prototype). */
function hasExactly(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** UTF-8 JSON, refusing a byte-order mark and invalid UTF-8; undefined when it is not. */
function parseJson(bytes: Uint8Array): unknown {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return undefined;
  try {
    return JSON.parse(utf8Decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

/** The stored-shaped record a list payload stands for, to check it with the version-1 rules. */
function syntheticRecord(p: Record<string, unknown>, items: readonly Record<string, unknown>[]) {
  const list = p['list'] as Record<string, unknown>;
  return {
    id: p['listId'],
    version: p['version'],
    createdAt: p['sentAt'],
    updatedAt: p['sentAt'],
    storeName: list['storeName'],
    sentVersion: null,
    sentAt: null,
    transferId: null,
    receivedVersion: null,
    receivedAt: null,
    laptopReceivedAt: null,
    items: items.map((item) => ({
      id: item['id'],
      origin: 'manual',
      ingredientId: null,
      text: item['text'],
      quantity: item['quantity'],
      unit: item['unit'],
      packSuggestion: item['packSuggestion'],
      aisle: item['aisle'],
      substituteHint: item['substituteHint'],
      section: 'to-buy',
      fromGardenG: null,
      gardenAmountUnknown: false,
      fromPantryG: null,
      auditNote: null,
      price: null,
      ticked: item['ticked'],
    })),
  };
}

/** A list payload, or null. Strict: exact keys at every depth, values by the version-1 rules. */
export function decodeListPayload(bytes: Uint8Array): ListPayload | null {
  const value = parseJson(bytes);
  if (!hasExactly(value, LIST_KEYS)) return null;
  if (value['kind'] !== LIST_PAYLOAD_KIND || value['v'] !== TRANSFER_PAYLOAD_VERSION) return null;
  if (!isId(value['transferId'])) return null;
  const list = value['list'];
  if (!hasExactly(list, TRANSFER_LIST_KEYS) || !Array.isArray(list['items'])) return null;
  const items = list['items'] as unknown[];
  if (!items.every((item) => hasExactly(item, TRANSFER_ITEM_FIELDS))) return null;
  if (!checkRow('grocery_lists', syntheticRecord(value, items), TABLES_V1).ok) return null;
  // The checks above proved every type below.
  const p = value as unknown as ListPayload;
  return {
    kind: LIST_PAYLOAD_KIND,
    v: TRANSFER_PAYLOAD_VERSION,
    listId: p.listId,
    version: p.version,
    transferId: p.transferId,
    sentAt: p.sentAt,
    list: { storeName: p.list.storeName, items: p.list.items.map(transferItemOf) },
  };
}

function isValidAck(ack: object): boolean {
  const a = ack as Readonly<Record<string, unknown>>;
  return (
    a['kind'] === ACK_PAYLOAD_KIND &&
    a['v'] === TRANSFER_PAYLOAD_VERSION &&
    isId(a['listId']) &&
    isInt(a['version'], 1, 1_000_000) &&
    isId(a['transferId']) &&
    isInstant(a['receivedAt'])
  );
}

/** An acknowledgement, or null. Strict: exactly the six keys, each by its rule. */
export function decodeAckPayload(bytes: Uint8Array): AckPayload | null {
  const value = parseJson(bytes);
  if (!hasExactly(value, ACK_KEYS) || !isValidAck(value)) return null;
  const a = value as unknown as AckPayload;
  return {
    kind: ACK_PAYLOAD_KIND,
    v: TRANSFER_PAYLOAD_VERSION,
    listId: a.listId,
    version: a.version,
    transferId: a.transferId,
    receivedAt: a.receivedAt,
  };
}

/**
 * A send time never earlier than `previous` (item 31 passes the latest sentAt over every stored
 * list): `now`, or `previous` plus 1 ms when the clock reads `previous` or earlier.
 */
export function monotonicSentAt(previous: Instant | null, now: Instant): Instant {
  if (previous === null || previous < now) return now;
  return new Date(instantMs(previous) + 1).toISOString();
}
