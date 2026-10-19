import { beforeAll, describe, expect, it } from 'vitest';
import { webCrypto, type BackupKey } from '../storage/backup/crypto';
import { RELAY_TTL_MS } from '../storage/limits';
import { VALIDATOR_CONSTANTS } from '../storage/tables';
import { checkRow } from '../storage/validate';
import * as protocol from './protocol';
import {
  APP_ORIGIN,
  isRelayBody,
  isRelayOrigin,
  isRelayRoomId,
  MAX_RELAY_ACK_BODY_BYTES,
  MAX_RELAY_BODY_BYTES,
  RELAY_ORIGIN,
  RELAY_TEST_TTL_SECONDS,
  RELAY_TTL_SECONDS,
  RELAY_TTL_SECONDS_BOUNDS,
  relayBodyFits,
  relayEndpoint,
  relayOutcome,
  type RelaySlot,
} from './protocol';

/** `rl1.` and `length - 4` base64url characters. */
const body = (length: number, fill = 'A') => `rl1.${fill.repeat(length - 4)}`;

describe('T1. Relay constants (C114, TR-05, TR-06)', () => {
  it('pins the caps, the expiries and the origins', () => {
    expect(MAX_RELAY_BODY_BYTES).toBe(65_536);
    expect(MAX_RELAY_ACK_BODY_BYTES).toBe(4_096);
    expect(RELAY_TTL_SECONDS * 1000).toBe(RELAY_TTL_MS);
    expect(RELAY_TEST_TTL_SECONDS).toBe(120);
    expect(RELAY_TEST_TTL_SECONDS).toBeGreaterThanOrEqual(RELAY_TTL_SECONDS_BOUNDS.min);
    expect(RELAY_TEST_TTL_SECONDS).toBeLessThanOrEqual(RELAY_TTL_SECONDS_BOUNDS.max);
    expect(isRelayOrigin(APP_ORIGIN)).toBe(true);
    expect(RELAY_ORIGIN === null || isRelayOrigin(RELAY_ORIGIN)).toBe(true);
  });

  it('adds nothing to the storage fingerprint (VALIDATOR_CONSTANTS)', () => {
    const inFingerprint = Object.keys(protocol).filter((name) =>
      Object.hasOwn(VALIDATOR_CONSTANTS, name),
    );
    expect(inFingerprint).toEqual([]);
  });
});

describe('T2. isRelayRoomId agrees with the stored room id rule (C113)', () => {
  let key: BackupKey;
  beforeAll(async () => {
    key = await webCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
  });

  it.each<[unknown, boolean]>([
    ['ExampleRoomId00000000A', true],
    ['Example-Room_Id0000000', true],
    ['0123456789012345678901', true],
    ['ExampleRoomId00000000', false],
    ['ExampleRoomId00000000AB', false],
    ['ExampleRoomId0000000+A', false],
    ['ExampleRoomId0000000/A', false],
    ['ExampleRoomId0000000A=', false],
    ['ExampleRoomId0000000 A', false],
    ['ExampleRoomId0000000éA', false],
    ['', false],
    [null, false],
    [22, false],
  ])('%j → %s', (value, expected) => {
    expect(isRelayRoomId(value)).toBe(expected);
    if (typeof value !== 'string') return;
    const pairing = {
      id: 'singleton',
      relayUrl: 'https://relay.example.com',
      roomId: value,
      key,
      pairedAt: '2000-01-05T00:00:00.000Z',
    };
    expect(checkRow('transfer_pairings', pairing).ok).toBe(expected);
  });
});

describe('T3. isRelayBody and relayBodyFits (TR-05; the format part of TR-02)', () => {
  it.each<[string, unknown, RelaySlot, boolean]>([
    ['list, 42 characters (the shortest)', body(42), 'list', true],
    ['list, 41 characters (an impossible length)', body(41), 'list', false],
    ['list, 40 characters (27 bytes)', body(40), 'list', false],
    ['list, exactly the cap', body(65_536), 'list', true],
    ['list, one over the cap', body(65_537), 'list', false],
    ['list, two over the cap', body(65_538), 'list', false],
    ['ack, exactly the cap', body(4_096), 'ack', true],
    ['ack, one over the cap', body(4_097), 'ack', false],
    ['ack, two over the cap', body(4_098), 'ack', false],
    ['the list as JSON', '{"items":[]}', 'list', false],
    ['a space', `rl1. ${'A'.repeat(43)}`, 'list', false],
    ['padding', `${body(47)}=`, 'list', false],
    ['a plus sign', `rl1.AA+${'A'.repeat(41)}`, 'list', false],
    ['another prefix', `rl2.${'A'.repeat(44)}`, 'list', false],
    ['a line break', `rl1.${'A'.repeat(20)}\n${'A'.repeat(23)}`, 'list', false],
    ['not a string', 42, 'list', false],
  ])('%s', (_name, value, slot, expected) => {
    expect(isRelayBody(value, slot)).toBe(expected);
    if (typeof value === 'string' && /^rl1\.A+$/.test(value)) {
      expect(relayBodyFits(value, slot)).toBe(value.length <= (slot === 'list' ? 65_536 : 4_096));
    }
  });
});

describe('T4. Relay endpoints and outcomes (C80, C81, C114, TR-06, R32)', () => {
  it.each([
    'http://relay.example.com',
    'https://Relay.example.com',
    'https://relay.example.com:8443',
    'https://relay.example.com/v1',
    'https://relay.example.com/',
    'https://192.0.2.1',
  ])('isRelayOrigin refuses %j', (origin) => {
    expect(isRelayOrigin(origin)).toBe(false);
  });

  it('builds the slot address, and never repeats a refused origin', () => {
    expect(relayEndpoint(APP_ORIGIN, 'ack')).toBe('https://thezombierobot.github.io/v1/ack');
    expect(() => relayEndpoint('http://secret-host.example', 'list')).toThrow(
      new RangeError('relay origin'),
    );
  });

  it.each<['GET' | 'POST', number | null, string]>([
    ['POST', 204, 'stored'],
    ['GET', 200, 'delivered'],
    ['GET', 204, 'nothing-waiting'],
    ['POST', 413, 'too-large'],
    ['POST', 400, 'refused'],
    ['POST', 415, 'refused'],
    ['GET', 400, 'refused'],
    ['POST', 200, 'unavailable'],
    ['POST', 403, 'unavailable'],
    ['POST', 404, 'unavailable'],
    ['POST', 405, 'unavailable'],
    ['POST', 429, 'unavailable'],
    ['POST', 500, 'unavailable'],
    ['POST', 503, 'unavailable'],
    ['POST', null, 'unavailable'],
    // The laptop's and the phone's polls: only 204 means nothing is waiting (TR-06, TR-07).
    ['GET', 415, 'refused'],
    ['GET', 403, 'unavailable'],
    ['GET', 404, 'unavailable'],
    ['GET', 405, 'unavailable'],
    ['GET', 429, 'unavailable'],
    ['GET', 500, 'unavailable'],
    ['GET', 503, 'unavailable'],
    ['GET', null, 'unavailable'],
  ])('relayOutcome(%s, %j) is %s', (method, status, outcome) => {
    expect(relayOutcome(method, status)).toBe(outcome);
  });
});
