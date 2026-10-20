// The pairing key and the sealed body (item 30 design 1.8; contract section 4; G4, G7–G9, G13,
// G16, G17). Vectors V0, V2 and V5: packages/test-fixtures/src/transfer/vectors.ts.
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  bytesEqual,
  checkRow,
  isRelayBody,
  type RelaySlot,
  utf8Decode,
  utf8Encode,
} from '@diet/core';
import {
  GCM_CASE_16,
  V1_ROOM_ID,
  V2_BODY,
  V2_PLAINTEXT,
  VECTOR_KEY_BYTES,
} from '@diet/test-fixtures';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  inflateRaw,
  MAX_TRANSFER_PLAINTEXT_BYTES,
  openFromRelay,
  openRelayBody,
  type SealedRelayBody,
  sealForRelay,
  transferAdditionalData,
} from './envelope';
import type { ByteTransform } from './globals';
import { NO_RELAY_URL } from './pairingCode';
import { importPairingKey } from './pairingKey';
import { decodeListPayload } from './payload';
import {
  ascii,
  bodyBytes,
  bodyOf,
  bytesToHex,
  hexToBytes,
  nodeOpen,
  nodeSeal,
  nodeZlib,
  webCrypto,
} from './testKit';

afterEach(() => {
  vi.unstubAllGlobals();
});

const K = () => importPairingKey(VECTOR_KEY_BYTES);

describe('G4 C34 HS-(next): importPairingKey', () => {
  it('makes a non-extractable AES-GCM 256 key for encrypt and decrypt that storage accepts', async () => {
    const key = await K();
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
    const row = {
      id: 'singleton',
      relayUrl: NO_RELAY_URL,
      roomId: V1_ROOM_ID,
      key,
      pairedAt: '2000-01-05T06:00:00.000Z',
    };
    expect(checkRow('transfer_pairings', row).ok).toBe(true);
    await expect(webCrypto().subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it.each([0, 16, 31, 33])('refuses %i bytes', async (n) => {
    await expect(importPairingKey(new Uint8Array(n))).rejects.toThrow(RangeError);
  });
});

describe('G7 TR-01: AES-GCM wiring', () => {
  it('matches the published GCM test case 16 (V0)', async () => {
    const key = await importPairingKey(hexToBytes(GCM_CASE_16.keyHex));
    const iv = hexToBytes(GCM_CASE_16.ivHex);
    const aad = hexToBytes(GCM_CASE_16.additionalDataHex);
    const sealed = await aesGcmEncrypt(key, iv, aad, hexToBytes(GCM_CASE_16.plaintextHex));
    expect(bytesToHex(sealed)).toBe(GCM_CASE_16.ciphertextHex + GCM_CASE_16.tagHex);
    expect(bytesToHex(await aesGcmDecrypt(key, iv, aad, sealed))).toBe(GCM_CASE_16.plaintextHex);
  });
});

/** V2 with one byte of its decoded form changed. */
const changedV2 = (at: number, change: (b: number) => number) => {
  const bytes = bodyBytes(V2_BODY);
  bytes[at] = change(bytes[at] ?? 0);
  return bodyOf(bytes);
};

describe('G8 TR-01: opening the envelope vector V2', () => {
  it('opens V2 in the list slot only, and only under its key', async () => {
    const opened = await openFromRelay(await K(), 'list', V2_BODY);
    expect(utf8Decode(opened ?? new Uint8Array(0))).toBe(V2_PLAINTEXT);
    expect(await openRelayBody(await K(), 'ack', V2_BODY)).toEqual({
      ok: false,
      reason: 'cannot-open',
    });
    const other = await importPairingKey(webCrypto().getRandomValues(new Uint8Array(32)));
    expect(await openRelayBody(other, 'list', V2_BODY)).toEqual({
      ok: false,
      reason: 'cannot-open',
    });
  });

  it.each([
    ['the version byte changed to 2', changedV2(0, () => 2), 'unsupported-version'],
    ['a bit flipped in the IV', changedV2(5, (b) => b ^ 1), 'cannot-open'],
    ['a bit flipped in the ciphertext', changedV2(15, (b) => b ^ 1), 'cannot-open'],
    [
      'a bit flipped in the tag',
      changedV2(bodyBytes(V2_BODY).length - 1, (b) => b ^ 1),
      'cannot-open',
    ],
    ['the body cut to 28 bytes', bodyOf(bodyBytes(V2_BODY).subarray(0, 28)), 'cannot-open'],
    ['no rl1. prefix', V2_BODY.slice(4), 'not-a-body'],
    ['padding added', `${V2_BODY}=`, 'not-a-body'],
    ['raw JSON', '{"items":[]}', 'not-a-body'],
    ['a number', 7, 'not-a-body'],
    ['null', null, 'not-a-body'],
  ] as const)('%s: %s, and openFromRelay gives null', async (_name, body, reason) => {
    const key = await K();
    expect(await openRelayBody(key, 'list', body)).toEqual({ ok: false, reason });
    expect(await openFromRelay(key, 'list', body)).toBeNull();
  });
});

describe('G9 TR-01: the seal layout, checked with node:crypto and zlib', () => {
  it.each(['list', 'ack'] as const)(
    'slot %s: version byte 1, a fresh IV, opened independently',
    async (slot: RelaySlot) => {
      const key = await K();
      for (const length of [0, 1, 100, 3000]) {
        const plaintext = webCrypto().getRandomValues(new Uint8Array(length));
        const body = await sealForRelay(key, slot, plaintext);
        expect(isRelayBody(body, slot)).toBe(true);
        expect(bodyBytes(body)[0]).toBe(1);
        expect(await nodeOpen(VECTOR_KEY_BYTES, slot, body)).toEqual(plaintext);
      }
    },
  );

  it(
    'two seals of the same plaintext differ, and 1,000 seals use 1,000 IVs',
    { timeout: 30_000 },
    async () => {
      const key = await K();
      const plaintext = utf8Encode(V2_PLAINTEXT);
      const bodies = await Promise.all(
        Array.from({ length: 1000 }, () => sealForRelay(key, 'list', plaintext)),
      );
      expect(new Set(bodies.map((b) => bytesToHex(bodyBytes(b).subarray(1, 13)))).size).toBe(1000);
    },
  );
});

/** The longest valid list payload (design 1.9, P8): 500 lines, every text field full of lone surrogates. */
function worstCasePayload(): Uint8Array {
  const lone = (n: number) => '\ud800'.repeat(n);
  const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  return utf8Encode(
    JSON.stringify({
      kind: 'diet-list',
      v: 1,
      listId: id(1),
      version: 1_000_000,
      transferId: id(2),
      sentAt: '2099-12-31T23:59:59.999Z',
      list: {
        storeName: lone(80),
        items: Array.from({ length: 500 }, (_, i) => ({
          id: id(0x1000 + i),
          text: lone(100),
          quantity: 99999.99999999999,
          unit: 'pack',
          packSuggestion: lone(60),
          aisle: lone(40),
          substituteHint: lone(60),
          ticked: false,
        })),
      },
    }),
  );
}

describe('G13 P8: the inflate cap never refuses a valid list', () => {
  it('the worst-case payload is under the cap, decodes, and round-trips sealed', async () => {
    const bytes = worstCasePayload();
    expect(bytes.length).toBeGreaterThan(850_000);
    expect(bytes.length).toBeLessThan(MAX_TRANSFER_PLAINTEXT_BYTES);
    expect(decodeListPayload(bytes)).not.toBeNull();
    const key = await K();
    const opened = await openFromRelay(key, 'list', await sealForRelay(key, 'list', bytes));
    // bytesEqual: a deep equality over 860,000 elements would take seconds.
    expect(bytesEqual(opened ?? new Uint8Array(0), bytes)).toBe(true);
  });
});

/** Counts the bytes read out of every DecompressionStream made while it is in place. */
function countInflatedBytes(): { readonly read: () => number } {
  const g = globalThis as unknown as {
    DecompressionStream: new (f: 'deflate-raw') => ByteTransform;
  };
  const Real = g.DecompressionStream;
  let read = 0;
  class Counting implements ByteTransform {
    readonly writable;
    readonly readable;
    constructor(format: 'deflate-raw') {
      const inner = new Real(format);
      this.writable = inner.writable;
      this.readable = {
        getReader: () => {
          const reader = inner.readable.getReader();
          return {
            read: async () => {
              const next = await reader.read();
              read += next.value?.length ?? 0;
              return next;
            },
            cancel: () => reader.cancel(),
          };
        },
      };
    }
  }
  vi.stubGlobal('DecompressionStream', Counting);
  return { read: () => read };
}

describe('G16 P8 TR-01: damaged after a verified tag', () => {
  it('sealed bytes that are not deflate are damaged', async () => {
    const body = await nodeSeal(VECTOR_KEY_BYTES, 'list', ascii('not deflate at all'));
    expect(await openRelayBody(await K(), 'list', body)).toEqual({ ok: false, reason: 'damaged' });
  });

  it('a sealed deflate bomb is damaged, and inflating stops at the cap plus one chunk', async () => {
    const zlib = await nodeZlib();
    const bomb = zlib.deflateRawSync(new Uint8Array(4 * 1_048_576));
    const counter = countInflatedBytes();
    expect(await inflateRaw(bomb)).toBeNull();
    expect(counter.read()).toBeGreaterThan(MAX_TRANSFER_PLAINTEXT_BYTES);
    expect(counter.read()).toBeLessThan(MAX_TRANSFER_PLAINTEXT_BYTES + 65_536);
    const body = await nodeSeal(VECTOR_KEY_BYTES, 'list', bomb);
    expect(isRelayBody(body, 'list')).toBe(true);
    expect(await openRelayBody(await K(), 'list', body)).toEqual({ ok: false, reason: 'damaged' });
  });

  it.each([
    ['one byte after its end', (d: Uint8Array) => Uint8Array.of(...d, 0)],
    ['four bytes after its end', (d: Uint8Array) => Uint8Array.of(...d, 1, 2, 3, 4)],
    ['its last byte cut off', (d: Uint8Array) => d.subarray(0, -1)],
    ['no bytes at all', () => new Uint8Array(0)],
  ])('deflate data with %s is damaged, in Node as in Chrome', async (_name, change) => {
    // Node's own DecompressionStream ignores bytes after the end; Chrome's refuses them.
    const deflated = change((await nodeZlib()).deflateRawSync(ascii('Example plaintext')));
    expect(await inflateRaw(deflated)).toBeNull();
    const body = await nodeSeal(VECTOR_KEY_BYTES, 'list', deflated);
    expect(await openRelayBody(await K(), 'list', body)).toEqual({ ok: false, reason: 'damaged' });
  });

  it.each([
    ['invalid UTF-8', Uint8Array.of(0xff, 0xfe, 0x7b)],
    ['UTF-8 that is not JSON', ascii('Example plaintext')],
    ['JSON that fails the payload rules', ascii('{"kind":"diet-list","v":1}')],
  ])('%s opens to bytes that do not decode', async (_name, plaintext) => {
    const zlib = await nodeZlib();
    const body = await nodeSeal(VECTOR_KEY_BYTES, 'list', zlib.deflateRawSync(plaintext));
    const opened = await openFromRelay(await K(), 'list', body);
    expect(opened).toEqual(plaintext);
    expect(decodeListPayload(opened ?? new Uint8Array(0))).toBeNull();
  });
});

describe('G17 R34: only sealForRelay makes a SealedRelayBody', () => {
  it('a plain string, or one that passed the format check, is not a sealed body (typecheck)', async () => {
    // @ts-expect-error A plain string is not a sealed body.
    const plain: SealedRelayBody = V2_BODY;
    const checked: unknown = V2_BODY;
    if (isRelayBody(checked, 'list')) {
      // @ts-expect-error The relay's format check never narrows to a sealed body.
      const narrowed: SealedRelayBody = checked;
      expect(narrowed).toBe(plain);
    }
    const sealed: SealedRelayBody = await sealForRelay(await K(), 'list', new Uint8Array(1));
    expectTypeOf(sealed).toBeString();
    expect(transferAdditionalData('ack')).toEqual(ascii('["diet-transfer",1,"ack"]'));
  });
});
