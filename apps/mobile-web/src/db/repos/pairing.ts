/**
 * The laptop pairing (storage spec sections 4.11 and 8.4; checklist item 30; C34, C49). One row at
 * a time, device only: never in a backup, a rescue copy or an export. The key is a non-extractable
 * CryptoKey imported before save() is called (WebCrypto never runs inside a transaction scope,
 * section 8.5), and the validation middleware checks it again. The generic operations of
 * transfer_pairings stay empty; this is its special repository.
 */
import type { StoredCryptoKey, TransferPairingRecord } from '@diet/core';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';

export interface PairingInput {
  readonly roomId: string;
  /** An isRelayOrigin value or NO_RELAY_URL, through storedRelayUrl. */
  readonly relayUrl: string;
  readonly key: StoredCryptoKey;
}

export interface PairingRepo {
  /** The stored pairing, or undefined. */
  readonly get: () => Promise<TransferPairingRecord | undefined>;
  /** Replaces any pairing (one at a time); pairedAt is now. */
  readonly save: (input: PairingInput) => Promise<TransferPairingRecord>;
  /** Deletes the pairing; nothing stored is fine. */
  readonly remove: () => Promise<void>;
}

export function pairingRepo(ctx: RepoContext): PairingRepo {
  const { db, env } = ctx;
  return {
    get: () => db.transfer_pairings.get('singleton'),
    save: ({ roomId, relayUrl, key }) =>
      guardedWrite(ctx, () => {
        const row = prepare(
          'transfer_pairings',
          { id: 'singleton', relayUrl, roomId, key, pairedAt: env.now() },
          env,
        );
        return db.transaction('rw', ['transfer_pairings'], () =>
          db.transfer_pairings.put(row).then(() => row),
        );
      }),
    remove: () =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['transfer_pairings'], () => db.transfer_pairings.delete('singleton')),
      ),
  };
}
