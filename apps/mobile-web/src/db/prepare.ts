/**
 * Preparing a write (storage spec sections 2.3 and 8.3; D10, D11). Every repository write goes
 * through prepare(), which is synchronous: normalise, then the environment checks, then
 * validateRow. The environment checks only make sense at the moment of writing, so they never run
 * on import, upgrade or export:
 * - every TimeZone field written with a new value is one this device's Intl recognises
 *   ('zone-unknown');
 * - profile.birthYear is not after the current year in the device zone ('future-year').
 * Values carried over unchanged from the stored row are not re-checked, so editing an old entry
 * recorded in a zone this browser does not know still saves.
 */
import {
  type Desc,
  isPlainObject,
  isValidTimeZone,
  localDateOf,
  normalizeRow,
  StorageValidationError,
  type StoreName,
  type StoreRecords,
  TABLES,
  type TableSpecs,
  validateRow,
} from '@diet/core';
import type { StorageEnv } from './env';

const isZoneDesc = (desc: Desc | undefined): boolean => {
  if (typeof desc !== 'object' || desc === null || Array.isArray(desc)) return false;
  const d = desc as { readonly type?: Desc; readonly of?: Desc };
  return d.type === 'time-zone' || (d.type === 'nullable' && isZoneDesc(d.of));
};

/** The top-level TimeZone fields of a store (every zone field in version 1 is top-level). */
export function zoneFields(table: string, specs: TableSpecs = TABLES): string[] {
  const desc = specs[table]?.row.desc;
  if (typeof desc !== 'object' || desc === null || Array.isArray(desc)) return [];
  const fields = (desc as { readonly fields?: Desc }).fields;
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return [];
  return Object.entries(fields as Readonly<Record<string, Desc>>)
    .filter(([, field]) => isZoneDesc(field))
    .map(([name]) => name);
}

const changed = (row: Record<string, unknown>, previous: unknown, field: string): boolean =>
  !isPlainObject(previous) || previous[field] !== row[field];

/** The write-time checks of section 8.3 on a normalised row. Throws StorageValidationError. */
export function checkEnvironment(
  table: string,
  row: unknown,
  previous: unknown,
  env: StorageEnv,
): void {
  if (!isPlainObject(row)) return;
  for (const field of zoneFields(table)) {
    const zone = row[field];
    if (zone !== null && changed(row, previous, field) && !isValidTimeZone(zone)) {
      throw new StorageValidationError(table, field, 'zone-unknown');
    }
  }
  if (table === 'profile' && typeof row['birthYear'] === 'number') {
    const thisYear = Number(localDateOf(env.now(), env.timeZone()).slice(0, 4));
    if (changed(row, previous, 'birthYear') && row['birthYear'] > thisYear) {
      throw new StorageValidationError(table, 'birthYear', 'future-year');
    }
  }
}

/** Normalise, check the environment, validate. Returns the new row in spec order. */
export function prepare<K extends StoreName>(
  table: K,
  candidate: unknown,
  env: StorageEnv,
  previous: unknown = null,
): StoreRecords[K] {
  const normalized = normalizeRow(table, candidate);
  checkEnvironment(table, normalized, previous, env);
  return validateRow(table, normalized);
}
