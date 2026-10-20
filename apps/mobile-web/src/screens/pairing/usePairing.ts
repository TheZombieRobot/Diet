import type { TransferPairingRecord } from '@diet/core';
import { pairingCheck } from '@diet/grocery/transfer';
import { useEffect, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { useStore } from '../../store';

const readPairing = (storage: AppStorage): Promise<TransferPairingRecord | null> =>
  storage.repos.pairing.get().then((row) => row ?? null);

/** The live pairing (item 30): undefined while loading, null when this phone is not paired. */
export function usePairing(): TransferPairingRecord | null | undefined {
  return useLiveQuery(useStore(appStorageStore), readPairing);
}

/** The four-letter pairing check of a room, or null until it is computed (never a placeholder). */
export function usePairingCheck(roomId: string | null): string | null {
  const [computed, setComputed] = useState<{ roomId: string; check: string } | null>(null);
  useEffect(() => {
    if (roomId === null) return;
    let cancelled = false;
    void pairingCheck(roomId).then((check) => {
      if (!cancelled) setComputed({ roomId, check });
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);
  return computed !== null && computed.roomId === roomId ? computed.check : null;
}
