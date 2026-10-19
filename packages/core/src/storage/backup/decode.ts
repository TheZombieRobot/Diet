/**
 * Reading a backup file (storage spec section 10.6; BK-02, C48, C50, C99; D17, D20, D23).
 * Nothing in the database is touched here: import keeps everything in memory until its write step.
 *
 * Steps: 1 size; 2 parse; 3 envelope; 4 unlock (locked files); 5 payload shape; 6 validate against
 * the file's own version; 7 migrate; 8 validate against the current version, then the
 * cross-record invariants. A 'backup' file with any failure is refused whole, and an out-of-range
 * value is never clamped (C50). A 'rescue' file has failing rows set aside and listed instead.
 * Environment checks (a zone this browser does not know) are never applied (section 3.4).
 */
import {
  MAX_BACKUP_FILE_BYTES,
  PBKDF2_IMPORT_MIN_ITERATIONS,
  PBKDF2_MAX_ITERATIONS,
} from '../limits';
import { defaultSingleton } from '../defaults';
import { findInvariantViolation } from '../invariants';
import {
  chainInfo,
  type Migration,
  type MigrationChange,
  type MigrationEnv,
  MIGRATIONS,
  migrateSnapshot,
} from '../migrations';
import { type Instant, isInstant, isPlainObject, isText } from '../primitives';
import { BACKUP_TABLES, primaryKeyString, stableStringify, TABLES } from '../tables';
import type { Snapshot } from '../records';
import { checkRow } from '../validate';
import { base64ToBytes } from './base64';
import {
  aesGcmDecrypt,
  BACKUP_ENVELOPE_VERSION,
  BACKUP_FORMAT,
  type BackupKey,
  CIPHER_KEY_BITS,
  CIPHER_NAME,
  deriveBackupKey,
  IV_BYTES,
  KDF_HASH,
  KDF_NAME,
  type LockHeader,
  lockAdditionalData,
  normalizeBackupPassword,
  SALT_BYTES,
  TAG_BITS,
  utf8Decode,
} from './crypto';
import { BackupError } from './errors';

export type BackupKind = 'backup' | 'rescue';

/** The payload inside every envelope (section 10.2). */
export interface BackupPayload {
  schemaVersion: number;
  kind: BackupKind;
  exportedAt: Instant;
  appVersion: string;
  tables: Record<string, unknown[]>;
}

export type ParsedBackup =
  | { readonly encrypted: false; readonly payload: unknown }
  | {
      readonly encrypted: true;
      readonly header: LockHeader;
      readonly salt: Uint8Array;
      readonly iv: Uint8Array;
      readonly ciphertext: Uint8Array;
    };

const PLAIN_KEYS = ['format', 'version', 'encrypted', 'payload'];
const LOCKED_KEYS = ['format', 'version', 'encrypted', 'kdf', 'cipher', 'ciphertext'];
const PAYLOAD_KEYS = ['schemaVersion', 'kind', 'exportedAt', 'appVersion', 'tables'];
const APP_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(value, k));
}

/** UTF-8 length of a string, for the size limit when the caller has no file size. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function decodeBase64(text: unknown, bytes: number | null): Uint8Array {
  if (typeof text !== 'string') throw new BackupError('damaged');
  let out: Uint8Array;
  try {
    out = base64ToBytes(text);
  } catch {
    throw new BackupError('damaged');
  }
  if (bytes !== null && out.length !== bytes) throw new BackupError('damaged');
  return out;
}

/**
 * Steps 1 to 3, and the header part of step 4: the size, the JSON, the envelope and (for a locked
 * file) the header, all before any key derivation. Iterations outside 600,000–10,000,000 are
 * refused as damaged, so a doctored file cannot hang the phone.
 */
export function parseBackupText(text: string, sizeBytes: number | null = null): ParsedBackup {
  if ((sizeBytes ?? utf8ByteLength(text)) > MAX_BACKUP_FILE_BYTES)
    throw new BackupError('too-large');
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new BackupError('not-a-backup');
  }
  if (!isPlainObject(file) || !Object.hasOwn(file, 'format') || file.format !== BACKUP_FORMAT) {
    throw new BackupError('not-a-backup');
  }
  const version = Object.hasOwn(file, 'version') ? file.version : undefined;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < BACKUP_ENVELOPE_VERSION
  ) {
    throw new BackupError('unsupported-version');
  }
  if (version > BACKUP_ENVELOPE_VERSION) throw new BackupError('newer-version');
  const encrypted = Object.hasOwn(file, 'encrypted') ? file.encrypted : undefined;
  if (typeof encrypted !== 'boolean') throw new BackupError('damaged');
  if (!hasExactKeys(file, encrypted ? LOCKED_KEYS : PLAIN_KEYS)) throw new BackupError('damaged');
  if (!encrypted) return { encrypted: false, payload: file.payload };

  const { kdf, cipher } = file;
  if (!isPlainObject(kdf) || !hasExactKeys(kdf, ['name', 'hash', 'iterations', 'salt']))
    throw new BackupError('damaged');
  if (!isPlainObject(cipher) || !hasExactKeys(cipher, ['name', 'length', 'iv', 'tagLength'])) {
    throw new BackupError('damaged');
  }
  const { iterations } = kdf;
  if (
    kdf.name !== KDF_NAME ||
    kdf.hash !== KDF_HASH ||
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < PBKDF2_IMPORT_MIN_ITERATIONS ||
    iterations > PBKDF2_MAX_ITERATIONS ||
    cipher.name !== CIPHER_NAME ||
    cipher.length !== CIPHER_KEY_BITS ||
    cipher.tagLength !== TAG_BITS
  ) {
    throw new BackupError('damaged');
  }
  const salt = decodeBase64(kdf.salt, SALT_BYTES);
  const iv = decodeBase64(cipher.iv, IV_BYTES);
  const ciphertext = decodeBase64(file.ciphertext, null);
  if (ciphertext.length < TAG_BITS / 8) throw new BackupError('damaged');
  return {
    encrypted: true,
    header: { iterations, salt: kdf.salt as string, iv: cipher.iv as string },
    salt,
    iv,
    ciphertext,
  };
}

type LockedBackup = Extract<ParsedBackup, { encrypted: true }>;

/** Decrypts a locked file with a key already derived (export verification). Rejects on any mismatch. */
export function decryptWithKey(locked: LockedBackup, key: BackupKey): Promise<Uint8Array> {
  return aesGcmDecrypt(key, locked.iv, lockAdditionalData(locked.header), locked.ciphertext);
}

/**
 * The rest of step 4: derive the key from the password (trimmed, NFC) and the file's own
 * iterations and salt, decrypt with the header as additional data, and parse the plaintext. Any
 * decryption failure is 'wrong-password-or-damaged' ("Wrong password, or the file is damaged.
 * Nothing was imported."); retrying is allowed and there is no lockout (BK-02).
 */
export async function unlockBackup(locked: LockedBackup, password: string): Promise<unknown> {
  let plain: Uint8Array;
  try {
    const key = await deriveBackupKey(
      normalizeBackupPassword(password),
      locked.salt,
      locked.header.iterations,
      ['decrypt'],
    );
    plain = await decryptWithKey(locked, key);
  } catch {
    throw new BackupError('wrong-password-or-damaged');
  }
  try {
    return JSON.parse(utf8Decode(plain));
  } catch {
    throw new BackupError('damaged');
  }
}

/** A row a rescue file could not keep, listed by store, position and rule only (never values). */
export interface SetAsideRow {
  readonly table: string;
  /** Position in the file's table (step 6) or in the migrated table (step 8). */
  readonly index: number;
  readonly field: string;
  readonly rule: string;
}

export interface DecodedBackup {
  /** The current version's backed-up stores, validated, in file order (primary-key order). */
  readonly snapshot: Snapshot;
  readonly kind: BackupKind;
  /** The file's own schema version. */
  readonly schemaVersion: number;
  readonly exportedAt: Instant;
  readonly appVersion: string;
  readonly locked: boolean;
  /** Values changed by migration (listed on the confirmation; already added as audit rows). */
  readonly changes: readonly MigrationChange[];
  /** The update-notice trigger to show after the write, or null. */
  readonly updateNotice: string | null;
  /** Rescue files only: rows set aside. */
  readonly setAside: readonly SetAsideRow[];
  /** Rescue files only: singletons replaced by their defaults. */
  readonly replacedSingletons: readonly ('profile' | 'targets' | 'settings')[];
}

export interface CheckPayloadOptions {
  readonly locked?: boolean;
  /** A test-only chain; defaults to the released MIGRATIONS. */
  readonly chain?: readonly Migration[];
}

const SINGLETONS = ['profile', 'targets', 'settings'] as const;

/**
 * Steps 5 to 8 on a parsed payload: shape, own-version validation, migration, current-version
 * validation and invariants. Also the export self-check, run on the plain file text in memory.
 */
export function checkBackupPayload(
  payload: unknown,
  env: MigrationEnv,
  options: CheckPayloadOptions = {},
): DecodedBackup {
  const chain = options.chain ?? MIGRATIONS;
  const info = chainInfo(chain);

  // Step 5: payload shape.
  if (!isPlainObject(payload) || !hasExactKeys(payload, PAYLOAD_KEYS))
    throw new BackupError('damaged');
  const { schemaVersion, kind, exportedAt, appVersion, tables } = payload;
  if (
    typeof schemaVersion === 'number' &&
    Number.isInteger(schemaVersion) &&
    schemaVersion > info.schemaVersion
  ) {
    throw new BackupError('newer-version');
  }
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new BackupError('unsupported-version');
  }
  if (kind !== 'backup' && kind !== 'rescue') throw new BackupError('damaged');
  if (!isInstant(exportedAt)) throw new BackupError('damaged');
  if (!isText(appVersion, 1, 40) || !APP_VERSION_RE.test(appVersion))
    throw new BackupError('damaged');
  if (!isPlainObject(tables)) throw new BackupError('damaged');
  const expected = info.backupTablesByVersion[schemaVersion] ?? [];
  const deviceOnly = new Set(Object.values(info.deviceOnlyTablesByVersion).flat());
  for (const name of expected) {
    if (!Object.hasOwn(tables, name))
      throw new BackupError('invalid-record', { table: name, rule: 'missing' });
  }
  for (const name of Reflect.ownKeys(tables)) {
    if (typeof name === 'string' && expected.includes(name)) continue;
    // A name read from the file is never echoed: only a known device-only store is named.
    const known = typeof name === 'string' && deviceOnly.has(name) ? name : null;
    throw new BackupError('invalid-record', { table: known, rule: 'extra-key' });
  }
  for (const name of expected) {
    if (!Array.isArray(tables[name]))
      throw new BackupError('invalid-record', { table: name, rule: 'type' });
  }

  const rescue = kind === 'rescue';
  const setAside: SetAsideRow[] = [];

  // Step 6: every row against the file's own version.
  const ownSpecs = info.specsByVersion[schemaVersion] ?? {};
  const ownRows: Record<string, unknown[]> = {};
  for (const name of expected) {
    const kept: unknown[] = [];
    (tables[name] as unknown[]).forEach((row, index) => {
      const result = checkRow(name, row, ownSpecs);
      if (result.ok) kept.push(result.row);
      else if (rescue)
        setAside.push({ table: name, index, field: result.field, rule: result.rule });
      else {
        throw new BackupError('invalid-record', {
          table: name,
          index,
          field: result.field,
          rule: result.rule,
          allowed: result.allowed,
        });
      }
    });
    ownRows[name] = kept;
  }

  // Step 7: migrate to the current version.
  let migrated: ReturnType<typeof migrateSnapshot>;
  try {
    migrated = migrateSnapshot(schemaVersion, ownRows, env, chain);
  } catch {
    throw new BackupError('invalid-record');
  }

  // Step 8: every row against the current version, then the invariants.
  const currentSpecs = info.specsByVersion[info.schemaVersion] ?? {};
  const current = info.backupTablesByVersion[info.schemaVersion] ?? [];
  const out: Record<string, unknown[]> = {};
  const replacedSingletons: ('profile' | 'targets' | 'settings')[] = [];
  for (const name of current) {
    const kept: unknown[] = [];
    (migrated.snapshot[name] ?? []).forEach((row, index) => {
      const result = checkRow(name, row, currentSpecs);
      if (result.ok) kept.push(result.row);
      else if (rescue)
        setAside.push({ table: name, index, field: result.field, rule: result.rule });
      else {
        throw new BackupError('invalid-record', {
          table: name,
          index,
          field: result.field,
          rule: result.rule,
          allowed: result.allowed,
        });
      }
    });
    out[name] = kept;
  }
  if (rescue) {
    for (const name of SINGLETONS) {
      if (out[name]?.length === 0) {
        out[name] = [defaultSingleton(name, env.now)];
        replacedSingletons.push(name);
      }
    }
  }
  const snapshot = out as unknown as Snapshot;
  const rule = findInvariantViolation(snapshot);
  if (rule !== null) throw new BackupError('inconsistent', { rule });

  return {
    snapshot,
    kind,
    schemaVersion,
    exportedAt,
    appVersion,
    locked: options.locked ?? false,
    changes: migrated.changes,
    updateNotice: migrated.updateNotice,
    setAside,
    replacedSingletons,
  };
}

export interface DecodeOptions {
  /** Required for a locked file; ignored for a plain one. */
  readonly password?: string | null;
  readonly env: MigrationEnv;
  /** The file's size in bytes, when known (step 1). */
  readonly sizeBytes?: number | null;
  readonly chain?: readonly Migration[];
}

/**
 * Every import step before the write, in one call. Returns the validated, migrated snapshot, or
 * throws a BackupError; it never throws anything else for any input (section 16 test 19).
 */
export async function decodeBackupText(
  text: string,
  options: DecodeOptions,
): Promise<DecodedBackup> {
  const parsed = parseBackupText(text, options.sizeBytes ?? null);
  let payload: unknown;
  if (parsed.encrypted) {
    if (options.password === undefined || options.password === null)
      throw new BackupError('wrong-password-or-damaged');
    payload = await unlockBackup(parsed, options.password);
  } else {
    payload = parsed.payload;
  }
  return checkBackupPayload(payload, options.env, {
    locked: parsed.encrypted,
    ...(options.chain === undefined ? {} : { chain: options.chain }),
  });
}

/** The instants that date a record for the import confirmation; never lastBackupAt (section 10.6 step 9). */
const RECORD_INSTANT_FIELDS = [
  'updatedAt',
  'createdAt',
  'at',
  'startedAt',
  'endedAt',
  'enteredAt',
  'answeredAt',
  'askedAt',
  'completedAt',
  'dismissedAt',
  'doneAt',
  'firstShownAt',
] as const;

/** The newest of a record's dating instants, or null when it has none. */
export function newestInstantOf(row: unknown): Instant | null {
  if (!isPlainObject(row)) return null;
  let newest: Instant | null = null;
  for (const field of RECORD_INSTANT_FIELDS) {
    const value = row[field];
    if (isInstant(value) && (newest === null || value > newest)) newest = value;
  }
  return newest;
}

export interface ImportConfirmation {
  /** N: records on this phone that are not in the file. */
  readonly missingFromFile: number;
  /** M: records in both, changed on this phone after the file was made, and different from the file's copy. */
  readonly changedAfterExport: number;
  /** The newest record on this phone, and in the file (null when there are none). */
  readonly phoneNewest: Instant | null;
  readonly fileNewest: Instant | null;
  /** Whether "Export what is on this phone first" is the first and default button (D17). */
  readonly exportFirst: boolean;
}

/**
 * The counts on the import confirmation (section 10.6 step 9; D17): "This replaces everything on
 * this phone. N records on this phone are not in the file. M records on this phone were changed
 * after the file was made. Newest record on this phone: …; in the file: …". When N or M is above
 * zero, or the phone's newest record is later than the file's export time, the default button is
 * "Export what is on this phone first". `phone` is the snapshot read for the confirmation and kept
 * in memory (section 8.5 rule 3).
 */
export function importConfirmation(
  phone: Snapshot,
  file: Pick<DecodedBackup, 'snapshot' | 'exportedAt'>,
): ImportConfirmation {
  let missingFromFile = 0;
  let changedAfterExport = 0;
  let phoneNewest: Instant | null = null;
  let fileNewest: Instant | null = null;
  const later = (a: Instant | null, b: Instant | null) =>
    b !== null && (a === null || b > a) ? b : a;
  for (const name of BACKUP_TABLES) {
    const spec = TABLES[name];
    const fileRows = new Map<string, unknown>();
    for (const row of file.snapshot[name]) {
      fileRows.set(primaryKeyString(spec, row), row);
      fileNewest = later(fileNewest, newestInstantOf(row));
    }
    for (const row of phone[name]) {
      const newest = newestInstantOf(row);
      phoneNewest = later(phoneNewest, newest);
      const key = primaryKeyString(spec, row);
      if (!fileRows.has(key)) missingFromFile += 1;
      else if (
        newest !== null &&
        newest > file.exportedAt &&
        stableStringify(row) !== stableStringify(fileRows.get(key))
      ) {
        changedAfterExport += 1;
      }
    }
  }
  const exportFirst =
    missingFromFile > 0 ||
    changedAfterExport > 0 ||
    (phoneNewest !== null && phoneNewest > file.exportedAt);
  return { missingFromFile, changedAfterExport, phoneNewest, fileNewest, exportFirst };
}
