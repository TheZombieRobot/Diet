// What leaves the phone and the paste code that carries it (item 31 design 2.5 and 5.3; contract
// sections 5 and 8; K1, K2, K13, K14). Vectors V2, V3 and V6: packages/test-fixtures.
import { utf8Decode, utf8Encode } from '@diet/core';
import {
  groceryList25,
  groceryList300,
  groceryListSentinel,
  V2_BODY,
  V2_PLAINTEXT,
  V3_BODY,
  V3_PASTE_CHECK,
  V6_PASTE_CODE,
  VECTOR_KEY_BYTES,
} from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32';
import { openFromRelay, type SealedRelayBody, sealForRelay } from './envelope';
import { importPairingKey } from './pairingKey';
import {
  bodyFromPasteCode,
  MAX_PASTE_CODE_CHARS,
  pasteCodeFromBody,
  type PasteCodeResult,
} from './pasteCode';
import {
  decodeListPayload,
  encodeTransferPayload,
  listPayload,
  TRANSFER_ITEM_FIELDS,
} from './payload';

const SEND = {
  transferId: '00000000-0000-4000-8000-000000000031',
  sentAt: '2000-01-05T06:00:00.000Z',
};

/** A body of `length` characters in all; a plain string standing in for a sealed one. */
function bodyOf(length: number): SealedRelayBody {
  // @ts-expect-error only sealForRelay makes a SealedRelayBody (scan rule sealed-body-cast)
  const body: SealedRelayBody = `rl1.${'Ab-_9z'.repeat(length).slice(0, length - 4)}`;
  return body;
}

/** A line break every 76 characters, as email does. */
const wrapped = (code: string) => code.replace(/(.{76})/g, '$1\r\n');

describe('K1 HS-NN TR-02: only the to-buy lines leave, eight fields each (contract point 2)', () => {
  it('the sentinel list gives exactly lines a, b, c and f, with nothing kept on the phone', () => {
    const list = groceryListSentinel();
    const payload = listPayload(list, SEND);
    expect(Object.keys(payload)).toEqual([
      'kind',
      'v',
      'listId',
      'version',
      'transferId',
      'sentAt',
      'list',
    ]);
    expect(Object.keys(payload.list)).toEqual(['storeName', 'items']);
    for (const item of payload.list.items)
      expect(Object.keys(item)).toEqual([...TRANSFER_ITEM_FIELDS]);
    const ids = list.items.map((item) => item.id);
    expect(payload.list.items.map((item) => item.id)).toEqual([0, 1, 2, 5].map((i) => ids[i]));
    expect([payload.listId, payload.version]).toEqual([list.id, 3]);
    const json = utf8Decode(encodeTransferPayload(payload));
    for (const kept of [
      'amountNzCents',
      '650',
      '300 g from garden',
      'seed:',
      'zzalready-have',
      'Example item 5',
      'garden amount not entered',
      'fromGardenG',
    ]) {
      expect(json).not.toContain(kept);
    }
  });

  it('extra own properties on the list or a line, a __proto__ key included, change nothing', () => {
    const list = groceryListSentinel();
    const tampered = JSON.parse(
      JSON.stringify({ ...list, profile: { heightCm: 175 }, note: 'zzh' }).replace(
        '"text":"zzsentinel"',
        '"text":"zzsentinel","note":"zzh","__proto__":{"weight":1}',
      ),
    ) as typeof list;
    expect(listPayload(tampered, SEND)).toEqual(listPayload(list, SEND));
  });
});

describe('K2 TR-08a: the paste code carries the sealed list', () => {
  it('seal, code, read back (also with line breaks), open and decode give the same payload', async () => {
    const key = await importPairingKey(VECTOR_KEY_BYTES);
    for (const list of [groceryList25(), groceryList300().list, groceryListSentinel()]) {
      const payload = listPayload(list, SEND);
      const code = pasteCodeFromBody(
        await sealForRelay(key, 'list', encodeTransferPayload(payload)),
      );
      for (const pasted of [code, wrapped(code)]) {
        const read = bodyFromPasteCode(pasted);
        if (!read.ok) throw new Error(read.problem);
        const opened = await openFromRelay(key, 'list', read.body);
        expect(decodeListPayload(opened ?? new Uint8Array(0))).toEqual(payload);
      }
    }
  });
});

describe('K13 C12 TR-07 TR-08: reading a paste code', () => {
  const round = (body: SealedRelayBody) => bodyFromPasteCode(pasteCodeFromBody(body));
  const problem = (problem: string): PasteCodeResult => ({ ok: false, problem }) as PasteCodeResult;

  it('round trips the shortest, a middling and the longest body, through spaces and zero-width marks', () => {
    for (const length of [42, 13_500, 65_536]) {
      const body = bodyOf(length);
      expect(round(body)).toEqual({ ok: true, body });
    }
    const body = bodyOf(13_500);
    const code = pasteCodeFromBody(body);
    const noisy = `  ${wrapped(code).slice(0, 300)} \t\u00a0\u200b\u2060${wrapped(code).slice(300)}\ufeff\n`;
    expect(bodyFromPasteCode(noisy)).toEqual({ ok: true, body });
    expect(pasteCodeFromBody(bodyOf(42))).toHaveLength(51);
    expect(MAX_PASTE_CODE_CHARS).toBe(65_545);
  });

  it('names a cut, changed or foreign code', () => {
    const code = pasteCodeFromBody(bodyOf(13_500));
    const changed = code.slice(0, 100) + (code[100] === 'A' ? 'B' : 'A') + code.slice(101);
    // A right check on a middle that is no sealed list body.
    const short = `rl1.${'A'.repeat(10)}`;
    const malformed = `dl1.${short.slice(4)}.${crc32(utf8Encode(short)).toString(16).padStart(8, '0')}`;
    const cases: [string, PasteCodeResult][] = [
      [code.slice(0, 10), problem('incomplete')],
      [code.slice(0, code.length / 2), problem('incomplete')],
      [code.slice(0, -1), problem('incomplete')],
      [code.slice(0, -9), problem('incomplete')],
      [changed, problem('damaged')],
      [
        `${code.slice(0, -8)}${code.endsWith('0') ? '1' : '0'}${code.slice(-7)}`,
        problem('damaged'),
      ],
      [malformed, problem('damaged')],
      [V2_BODY, problem('not-a-code')],
      ['   ', problem('empty')],
      [`dl1.${'A'.repeat(65_542)}`, problem('too-long')],
    ];
    for (const [text, expected] of cases) expect(bodyFromPasteCode(text)).toEqual(expected);
  });

  it('makes a code only from a sealed list body, and the error does not carry the input', () => {
    // @ts-expect-error a plain string is not a SealedRelayBody
    expect(() => pasteCodeFromBody('{"items":[]}')).toThrow(new RangeError('paste code'));
  });

  it('V6: the code of V2, and the check of V3_BODY’s code, as the contract pins them', async () => {
    // @ts-expect-error a vector is a plain string, never cast (scan rule sealed-body-cast)
    expect(pasteCodeFromBody(V2_BODY)).toBe(V6_PASTE_CODE);
    expect(V6_PASTE_CODE).toHaveLength(77);
    expect(bodyFromPasteCode(V6_PASTE_CODE)).toEqual({ ok: true, body: V2_BODY });
    const opened = await openFromRelay(await importPairingKey(VECTOR_KEY_BYTES), 'list', V2_BODY);
    expect(utf8Decode(opened ?? new Uint8Array(0))).toBe(V2_PLAINTEXT);
    // @ts-expect-error a vector is a plain string
    const v3 = pasteCodeFromBody(V3_BODY);
    expect(v3).toBe(`dl1.${V3_BODY.slice(4)}.${V3_PASTE_CHECK}`);
    expect(v3).toHaveLength(408);
    expect(bodyFromPasteCode(v3)).toEqual({ ok: true, body: V3_BODY });
  });
});

describe('K14: CRC-32/ISO-HDLC', () => {
  it('matches the standard check values', () => {
    expect(crc32(utf8Encode(''))).toBe(0x00000000);
    expect(crc32(utf8Encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(utf8Encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});
