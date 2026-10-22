/**
 * Reading a backup file (storage spec section 10.6; BK-02, C48, C50, C99; D17, D20, D23).
 * Nothing in the database is touched here: import keeps everything in memory until its write step.
 *
 * Steps: 1 size; 2 parse; 3 envelope; 4 unlock (locked files); 5 payload shape; 6 validate against
 * the file's own version; 7 migrate; 8 validate against the current version, then the
 * cross-record invariants. In step 8 a bookkeeping time dated after latestAcceptedMs (the earlier
 * of the export and this phone's now, plus 5 minutes) is put back to that limit and the row kept,
 * and a Kickstart start, a Kickstart check or a fast start dated after it is refused
 * (bookkeeping.ts; a period or a fast that never ran is not counted from, so its start may lie
 * ahead). A 'backup' file with any failure is refused whole, and an out-of-range value
 * is never clamped (C50). A 'rescue' file is read as far as it safely can (rescueImport.ts):
 * failing rows are set aside and listed, failing singleton fields are repaired, but a failing
 * Kickstart history or safety setting refuses it. Environment checks (a zone this browser does
 * not know) are never applied (section 3.4).
 */
import {
  MAX_BACKUP_FILE_BYTES,
  PBKDF2_IMPORT_MIN_ITERATIONS,
  PBKDF2_MAX_ITERATIONS,
} from '../limits';
import { clampFutureBookkeeping, futureStartField, latestAcceptedMs } from '../bookkeeping';
import { defaultSingleton, isUntouchedSeedRow } from '../defaults';
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
import { BackupError, type BackupErrorDetail, KICKSTART_HISTORY_RULE } from './errors';
import { KICKSTART_HISTORY_TABLES, repairSingleton, resolveRescueInvariants } from './rescueImport';

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

/** The first characters of every envelope the app writes, built at run time (section 10.1). */
const BACKUP_TEXT_START = JSON.stringify({ format: BACKUP_FORMAT }).slice(0, -1);

function startsLikeBackup(text: string): boolean {
  return text
    .replace(/^\uFEFF/, '')
    .trimStart()
    .startsWith(BACKUP_TEXT_START);
}

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
    // A file that starts like a backup but does not parse (cut short, or edited) is a damaged
    // backup, not some other file: the owner should keep it rather than throw it away.
    throw new BackupError(startsLikeBackup(text) ? 'damaged' : 'not-a-backup');
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
  /**
   * Position in the file's table (for a file of the current version, or step 6), or in the
   * migrated table (step 8 of an older file).
   */
  readonly index: number;
  /** The failing field ('' for a cross-record rule). */
  readonly field: string;
  readonly rule: string;
  /** The allowed range, from spec constants (for the plain message). */
  readonly allowed: string | null;
}

/** A singleton field a rescue file could not keep, repaired (rescueImport.ts repairedValue). */
export interface ReplacedField {
  readonly table: 'profile' | 'targets' | 'settings';
  readonly field: string;
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
  /** Rescue files only: singleton fields repaired. */
  readonly replacedFields: readonly ReplacedField[];
}

export interface CheckPayloadOptions {
  readonly locked?: boolean;
  /** A test-only chain; defaults to the released MIGRATIONS. */
  readonly chain?: readonly Migration[];
}

const SINGLETONS = ['profile', 'targets', 'settings'] as const;
type SingletonName = (typeof SINGLETONS)[number];
const isSingleton = (name: string): name is SingletonName =>
  (SINGLETONS as readonly string[]).includes(name);

/** A rescue copy's Kickstart history must be imported whole or not at all (D27, D28). */
const kickstartHistoryRefused = (where: BackupErrorDetail): BackupError =>
  new BackupError('invalid-record', {
    table: where.table ?? null,
    index: where.index ?? null,
    field: where.field ?? null,
    rule: KICKSTART_HISTORY_RULE,
  });

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

  // A file from a newer version is reported as such even when its shape has changed, so the
  // owner keeps it for the newer app instead of thinking it is damaged.
  if (isPlainObject(payload) && Object.hasOwn(payload, 'schemaVersion')) {
    const version = payload.schemaVersion;
    if (typeof version === 'number' && Number.isInteger(version) && version > info.schemaVersion) {
      throw new BackupError('newer-version');
    }
  }

  // Step 5: payload shape.
  if (!isPlainObject(payload) || !hasExactKeys(payload, PAYLOAD_KEYS))
    throw new BackupError('damaged');
  const { schemaVersion, kind, exportedAt, appVersion, tables } = payload;
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
  // A rescue copy is never given a default profile, targets or settings row: the defaults are
  // the least cautious values (health-rules review). A backup is refused by the invariants.
  if (rescue && SINGLETONS.some((name) => (tables[name] as unknown[]).length !== 1)) {
    throw new BackupError('inconsistent', { rule: 'singleton' });
  }
  const setAside: SetAsideRow[] = [];
  const replacedFields: ReplacedField[] = [];
  const limitMs = latestAcceptedMs(exportedAt, env.now);
  /** A rescue singleton, repaired field by field, or the file refused for a safety setting. */
  const repaired = (
    name: SingletonName,
    row: unknown,
    specs: (typeof info.specsByVersion)[number],
    index: number,
  ): unknown => {
    const repair = repairSingleton(name, row, specs, defaultSingleton(name, exportedAt) as never);
    if (!repair.ok) {
      throw new BackupError('invalid-record', {
        table: name,
        index,
        field: repair.field,
        rule: repair.rule,
        allowed: repair.allowed,
      });
    }
    for (const field of repair.replaced) {
      if (!replacedFields.some((r) => r.table === name && r.field === field)) {
        replacedFields.push({ table: name, field });
      }
    }
    return repair.row;
  };

  // Step 6: every row against the file's own version.
  const ownSpecs = info.specsByVersion[schemaVersion] ?? {};
  const ownRows: Record<string, unknown[]> = {};
  const ownIndex: Record<string, number[]> = {};
  for (const name of expected) {
    const kept: unknown[] = [];
    const positions: number[] = [];
    (tables[name] as unknown[]).forEach((row, index) => {
      const result = checkRow(name, row, ownSpecs);
      if (result.ok) {
        kept.push(result.row);
        positions.push(index);
      } else if (!rescue) {
        throw new BackupError('invalid-record', {
          table: name,
          index,
          field: result.field,
          rule: result.rule,
          allowed: result.allowed,
        });
      } else if (KICKSTART_HISTORY_TABLES.includes(name)) {
        throw kickstartHistoryRefused({ table: name, index, field: result.field });
      } else if (isSingleton(name)) {
        kept.push(repaired(name, row, ownSpecs, index));
        positions.push(index);
      } else {
        setAside.push({
          table: name,
          index,
          field: result.field,
          rule: result.rule,
          allowed: result.allowed,
        });
      }
    });
    ownRows[name] = kept;
    ownIndex[name] = positions;
  }

  // Step 7: migrate to the current version (a step that breaks its contract throws).
  let migrated: ReturnType<typeof migrateSnapshot>;
  try {
    migrated = migrateSnapshot(schemaVersion, ownRows, env, chain);
  } catch {
    throw new BackupError('invalid-record', { rule: 'migration' });
  }
  // Positions in the file, when no migration step ran (the rows are then the same rows).
  const sameRows = schemaVersion === info.schemaVersion;
  const position = (name: string, i: number): number => (sameRows ? (ownIndex[name]?.[i] ?? i) : i);

  // Step 8: every row against the current version, with bookkeeping times dated ahead put back to
  // the limit and event starts dated ahead refused, then the invariants.
  const currentSpecs = info.specsByVersion[info.schemaVersion] ?? {};
  const current = info.backupTablesByVersion[info.schemaVersion] ?? [];
  const out: Record<string, unknown[]> = {};
  const outIndex: Record<string, number[]> = {};
  for (const name of current) {
    const kept: unknown[] = [];
    const positions: number[] = [];
    (migrated.snapshot[name] ?? []).forEach((row, i) => {
      const index = position(name, i);
      const clamped = clampFutureBookkeeping(name, row, limitMs).row;
      const result = checkRow(name, clamped, currentSpecs);
      const start = result.ok ? futureStartField(name, result.row, limitMs) : null;
      if (result.ok && start === null) {
        kept.push(result.row);
        positions.push(index);
        return;
      }
      const failure = result.ok
        ? { field: start ?? '', rule: 'future', allowed: null }
        : { field: result.field, rule: result.rule, allowed: result.allowed };
      if (!rescue) throw new BackupError('invalid-record', { table: name, index, ...failure });
      if (KICKSTART_HISTORY_TABLES.includes(name)) {
        throw kickstartHistoryRefused({ table: name, index, field: failure.field });
      }
      if (isSingleton(name)) {
        kept.push(repaired(name, clamped, currentSpecs, index));
        positions.push(index);
        return;
      }
      setAside.push({ table: name, index, ...failure });
    });
    out[name] = kept;
    outIndex[name] = positions;
  }
  if (rescue) {
    // Cross-record rules other than Kickstart's: set the offending rows aside, then check again.
    // A duplicate key in the Kickstart history refuses the file instead (D27).
    for (const name of KICKSTART_HISTORY_TABLES) {
      const rows = out[name] ?? [];
      const ids = new Set(rows.map((row) => JSON.stringify((row as { id?: unknown }).id)));
      if (ids.size !== rows.length) throw kickstartHistoryRefused({ table: name });
    }
    const resolved = resolveRescueInvariants(out);
    for (const row of resolved.setAside) {
      setAside.push({
        table: row.table,
        index: outIndex[row.table]?.[row.position] ?? row.position,
        field: '',
        rule: row.rule,
        allowed: null,
      });
    }
    Object.assign(out, resolved.tables);
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
    replacedFields,
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
  /** N: records on this phone that are not in the file (untouched seed rows not counted). */
  readonly missingFromFile: number;
  /**
   * M: records in both whose content differs from the file's copy, whatever their timestamps
   * (settings.lastBackupAt is left out of the comparison; untouched seed rows are not counted).
   */
  readonly differFromFile: number;
  /** The newest record on this phone (seed rows left out), and in the file; null when there are none. */
  readonly phoneNewest: Instant | null;
  readonly fileNewest: Instant | null;
  /** Whether the phone holds anything of the owner's (anything but untouched seed rows). */
  readonly phoneHasOwnRecords: boolean;
  /** Whether "Export what is on this phone first" is the first and default button (D17). */
  readonly exportFirst: boolean;
}

/** A row as compared on the confirmation: settings.lastBackupAt is bookkeeping, not a record change. */
function comparable(table: string, row: unknown): string {
  if (table === 'settings' && isPlainObject(row)) {
    const copy: Record<string, unknown> = { ...row };
    delete copy['lastBackupAt'];
    return stableStringify(copy);
  }
  return stableStringify(row);
}

/**
 * Whether two reads of the phone's backed-up stores hold the same records, compared as the
 * confirmation compares them (settings.lastBackupAt left out, since confirming an export made from
 * the confirmation changes it). The import write calls this inside its transaction, on the stores
 * it has just read, against the snapshot the confirmation was worked out from: when they differ,
 * something was saved since (another tab), and nothing is written (full review F12). Synchronous
 * and pure, so it may run inside a transaction scope (section 8.5).
 */
export function sameRecords(
  a: Readonly<Record<string, readonly unknown[]>>,
  b: Readonly<Record<string, readonly unknown[]>>,
): boolean {
  return BACKUP_TABLES.every((name) => {
    const left = a[name] ?? [];
    const right = b[name] ?? [];
    return (
      left.length === right.length &&
      left.every((row, i) => comparable(name, row) === comparable(name, right[i]))
    );
  });
}

/**
 * The counts on the import confirmation (section 10.6 step 9; D17; data-loss and ux reviews):
 * N records on this phone are not in the file; M records differ from their copy in the file, by
 * content (an edit to a weigh-in, a fast or a setting counts, whatever its timestamps). Rows
 * still exactly as a new database seeds them (the default drink, silverbeet and the default
 * profile, targets and settings) are not the owner's records, so a brand-new phone, or one just
 * cleared by delete-all, shows no loss. "Export what is on this phone first" is the default when
 * N or M is above zero. `phone` is the snapshot read for the confirmation and kept in memory
 * (section 8.5 rule 3).
 */
export function importConfirmation(
  phone: Snapshot,
  file: Pick<DecodedBackup, 'snapshot' | 'exportedAt'>,
): ImportConfirmation {
  let missingFromFile = 0;
  let differFromFile = 0;
  let phoneNewest: Instant | null = null;
  let fileNewest: Instant | null = null;
  let phoneHasOwnRecords = false;
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
      if (isUntouchedSeedRow(name, row)) continue;
      phoneHasOwnRecords = true;
      phoneNewest = later(phoneNewest, newestInstantOf(row));
      const key = primaryKeyString(spec, row);
      if (!fileRows.has(key)) missingFromFile += 1;
      else if (comparable(name, row) !== comparable(name, fileRows.get(key))) differFromFile += 1;
    }
  }
  const exportFirst = missingFromFile > 0 || differFromFile > 0;
  return {
    missingFromFile,
    differFromFile,
    phoneNewest,
    fileNewest,
    phoneHasOwnRecords,
    exportFirst,
  };
}
