import { importPairingKey, type PairingCode, storedRelayUrl } from '@diet/grocery/transfer';
import { StorageClosedError, StorageFullError } from '../../db/errors';
import type { PairingRepo } from '../../db/repos/pairing';

export type SavePairingResult = 'saved' | 'save-failed' | 'storage-full' | 'records-closed';

/**
 * Saves a scanned code (item 30 design 1.6): the key is imported non-extractable before the
 * database write, and the raw key bytes are zeroed whatever happens. A code is saved whatever relay
 * address it carries; the paired card says when the relay cannot be used with it (P45). Nothing is
 * logged, and the error is dropped.
 */
export async function savePairingFromCode(
  repo: Pick<PairingRepo, 'save'>,
  code: PairingCode,
): Promise<SavePairingResult> {
  try {
    const key = await importPairingKey(code.keyBytes);
    await repo.save({ roomId: code.roomId, relayUrl: storedRelayUrl(code.relayOrigin), key });
    return 'saved';
  } catch (error) {
    if (error instanceof StorageFullError) return 'storage-full';
    if (error instanceof StorageClosedError) return 'records-closed';
    return 'save-failed';
  } finally {
    code.keyBytes.fill(0);
  }
}
