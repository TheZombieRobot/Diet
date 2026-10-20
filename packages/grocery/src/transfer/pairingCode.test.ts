// The pairing code, base64url, the pairing check and the relay-address rule (item 30 design 1.7
// and 2.1; G1–G3, G5, G6). Vectors V1 and V5: packages/test-fixtures/src/transfer/vectors.ts.
import { checkRow, isRelayOrigin, isRelayRoomId, RELAY_ORIGIN } from '@diet/core';
import {
  V1_CHECK,
  V1_CODE,
  V1_CODE_NO_RELAY,
  V1_KEY_TEXT,
  V1_RELAY,
  V1_ROOM_ID,
  V5_CHECK,
  V5_ROOM_ID,
  VECTOR_KEY_BYTES,
} from '@diet/test-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url } from './base64url';
import {
  createPairingMaterial,
  formatPairingCode,
  NO_RELAY_URL,
  PAIRING_CHECK_LETTERS,
  pairingCheck,
  pairingCheckOfBits,
  pairingRelayStatus,
  parsePairingCode,
  storedRelayUrl,
} from './pairingCode';
import { webCrypto } from './testKit';

afterEach(() => {
  vi.restoreAllMocks();
});

const random = (n: number) => webCrypto().getRandomValues(new Uint8Array(n));
const rangeErrorWithoutInput = (run: () => unknown, input: string) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).not.toContain(input);
    return;
  }
  throw new Error('expected a RangeError');
};

describe('G1 TR-01: base64url', () => {
  it('round-trips every length from 0 to 64 bytes', () => {
    for (let n = 0; n <= 64; n++) {
      const bytes = random(n);
      const text = bytesToBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64UrlToBytes(text)).toEqual(bytes);
    }
  });

  it.each([
    ['padding', 'AAAA='],
    ['+', 'AA+A'],
    ['/', 'AA/A'],
    ['a space', 'AA A'],
    ['length 1 more than a multiple of 4', 'AAAAA'],
    ['a non-canonical last character (32 bytes)', `${V1_KEY_TEXT.slice(0, -3)}Hh9`],
    ['a non-canonical last character (16 bytes)', `${V1_ROOM_ID.slice(0, -3)}u_x`],
  ])('refuses %s with a RangeError that does not repeat the input', (_name, text) => {
    rangeErrorWithoutInput(() => base64UrlToBytes(text), text);
  });
});

const ROOM_21 = V1_ROOM_ID.slice(1);
const KEY_42 = V1_KEY_TEXT.slice(1);
const code = (room: string, key: string, relay: string) => `diet-pair:1:${room}:${key}:${relay}`;

describe('G2 TR-03 C83: parsePairingCode and formatPairingCode', () => {
  it('reads V1 and V1′ to their parts', () => {
    const withRelay = parsePairingCode(V1_CODE);
    const without = parsePairingCode(V1_CODE_NO_RELAY);
    expect(withRelay).toEqual({
      ok: true,
      code: { roomId: V1_ROOM_ID, keyBytes: VECTOR_KEY_BYTES, relayOrigin: V1_RELAY },
    });
    expect(without).toEqual({
      ok: true,
      code: { roomId: V1_ROOM_ID, keyBytes: VECTOR_KEY_BYTES, relayOrigin: null },
    });
    expect(V1_CODE).toHaveLength(104);
    expect(V1_CODE_NO_RELAY).toHaveLength(79);
  });

  it.each([
    ['a web address', 'https://example.com/x'],
    ['empty text', ''],
    ['upper case', V1_CODE.toUpperCase()],
    ['another prefix', V1_CODE.replace('diet-pair:', 'diet-pairs:')],
    ['a number', 42],
    ['null', null],
  ])('%s is not a pairing code', (_name, text) => {
    expect(parsePairingCode(text)).toEqual({ ok: false, reason: 'not-pairing-code' });
  });

  it.each([
    ['version 2', V1_CODE.replace(':1:', ':2:')],
    ['version 10', 'diet-pair:10:x'],
  ])('%s is a newer version', (_name, text) => {
    expect(parsePairingCode(text)).toEqual({ ok: false, reason: 'newer-version' });
  });

  it.each([
    ['version 0', V1_CODE.replace(':1:', ':0:')],
    ['version 01', V1_CODE.replace(':1:', ':01:')],
    ['no version', V1_CODE.replace(':1:', '::')],
    ['a room of 21 characters', code(ROOM_21, V1_KEY_TEXT, '')],
    ['a room of 23 characters', code(`${V1_ROOM_ID}A`, V1_KEY_TEXT, '')],
    ['a room ending x', code(`${V1_ROOM_ID.slice(0, -1)}x`, V1_KEY_TEXT, '')],
    ['a key of 42 characters', code(V1_ROOM_ID, KEY_42, '')],
    ['a key of 44 characters', code(V1_ROOM_ID, `${V1_KEY_TEXT}A`, '')],
    ['a key ending 9', code(V1_ROOM_ID, `${V1_KEY_TEXT.slice(0, -1)}9`, '')],
    ['a key with +', code(V1_ROOM_ID, `+${KEY_42}`, '')],
    ['a key with =', code(V1_ROOM_ID, `${KEY_42}=`, '')],
    ['an http relay', code(V1_ROOM_ID, V1_KEY_TEXT, 'http://relay.example.com')],
    ['a relay with a trailing slash', `${V1_CODE}/`],
    ['a relay with a path', `${V1_CODE}/v1`],
    ['an upper-case relay', code(V1_ROOM_ID, V1_KEY_TEXT, 'https://Relay.example.com')],
    ['a relay with a port', `${V1_CODE}:443`],
    ['the no-relay address', code(V1_ROOM_ID, V1_KEY_TEXT, NO_RELAY_URL)],
    ['a fifth field', `${V1_CODE}:x`],
    ['a trailing space', `${V1_CODE} `],
    ['a trailing line break', `${V1_CODE_NO_RELAY}\n`],
    ['a leading space', ` ${V1_CODE}`],
  ])('%s is damaged', (_name, text) => {
    expect(parsePairingCode(text)).toEqual({ ok: false, reason: 'damaged' });
  });

  it('formats exactly V1 and V1′, and refuses a bad part without repeating it', () => {
    const parts = { roomId: V1_ROOM_ID, keyBytes: VECTOR_KEY_BYTES };
    expect(formatPairingCode({ ...parts, relayOrigin: V1_RELAY })).toBe(V1_CODE);
    expect(formatPairingCode({ ...parts, relayOrigin: null })).toBe(V1_CODE_NO_RELAY);
    for (const bad of [
      { ...parts, roomId: ROOM_21, relayOrigin: null },
      { ...parts, roomId: `${V1_ROOM_ID.slice(0, -1)}x`, relayOrigin: null },
      { ...parts, keyBytes: VECTOR_KEY_BYTES.subarray(1), relayOrigin: null },
      { ...parts, relayOrigin: 'https://relay.example.com/' },
      { ...parts, relayOrigin: NO_RELAY_URL },
    ]) {
      rangeErrorWithoutInput(() => formatPairingCode(bad), bad.roomId);
    }
  });

  it('format then parse gives back the parts, for 200 new pairings', () => {
    for (let i = 0; i < 200; i++) {
      const material = createPairingMaterial();
      const relayOrigin = i % 2 === 0 ? null : V1_RELAY;
      expect(parsePairingCode(formatPairingCode({ ...material, relayOrigin }))).toEqual({
        ok: true,
        code: { ...material, relayOrigin },
      });
    }
  });
});

describe('G3 C113 C115: createPairingMaterial', () => {
  it('makes a 16-byte room and a 32-byte key from getRandomValues, different every time', () => {
    const spy = vi.spyOn(webCrypto(), 'getRandomValues');
    const made = Array.from({ length: 1000 }, () => createPairingMaterial());
    expect(spy).toHaveBeenCalled();
    for (const { roomId, keyBytes } of made) {
      expect(isRelayRoomId(roomId)).toBe(true);
      expect(base64UrlToBytes(roomId)).toHaveLength(16);
      expect(keyBytes).toHaveLength(32);
    }
    expect(new Set(made.map((m) => m.roomId)).size).toBe(1000);
    expect(new Set(made.map((m) => bytesToBase64Url(m.keyBytes))).size).toBe(1000);
  });
});

describe('G5 TR-03 P18: the pairing check', () => {
  it('is four consonants of a hash of the room id', async () => {
    expect(await pairingCheck(V1_ROOM_ID)).toBe(V1_CHECK);
    expect(await pairingCheck(V5_ROOM_ID)).toBe(V5_CHECK);
    for (let i = 0; i < 100; i++) {
      const check = await pairingCheck(createPairingMaterial().roomId);
      expect(check).toMatch(/^[BCDFGHJKMNPRSTVZ]{4}$/);
    }
  });

  it('pairingCheckOfBits reads 16 bits, most significant first, and refuses anything else', () => {
    expect(pairingCheckOfBits(0)).toBe('BBBB');
    expect(pairingCheckOfBits(65_535)).toBe('ZZZZ');
    expect(pairingCheckOfBits(0x1234)).toBe('CDFG');
    for (const bad of [-1, 65_536, 1.5]) expect(() => pairingCheckOfBits(bad)).toThrow(RangeError);
  });

  it('has 16 distinct letters and no vowel, Y, L or digit', () => {
    expect(new Set(PAIRING_CHECK_LETTERS).size).toBe(16);
    expect(PAIRING_CHECK_LETTERS).not.toMatch(/[AEIOUY0-9L]/);
  });
});

describe('G6 P4 R19 C12: the stored relay address and what it means', () => {
  it.each([
    [V1_RELAY, V1_RELAY, 'ready'],
    [V1_RELAY, 'https://relay2.example.com', 'pair-again'],
    [NO_RELAY_URL, V1_RELAY, 'pair-again'],
    [V1_RELAY, null, 'not-configured'],
    [NO_RELAY_URL, null, 'not-configured'],
  ] as const)('stored %s with the build relay %s is %s', (stored, configured, status) => {
    expect(pairingRelayStatus(stored, configured)).toBe(status);
  });

  it('stores the code’s relay, or the reserved no-relay address that the version-1 rule accepts', async () => {
    expect(storedRelayUrl(V1_RELAY)).toBe(V1_RELAY);
    expect(storedRelayUrl(null)).toBe(NO_RELAY_URL);
    expect(isRelayOrigin(NO_RELAY_URL)).toBe(true);
    expect(RELAY_ORIGIN).not.toBe(NO_RELAY_URL);
    expect(pairingRelayStatus(NO_RELAY_URL)).toBe(
      RELAY_ORIGIN === null ? 'not-configured' : 'pair-again',
    );
    const key = await webCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const row = {
      id: 'singleton',
      relayUrl: NO_RELAY_URL,
      roomId: V1_ROOM_ID,
      key,
      pairedAt: '2000-01-05T06:00:00.000Z',
    };
    expect(checkRow('transfer_pairings', row).ok).toBe(true);
  });
});
