/**
 * Local database storage, the pure core part (storage spec section 1, "Core"): field specs and
 * validators, invariants, defaults, time and Kickstart arithmetic, readiness input, the card
 * registry, migrations, and the backup file format with locking. The Dexie database, repositories
 * and screens live in the app (apps/mobile-web/src/db) and use only what this module exports.
 */
export * from './allergens';
export * from './backup/base64';
export * from './backup/crypto';
export * from './backup/decode';
export * from './backup/encode';
export * from './backup/errors';
export * from './backup/fileName';
export * from './backup/rescueImport';
export * from './backupReminder';
export * from './bookkeeping';
export * from './cards';
export * from './dates';
export * from './defaults';
export * from './derived';
export * from './invariants';
export * from './kickstart';
export * from './limits';
export * from './migrations';
export * from './overrides';
// Formats, predicates and spec types at the top level; the validator combinators (object, array,
// text, int, id, table and so on) only under `specKit`, so their short names do not crowd the
// core API. Later versions' specs/vN.ts import them directly.
export {
  type ArrayOptions,
  type Desc,
  type FieldTree,
  FORBIDDEN_KEYS,
  GENERIC_OPS,
  type GenericOp,
  type Id,
  type Instant,
  INSTANT_END,
  INSTANT_MIN,
  instantMs,
  isClockTime,
  isFailure,
  isId,
  isInstant,
  isInt,
  isJsonNumber,
  isLocalDate,
  isNote,
  isNum,
  isPlainObject,
  isRefId,
  isSeedId,
  isText,
  isTimeZoneName,
  LOCAL_DATE_MAX,
  LOCAL_DATE_MIN,
  normalizeNote,
  normalizeText,
  type ObjectRule,
  type ObjectValidator,
  OMIT,
  parseStoreSchema,
  pickByTree,
  type RefId,
  SEED_ID_MAX_LENGTH,
  type SeedId,
  STORAGE_RULES,
  type StorageRule,
  type StoredCryptoKey,
  TIME_ZONE_MAX_LENGTH,
  type TableSpec,
  type TableSpecs,
  type TimeZone,
  ValidationFailure,
  type Validator,
  YES_NO,
  type YesNo,
} from './primitives';
export * as specKit from './primitives';
export * from './profileMapping';
export * from './readiness';
export * from './records';
export * from './specs/v1';
export * from './tables';
export * from './validate';
