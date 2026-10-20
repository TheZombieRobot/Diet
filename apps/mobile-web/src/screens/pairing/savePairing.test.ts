// @vitest-environment node
// Saving a scanned code (item 30 design 1.6; A7; TR-03a, C34, HS-38).
import { utf8Encode } from '@diet/core';
import {
  importPairingKey,
  openFromRelay,
  type PairingCode,
  parsePairingCode,
  sealForRelay,
} from '@diet/grocery/transfer';
import { V1_CODE, VECTOR_KEY_BYTES } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { StorageClosedError, StorageFullError } from '../../db/errors';
import { openTestDb } from '../../db/testKit';
import { savePairingFromCode } from './savePairing';

const v1 = (relay: string | null = 'https://relay.example.com'): PairingCode => {
  const parsed = parsePairingCode(V1_CODE);
  if (!parsed.ok) throw new Error('V1 does not parse');
  return { ...parsed.code, relayOrigin: relay };
};

const failingRepo = (error: Error) => ({ save: () => Promise.reject(error) });

describe('savePairingFromCode (A7)', () => {
  it('stores a key the app cannot read back, which opens what the laptop’s key opens, and zeroes the bytes', async () => {
    const test = await openTestDb();
    const code = v1();
    expect(await savePairingFromCode(test.repos.pairing, code)).toBe('saved');
    expect(code.keyBytes.every((b) => b === 0)).toBe(true);
    const stored = await test.repos.pairing.get();
    expect(stored?.key.extractable).toBe(false);
    const body = await sealForRelay(
      stored?.key ?? (await importPairingKey(new Uint8Array(32))),
      'list',
      utf8Encode('Example'),
    );
    expect(await openFromRelay(await importPairingKey(VECTOR_KEY_BYTES), 'list', body)).toEqual(
      utf8Encode('Example'),
    );
  });

  it('saves a code for another relay, or for none', async () => {
    const test = await openTestDb();
    expect(await savePairingFromCode(test.repos.pairing, v1('https://relay2.example.com'))).toBe(
      'saved',
    );
    expect((await test.repos.pairing.get())?.relayUrl).toBe('https://relay2.example.com');
    expect(await savePairingFromCode(test.repos.pairing, v1(null))).toBe('saved');
    expect((await test.repos.pairing.get())?.relayUrl).toBe('https://relay.invalid');
  });

  it.each([
    [new StorageFullError(), 'storage-full'],
    [new StorageClosedError(), 'records-closed'],
    [new Error('example'), 'save-failed'],
  ] as const)(
    'a failed save (%s) is %s, and the key bytes are still zeroed',
    async (error, result) => {
      const code = v1();
      expect(await savePairingFromCode(failingRepo(error), code)).toBe(result);
      expect(code.keyBytes.every((b) => b === 0)).toBe(true);
    },
  );
});
