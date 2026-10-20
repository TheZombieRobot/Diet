// The list payload and the acknowledgement (item 30 design 1.9; contract sections 5 and 6;
// cross-item rulings 14 and 15; G10–G12, G14, G15, G21). Vectors V3–V5:
// packages/test-fixtures/src/transfer/vectors.ts.
import {
  type GroceryListRecord,
  relayBodyFits,
  stableStringify,
  TABLES,
  TABLES_V1,
  utf8Decode,
  utf8Encode,
} from '@diet/core';
import {
  groceryList300,
  V3_BODY,
  V3_JSON,
  V3_LIST,
  V3_SEND,
  V3_SHA256,
  V4_BODY,
  V4_JSON,
  V5_KEY_BYTES,
  VECTOR_KEY_BYTES,
} from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { openFromRelay, openRelayBody, sealForRelay } from './envelope';
import { importPairingKey } from './pairingKey';
import {
  ackPayload,
  decodeAckPayload,
  decodeListPayload,
  encodeTransferPayload,
  type ListPayload,
  listPayload,
  TRANSFER_ITEM_FIELDS,
  transferListOf,
} from './payload';
import { bytesToHex, nodeCrypto } from './testKit';

const K = () => importPairingKey(VECTOR_KEY_BYTES);
const V3_PAYLOAD = JSON.parse(V3_JSON) as ListPayload;
const V4_ACK = JSON.parse(V4_JSON) as unknown;
const text = (bytes: Uint8Array | null) => (bytes === null ? null : utf8Decode(bytes));

describe('G10 TR-01 NN-07 P9: the list vector V3', () => {
  it('listPayload of V3_LIST encodes to exactly V3, without the already-have line, price, garden amount or audit note', async () => {
    const payload = listPayload(V3_LIST, V3_SEND);
    expect(payload).toEqual(V3_PAYLOAD);
    const bytes = encodeTransferPayload(payload);
    expect(utf8Decode(bytes)).toBe(V3_JSON);
    expect(V3_JSON).toHaveLength(594);
    const hash = (await nodeCrypto()).createHash('sha256').update(bytes).digest('hex');
    expect(hash).toBe(V3_SHA256);
  });

  it('V3_BODY opens to the same bytes in the list slot, which decode to the payload', async () => {
    const opened = await openFromRelay(await K(), 'list', V3_BODY);
    expect(text(opened)).toBe(V3_JSON);
    expect(decodeListPayload(opened ?? new Uint8Array(0))).toEqual(V3_PAYLOAD);
  });
});

describe('G11 C52 TR-01: the acknowledgement vector V4', () => {
  it('V4_BODY opens in the ack slot only, to the acknowledgement of V3’s send', async () => {
    const key = await K();
    const opened = await openFromRelay(key, 'ack', V4_BODY);
    const ack = decodeAckPayload(opened ?? new Uint8Array(0));
    expect(ack).toEqual(V4_ACK);
    expect(ack).toEqual(
      ackPayload({
        listId: V3_LIST.id,
        version: 3,
        transferId: V3_SEND.transferId,
        receivedAt: '2000-01-05T06:01:00.000Z',
      }),
    );
    expect(utf8Decode(encodeTransferPayload(ack ?? (V4_ACK as never)))).toBe(V4_JSON);
    expect(await openRelayBody(key, 'list', V4_BODY)).toEqual({ ok: false, reason: 'cannot-open' });
    expect(await openRelayBody(key, 'ack', V3_BODY)).toEqual({ ok: false, reason: 'cannot-open' });
  });
});

const SEND = {
  transferId: '00000000-0000-4000-8000-0000000000a1',
  sentAt: '2000-01-05T06:00:00.000Z',
};

describe('G12 TR-01 HS-16 NN-07 TR-10: a 300-line list round-trips; a wrong key fails cleanly', () => {
  it('seals to under half the relay cap and opens to the same payload, with no price', async () => {
    const { list } = groceryList300();
    const priced: GroceryListRecord = {
      ...list,
      items: list.items.map((item) => ({
        ...item,
        price: { amountNzCents: 650, basis: 'line', enteredAt: '2000-01-02T00:00:00.000Z' },
      })),
    };
    const payload = listPayload(priced, SEND);
    expect(payload.listId).toBe(list.id);
    expect(payload.version).toBe(list.version);
    const key = await K();
    const body = await sealForRelay(key, 'list', encodeTransferPayload(payload));
    expect(relayBodyFits(body, 'list')).toBe(true);
    expect(body.length).toBeLessThanOrEqual(32_768);
    const opened = await openFromRelay(key, 'list', body);
    expect(decodeListPayload(opened ?? new Uint8Array(0))).toEqual(payload);
    expect(text(opened)).not.toContain('amountNzCents');
    expect(text(opened)).not.toContain('price');
  });

  it('a body opens only under the key it was sealed with (V5’s key, as after pairing again)', async () => {
    const other = await importPairingKey(V5_KEY_BYTES);
    expect(await openRelayBody(other, 'list', V3_BODY)).toEqual({
      ok: false,
      reason: 'cannot-open',
    });
    const sealedUnderOther = await sealForRelay(other, 'list', utf8Encode(V3_JSON));
    expect(await openFromRelay(await K(), 'list', sealedUnderOther)).toBeNull();
  });
});

describe('G14 P10: the self-checks', () => {
  const rangeError = (run: () => unknown, message: string) => {
    expect(run).toThrow(RangeError);
    expect(run).toThrow(new RangeError(message));
  };

  it('a line too long for the stored rules, a bad send id or time, a bad acknowledgement', () => {
    const long = {
      ...V3_LIST,
      items: [{ ...V3_LIST.items[0], text: 'x'.repeat(101) }],
    } as GroceryListRecord;
    rangeError(() => listPayload(long, V3_SEND), 'transfer payload');
    rangeError(
      () => listPayload(V3_LIST, { ...V3_SEND, transferId: 'not-an-id' }),
      'transfer send',
    );
    rangeError(() => listPayload(V3_LIST, { ...V3_SEND, sentAt: '2000-01-05' }), 'transfer send');
    rangeError(
      () =>
        ackPayload({
          listId: V3_LIST.id,
          version: 0,
          transferId: V3_SEND.transferId,
          receivedAt: SEND.sentAt,
        }),
      'acknowledgement',
    );
  });
});

/** V3's JSON with a change, as bytes. */
const variant = (change: (p: Record<string, unknown>) => void): Uint8Array => {
  const p = JSON.parse(V3_JSON) as Record<string, unknown>;
  change(p);
  return utf8Encode(JSON.stringify(p));
};
const listOf = (p: Record<string, unknown>) => p['list'] as Record<string, unknown>;
const itemsOf = (p: Record<string, unknown>) => listOf(p)['items'] as Record<string, unknown>[];
const firstItem = (p: Record<string, unknown>) => itemsOf(p)[0] as Record<string, unknown>;
const withJsonKey = (json: string, at: 'top' | 'list' | 'item', key: string) =>
  utf8Encode(
    at === 'top'
      ? json.replace('{"kind"', `{"${key}":{},"kind"`)
      : at === 'list'
        ? json.replace('{"storeName"', `{"${key}":{},"storeName"`)
        : json.replace('{"id"', `{"${key}":1,"id"`),
  );

describe('G15 TR-01 C84: the decoders are strict and never throw', () => {
  it.each([
    ['not UTF-8', Uint8Array.of(0xff, 0x7b, 0x7d)],
    ['a byte-order mark', Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8Encode(V3_JSON)])],
    ['not JSON', utf8Encode('Example plaintext')],
    ['a JSON array', utf8Encode('[]')],
    ['an extra top-level key', variant((p) => (p['extra'] = 1))],
    ['a missing key', variant((p) => delete p['sentAt'])],
    ['kind diet-ack', variant((p) => (p['kind'] = 'diet-ack'))],
    ['v 2', variant((p) => (p['v'] = 2))],
    [
      'a list id that is not a v4 UUID',
      variant((p) => (p['listId'] = '00000000-0000-1000-8000-000000000001')),
    ],
    ['a transfer id that is not a UUID', variant((p) => (p['transferId'] = 'x'))],
    ['version 0', variant((p) => (p['version'] = 0))],
    ['version 1,000,001', variant((p) => (p['version'] = 1_000_001))],
    ['version 1.5', variant((p) => (p['version'] = 1.5))],
    ['a send time that is not canonical', variant((p) => (p['sentAt'] = '2000-01-05T06:00:00Z'))],
    ['a store name of 81 characters', variant((p) => (listOf(p)['storeName'] = 'x'.repeat(81)))],
    [
      '501 lines',
      variant((p) => {
        listOf(p)['items'] = Array.from({ length: 501 }, (_, i) => ({
          ...firstItem(p),
          id: `00000000-0000-4000-8000-${(0x100 + i).toString(16).padStart(12, '0')}`,
        }));
      }),
    ],
    [
      'two lines with one id',
      variant((p) => (itemsOf(p)[1] = { ...itemsOf(p)[1], id: firstItem(p)['id'] })),
    ],
    ['a quantity of null with a unit', variant((p) => (firstItem(p)['quantity'] = null))],
    ['a control character in a line', variant((p) => (firstItem(p)['text'] = 'Example\u0007'))],
    ['a line with a price', variant((p) => (firstItem(p)['price'] = null))],
    ['a line with a section', variant((p) => (firstItem(p)['section'] = 'to-buy'))],
    ['__proto__ at the top', withJsonKey(V3_JSON, 'top', '__proto__')],
    ['__proto__ in the list', withJsonKey(V3_JSON, 'list', '__proto__')],
    ['__proto__ in a line', withJsonKey(V3_JSON, 'item', '__proto__')],
    ['a constructor key', withJsonKey(V3_JSON, 'top', 'constructor')],
  ])('a list payload with %s is null', (_name, bytes) => {
    expect(decodeListPayload(bytes)).toBeNull();
  });

  it('accepts its keys in any order, and returns a new object', () => {
    const p = JSON.parse(V3_JSON) as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(p).reverse());
    const bytes = utf8Encode(JSON.stringify(reordered));
    const decoded = decodeListPayload(bytes);
    expect(decoded).toEqual(V3_PAYLOAD);
    bytes.fill(0);
    expect(decoded).toEqual(V3_PAYLOAD);
    const first = decodeListPayload(utf8Encode(V3_JSON));
    expect(first).not.toBe(decodeListPayload(utf8Encode(V3_JSON)));
  });

  const ackVariant = (change: (a: Record<string, unknown>) => void) => {
    const a = JSON.parse(V4_JSON) as Record<string, unknown>;
    change(a);
    return utf8Encode(JSON.stringify(a));
  };

  it.each([
    ['an extra key', ackVariant((a) => (a['extra'] = 1))],
    ['no transfer id', ackVariant((a) => delete a['transferId'])],
    ['a transfer id that is a number', ackVariant((a) => (a['transferId'] = 42))],
    ['a transfer id that is not a UUID', ackVariant((a) => (a['transferId'] = 'x'))],
    ['kind diet-list', ackVariant((a) => (a['kind'] = 'diet-list'))],
    ['version 1.5', ackVariant((a) => (a['version'] = 1.5))],
    ['a bad received time', ackVariant((a) => (a['receivedAt'] = 'yesterday'))],
    ['a list payload', utf8Encode(V3_JSON)],
    ['empty bytes', new Uint8Array(0)],
    ['an own __proto__ key', utf8Encode(V4_JSON.replace('{"kind"', '{"__proto__":{},"kind"'))],
  ])('an acknowledgement with %s is null', (_name, bytes) => {
    expect(decodeAckPayload(bytes)).toBeNull();
  });

  it('P53 tripwire: the grocery_lists rules are still version 1’s', () => {
    expect(
      stableStringify(TABLES.grocery_lists.row.desc) ===
        stableStringify(TABLES_V1.grocery_lists.row.desc),
      'grocery_lists changed: decide transfer payload version 2 (item 30 design P53)',
    ).toBe(true);
  });
});

/** Every key at every depth of a payload, as three sorted sets. */
const keySets = (p: ListPayload) => ({
  top: Object.keys(p).sort(),
  list: Object.keys(p.list).sort(),
  items: [...new Set(p.list.items.flatMap((item) => Object.keys(item)))].sort(),
});

describe('G21 P9 HS-16: only the to-buy lines, eight fields each, leave the phone', () => {
  it('the key sets are exact at every depth, and the already-have line is left out', () => {
    const payload = listPayload(V3_LIST, V3_SEND);
    expect(keySets(payload)).toEqual({
      top: ['kind', 'list', 'listId', 'sentAt', 'transferId', 'v', 'version'],
      list: ['items', 'storeName'],
      items: [...TRANSFER_ITEM_FIELDS].sort(),
    });
    expect(payload.list.items.map((item) => item.text)).toEqual([
      'Example item 1',
      'Example item 2',
    ]);
  });

  it('extra own properties on the list or a line, and a __proto__ key, change nothing', () => {
    const json = JSON.stringify(V3_LIST)
      .replace('{"id"', '{"note":"zzhealth","__proto__":{"x":1},"id"')
      .replace('"text":"Example item 1"', '"note":"zzhealth","text":"Example item 1"');
    const parsed = JSON.parse(json) as GroceryListRecord;
    const payload = listPayload(parsed, V3_SEND);
    expect(payload).toEqual(listPayload(V3_LIST, V3_SEND));
    expect(bytesToHex(encodeTransferPayload(payload))).toBe(bytesToHex(utf8Encode(V3_JSON)));
  });

  it('an empty list and an all-already-have list send no lines', () => {
    expect(transferListOf({ ...V3_LIST, items: [] })).toEqual({
      storeName: 'Example store',
      items: [],
    });
    const alreadyHave = V3_LIST.items.map((item) => ({
      ...item,
      section: 'already-have' as const,
    }));
    expect(listPayload({ ...V3_LIST, items: alreadyHave }, V3_SEND).list.items).toEqual([]);
  });
});
