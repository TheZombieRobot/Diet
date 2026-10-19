/**
 * Whole-database reads and the all-or-nothing replace (storage spec sections 10.5 step 1, 10.6
 * step 9, 10.7 and 10.8; D15, D17). Both are single transactions whose scopes are synchronous
 * and hold only Dexie requests (section 8.5): everything else (parsing, decryption, migration,
 * validation, the confirmation) happens before the transaction opens.
 */
import { BACKUP_TABLES, type Snapshot } from '@diet/core';
import Dexie from 'dexie';
import type { DietDb } from './db';

/**
 * S(db) (section 10.8): every backed-up store's rows, as toArray() returns them (primary-key
 * order), read in one read transaction so the snapshot is consistent.
 */
export function readBackupSnapshot(db: DietDb): Promise<Snapshot> {
  return db.transaction('r', BACKUP_TABLES, () =>
    Dexie.Promise.all(BACKUP_TABLES.map((name) => db.table(name).toArray())).then(
      (lists) =>
        Object.fromEntries(
          BACKUP_TABLES.map((name, i) => [name, lists[i] ?? []]),
        ) as unknown as Snapshot,
    ),
  );
}

/**
 * The import write (section 10.7): one read-write transaction over every store. Each backed-up
 * store is cleared and refilled in BACKUP_TABLES order; the laptop pairing is cleared, so a restore
 * always leaves the app unpaired; and a garden photo survives only when its garden row is in the
 * imported snapshot (a same-phone restore). The middleware validates every row again. If anything
 * fails (quota, a validation error, a bug), Dexie aborts and the database is exactly as it was.
 */
export function replaceAll(db: DietDb, snapshot: Snapshot): Promise<unknown> {
  const gardenIds = snapshot.garden.map((g) => g.id);
  return db.transaction('rw', db.expectedStoreNames, () => {
    const writes: Promise<unknown>[] = [];
    for (const name of BACKUP_TABLES) {
      writes.push(db.table(name).clear(), db.table(name).bulkAdd([...snapshot[name]]));
    }
    writes.push(db.transfer_pairings.clear());
    writes.push(db.garden_photos.where(':id').noneOf(gardenIds).delete());
    return Dexie.Promise.all(writes);
  });
}
