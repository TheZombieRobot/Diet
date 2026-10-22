/**
 * The database's stores, as the current schema version defines them (storage spec sections 4.1,
 * 4.2, 8.4, 9.2 and 10.3; D1). Strings only: core does not depend on Dexie.
 *
 * TABLES_BY_VERSION, BACKUP_TABLES_BY_VERSION, DEVICE_ONLY_TABLES_BY_VERSION and
 * BACKUP_FIELDS_BY_VERSION are derived from the migration chain, so every released version's
 * lists and allow-lists stay available to import and to the rescue copy for ever.
 */
import {
  ETHANOL_DENSITY_G_PER_ML,
  MAX_ENTRY_COUNT,
  MAX_LABEL_KCAL,
  MAX_LABEL_STANDARD_DRINKS,
  MAX_SERVE_ML,
  MAX_SERVE_STANDARD_DRINKS,
} from '../alcohol/standardDrinks';
import { EARLIEST_BIRTH_YEAR } from '../energy/age';
import { PROTEIN_LIMITS_G } from '../energy/baseTargets';
import { ACTIVITY_FACTORS } from '../energy/energyEstimate';
import { FASTING_PRESET_IDS, FASTING_PRESETS, MIN_EATING_MINUTES } from '../fasting/eatingWindow';
import { CONFIDENCES, NUTRITION_SOURCES } from '../nutrition/confidence';
import { CARB_BASES, KJ_PER_KCAL, NUTRIENT_KEYS } from '../nutrition/nutrients';
import { HOUSEHOLD_SERVES_LIMITS, MAX_MY_SERVES } from '../nutrition/portion';
import { WEIGHT_LIMITS_KG } from '../weight/trend';
import { ALLERGENS, USER_ALLERGENS } from './allergens';
import { BOOKKEEPING_INSTANT_FIELDS } from './bookkeeping';
import { sha256Hex } from './backup/crypto';
import { CARD_REGISTRY } from './cards';
import * as limits from './limits';
import { chainInfo, type Migration, MIGRATIONS, SCHEMA_VERSION } from './migrations';
import type { Desc, FieldTree, TableSpec, TableSpecs } from './primitives';
import { READINESS_WORDING } from './readiness';
import type { BackupTableName, DeviceOnlyTableName, StoreName, StoreRecords } from './records';
import { STORES_V1 } from './specs/v1';
import { TABLES_V2 } from './specs/v2';

export { STORES_V1 } from './specs/v1';

/** One database for the app's single origin (C34; DECISIONS "One origin"). */
export const DB_NAME = 'diet';

/** The current version's specs (version 2: the D35 widening, item 23). */
export const TABLES: { readonly [K in StoreName]: TableSpec<StoreRecords[K]> } = TABLES_V2;

/** Every store, in the order of section 4.1. */
export const STORE_NAMES: readonly StoreName[] = Object.freeze(
  Object.keys(STORES_V1) as StoreName[],
);

const info = chainInfo(MIGRATIONS);

export const TABLES_BY_VERSION: Readonly<Record<number, TableSpecs>> = info.specsByVersion;
export const BACKUP_TABLES_BY_VERSION: Readonly<Record<number, readonly string[]>> =
  info.backupTablesByVersion;
export const DEVICE_ONLY_TABLES_BY_VERSION: Readonly<Record<number, readonly string[]>> =
  info.deviceOnlyTablesByVersion;
export const BACKUP_FIELDS_BY_VERSION: Readonly<
  Record<number, Readonly<Record<string, FieldTree>>>
> = info.backupFieldsByVersion;

/** The 26 backed-up stores of the current version, in section 4.1 order (D1). */
export const BACKUP_TABLES = (BACKUP_TABLES_BY_VERSION[SCHEMA_VERSION] ??
  []) as readonly BackupTableName[];
/** The stores that never leave the phone: garden_photos and transfer_pairings (C49). */
export const DEVICE_ONLY_TABLES = (DEVICE_ONLY_TABLES_BY_VERSION[SCHEMA_VERSION] ??
  []) as readonly DeviceOnlyTableName[];
/** The current allow-list of each backed-up store (C49). */
export const BACKUP_FIELDS = BACKUP_FIELDS_BY_VERSION[SCHEMA_VERSION] ?? {};

/** The primary key of a row as an array of its key fields' values (one, or two for card_state). */
export function primaryKeyOf(spec: Pick<TableSpec<object>, 'key'>, row: unknown): unknown[] {
  return spec.key.map((k) =>
    typeof row === 'object' && row !== null ? (row as Record<string, unknown>)[k] : undefined,
  );
}

/** A stable string for a primary key, for duplicate checks. */
export function primaryKeyString(spec: Pick<TableSpec<object>, 'key'>, row: unknown): string {
  return JSON.stringify(primaryKeyOf(spec, row));
}

/** IndexedDB order for string keys: UTF-16 code units, element by element for a compound key. */
export function comparePrimaryKeys(a: readonly unknown[], b: readonly unknown[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = typeof a[i] === 'string' ? (a[i] as string) : '';
    const y = typeof b[i] === 'string' ? (b[i] as string) : '';
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** Rows in primary-key order, as Dexie's toArray() returns them (section 10.8). */
export function sortByPrimaryKey<T>(spec: Pick<TableSpec<object>, 'key'>, rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => comparePrimaryKeys(primaryKeyOf(spec, a), primaryKeyOf(spec, b)));
}

/**
 * Every constant a validator reads, with its value (section 9.2). Part of the spec fingerprint, so
 * changing one fails the fingerprint test until a new schema version is added.
 */
export const VALIDATOR_CONSTANTS: Readonly<Record<string, Desc>> = Object.freeze({
  ...Object.fromEntries(Object.entries(limits).map(([name, value]) => [name, value as Desc])),
  WEIGHT_LIMITS_KG,
  PROTEIN_LIMITS_G,
  MAX_SERVE_ML,
  MAX_LABEL_STANDARD_DRINKS,
  MAX_LABEL_KCAL,
  MAX_SERVE_STANDARD_DRINKS,
  MAX_ENTRY_COUNT,
  MAX_MY_SERVES,
  HOUSEHOLD_SERVES_LIMITS,
  KJ_PER_KCAL,
  ETHANOL_DENSITY_G_PER_ML,
  MIN_EATING_MINUTES,
  EARLIEST_BIRTH_YEAR,
  FASTING_PRESETS: FASTING_PRESETS.map((p) => ({
    id: p.id,
    start: p.window.start,
    end: p.window.end,
  })),
  ACTIVITY_LEVELS: Object.keys(ACTIVITY_FACTORS),
  NUTRIENT_KEYS: [...NUTRIENT_KEYS],
  NUTRITION_SOURCES: [...NUTRITION_SOURCES],
  CONFIDENCES: [...CONFIDENCES],
  CARB_BASES: [...CARB_BASES],
  FASTING_PRESET_IDS: [...FASTING_PRESET_IDS],
  ALLERGENS: [...ALLERGENS],
  USER_ALLERGENS: [...USER_ALLERGENS],
});

/** JSON with object keys sorted at every level, so the same description always gives the same text. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/**
 * The stable description a fingerprint is taken of (section 9.2): every table's key, indexes,
 * backup flag, allowed operations and field validators (with each format's pattern and bounds);
 * the backed-up and device-only lists; the card registry; the readiness wording versions; the
 * bookkeeping instants that may not lie ahead (bookkeeping.ts); and the validator constants with
 * their values. How the rules and predicates behave is pinned by GOLDEN_VECTORS.
 */
export function specDescription(
  version: number = SCHEMA_VERSION,
  constants: Readonly<Record<string, unknown>> = VALIDATOR_CONSTANTS,
  chain: readonly Migration[] = MIGRATIONS,
): string {
  const chainData = chainInfo(chain);
  const specs = chainData.specsByVersion[version];
  if (specs === undefined) throw new RangeError(`No schema version ${version}`);
  return stableStringify({
    version,
    tables: Object.fromEntries(
      Object.entries(specs).map(([name, spec]) => [
        name,
        {
          schema: spec.schema,
          key: spec.key,
          indexes: spec.indexes,
          backup: spec.backup,
          ops: spec.ops,
          row: spec.row.desc,
        },
      ]),
    ),
    backupTables: chainData.backupTablesByVersion[version],
    deviceOnlyTables: chainData.deviceOnlyTablesByVersion[version],
    cardRegistry: CARD_REGISTRY,
    readinessWording: READINESS_WORDING,
    bookkeepingInstants: BOOKKEEPING_INSTANT_FIELDS,
    validatorConstants: constants,
  });
}

/** SHA-256 (hex) of specDescription; compared with SPEC_FINGERPRINTS[SCHEMA_VERSION] by a test. */
export function specFingerprint(
  version: number = SCHEMA_VERSION,
  constants: Readonly<Record<string, unknown>> = VALIDATOR_CONSTANTS,
  chain: readonly Migration[] = MIGRATIONS,
): Promise<string> {
  return sha256Hex(specDescription(version, constants, chain));
}
