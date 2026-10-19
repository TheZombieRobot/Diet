/**
 * The rescue copy after a failed upgrade (storage spec section 9.5; D23). Dexie is not used: the
 * upgrade that failed would run again. The installed version is found with installedNativeVersion,
 * the database is opened with no version (and the open is aborted if it does not exist), and the
 * stores that version backs up are read in one read-only transaction. A listed store that does not
 * exist is written as an empty array. Device-only stores are never read. Rows are then built from
 * that version's allow-list alone (createRescueFile), otherwise unvalidated.
 */
import { BACKUP_TABLES_BY_VERSION, DB_NAME } from '@diet/core';
import { installedNativeVersion } from './db';

export interface RescueRows {
  /** The installed schema version: Math.floor(native version / 10). */
  readonly schemaVersion: number;
  readonly tables: Readonly<Record<string, unknown[]>>;
}

function openExisting(factory: IDBFactory, name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) request.transaction?.abort();
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = (event) => {
      if (request.error?.name === 'AbortError') {
        event.preventDefault();
        resolve(null);
      } else {
        reject(request.error ?? new Error('IndexedDB could not be opened'));
      }
    };
  });
}

function readStores(db: IDBDatabase, names: readonly string[]): Promise<Record<string, unknown[]>> {
  const present = names.filter((name) => db.objectStoreNames.contains(name));
  const out: Record<string, unknown[]> = Object.fromEntries(names.map((name) => [name, []]));
  if (present.length === 0) return Promise.resolve(out);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(present, 'readonly');
    for (const name of present) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => {
        out[name] = request.result as unknown[];
      };
    }
    tx.oncomplete = () => {
      resolve(out);
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('The records could not be read'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('The records could not be read'));
    };
  });
}

/** The rows a rescue copy is made from, or null when there is no database (or no known version). */
export async function readRescueRows(
  factory: IDBFactory,
  name: string = DB_NAME,
): Promise<RescueRows | null> {
  const native = await installedNativeVersion(factory, name);
  if (native === null) return null;
  const schemaVersion = Math.floor(native / 10);
  const listed = BACKUP_TABLES_BY_VERSION[schemaVersion];
  if (listed === undefined) return null;
  const db = await openExisting(factory, name);
  if (db === null) return null;
  try {
    return { schemaVersion, tables: await readStores(db, listed) };
  } finally {
    db.close();
  }
}
