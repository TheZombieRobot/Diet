/**
 * The only place a pairing key is imported (item 30; C34). The key becomes a non-extractable
 * AES-GCM CryptoKey for encrypt and decrypt, which core's aesGcmKey validator accepts and nothing
 * can read back; the caller zeroes the raw bytes straight after.
 */
import type { StoredCryptoKey } from '@diet/core';
import { subtleKeyImport } from './globals';

export type PairingKey = StoredCryptoKey;

/** Throws RangeError('pairing key') unless `keyBytes` is exactly 32 bytes. */
export async function importPairingKey(keyBytes: Uint8Array): Promise<PairingKey> {
  if (keyBytes.length !== 32) throw new RangeError('pairing key');
  const key = await subtleKeyImport().importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  return key as PairingKey;
}
