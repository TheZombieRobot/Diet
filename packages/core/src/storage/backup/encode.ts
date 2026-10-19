/**
 * Writing a backup file (storage spec sections 9.5, 10.2–10.5; C49, C99; D19–D23).
 *
 * - Rows are built from the allow-list alone (BACKUP_FIELDS_BY_VERSION), so a stray property can
 *   never leak, and the device-only stores (transfer_pairings, garden_photos) are never written.
 * - Rows are sorted by primary key and fields are in spec order, so the same database always gives
 *   the same bytes apart from exportedAt.
 * - Export checks its own output with the import validator, and a locked file is re-parsed,
 *   decrypted with the key already derived and compared byte for byte before it is offered.
 * - The rescue copy is built from a version's allow-list without validation, locked by default,
 *   and never counts as a backup.
 */
import { PBKDF2_EXPORT_ITERATIONS } from '../limits';
import { chainInfo, type Migration, type MigrationEnv, MIGRATIONS } from '../migrations';
import { type Instant, isPlainObject, pickByTree } from '../primitives';
import { sortByPrimaryKey } from '../tables';
import { bytesToBase64 } from './base64';
import {
  aesGcmEncrypt,
  BACKUP_ENVELOPE_VERSION,
  BACKUP_FORMAT,
  BACKUP_PASSWORD_LENGTH,
  bytesEqual,
  CIPHER_KEY_BITS,
  CIPHER_NAME,
  deriveBackupKey,
  IV_BYTES,
  KDF_HASH,
  KDF_NAME,
  type LockHeader,
  lockAdditionalData,
  normalizeBackupPassword,
  randomBytes,
  SALT_BYTES,
  TAG_BITS,
  utf8Encode,
} from './crypto';
import {
  type BackupKind,
  type BackupPayload,
  checkBackupPayload,
  decryptWithKey,
  parseBackupText,
} from './decode';
import { BackupError, BackupExportError } from './errors';

/** Any table map: the backed-up stores, and possibly device-only ones, which are ignored. */
export type BackupTablesInput = Readonly<Record<string, readonly unknown[] | undefined>>;

export interface PayloadMeta {
  readonly kind: BackupKind;
  readonly exportedAt: Instant;
  readonly appVersion: string;
  /** The schema version whose allow-list to use; defaults to the chain's current version. */
  readonly schemaVersion?: number;
  readonly chain?: readonly Migration[];
}

/**
 * The payload: every backed-up store of the version (an empty array when it has no rows), each
 * row picked from the allow-list in spec order, sorted by primary key. Only plain-object rows are
 * kept. Nothing is validated here.
 */
export function buildBackupPayload(tables: BackupTablesInput, meta: PayloadMeta): BackupPayload {
  const info = chainInfo(meta.chain ?? MIGRATIONS);
  const version = meta.schemaVersion ?? info.schemaVersion;
  const names = info.backupTablesByVersion[version];
  const specs = info.specsByVersion[version];
  const fields = info.backupFieldsByVersion[version];
  if (names === undefined || specs === undefined || fields === undefined) {
    throw new RangeError(`No schema version ${version}`);
  }
  const out: Record<string, unknown[]> = {};
  for (const name of names) {
    const rows = (tables[name] ?? [])
      .filter(isPlainObject)
      .map((row) => pickByTree(row, fields[name] ?? {}));
    out[name] = sortByPrimaryKey(specs[name] ?? { key: [] }, rows);
  }
  return {
    schemaVersion: version,
    kind: meta.kind,
    exportedAt: meta.exportedAt,
    appVersion: meta.appVersion,
    tables: out,
  };
}

/** The plain envelope text: JSON with no indentation, format first. */
export function plainBackupText(payload: BackupPayload): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_ENVELOPE_VERSION,
    encrypted: false,
    payload,
  });
}

/** Test seams for the export self-verification tests (section 16 test 14). Never used by the app. */
export interface EncodeSeams {
  readonly additionalData?: (header: LockHeader) => Uint8Array;
  readonly base64?: (bytes: Uint8Array) => string;
}

export interface LockOptions {
  /** PBKDF2 iterations; defaults to PBKDF2_EXPORT_ITERATIONS. */
  readonly iterations?: number;
  /** Source of the salt and IV; defaults to crypto.getRandomValues (a fresh salt and IV every file). */
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly seams?: EncodeSeams;
}

/** Normalises the password (trim, NFC) and applies the 10–1,000 character rule. */
function exportPassword(password: string): string {
  const normalized = normalizeBackupPassword(password);
  if (normalized.length < BACKUP_PASSWORD_LENGTH.min)
    throw new BackupExportError('password-too-short');
  if (normalized.length > BACKUP_PASSWORD_LENGTH.max)
    throw new BackupExportError('password-too-long');
  return normalized;
}

/**
 * The locked envelope text (section 10.4), verified before it is returned (section 10.5 step 4):
 * the text is re-parsed with the import steps 2–4, the additional data rebuilt from the parsed
 * header, the ciphertext decrypted with the key already derived, and the result compared byte for
 * byte with the plaintext. Any difference throws BackupExportError('lock-check-failed').
 */
export async function lockPayload(
  payload: BackupPayload,
  password: string,
  options: LockOptions = {},
): Promise<string> {
  const normalized = exportPassword(password);
  const random = options.randomBytes ?? randomBytes;
  const toBase64 = options.seams?.base64 ?? bytesToBase64;
  const additionalData = options.seams?.additionalData ?? lockAdditionalData;
  const iterations = options.iterations ?? PBKDF2_EXPORT_ITERATIONS;
  const salt = random(SALT_BYTES);
  const iv = random(IV_BYTES);
  const key = await deriveBackupKey(normalized, salt, iterations, ['encrypt', 'decrypt']);
  const header: LockHeader = { iterations, salt: toBase64(salt), iv: toBase64(iv) };
  const plaintext = utf8Encode(JSON.stringify(payload));
  const ciphertext = await aesGcmEncrypt(key, iv, additionalData(header), plaintext);
  const text = JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_ENVELOPE_VERSION,
    encrypted: true,
    kdf: { name: KDF_NAME, hash: KDF_HASH, iterations, salt: header.salt },
    cipher: { name: CIPHER_NAME, length: CIPHER_KEY_BITS, iv: header.iv, tagLength: TAG_BITS },
    ciphertext: toBase64(ciphertext),
  });
  let verified: boolean;
  try {
    const parsed = parseBackupText(text);
    verified = parsed.encrypted && bytesEqual(await decryptWithKey(parsed, key), plaintext);
  } catch {
    verified = false;
  }
  if (!verified) throw new BackupExportError('lock-check-failed');
  return text;
}

export interface BackupFile {
  readonly text: string;
  readonly kind: BackupKind;
  readonly locked: boolean;
  readonly schemaVersion: number;
  readonly exportedAt: Instant;
}

export interface CreateBackupInput {
  /** The backed-up stores, read in one transaction. Device-only stores, if present, are ignored. */
  readonly tables: BackupTablesInput;
  readonly exportedAt: Instant;
  readonly appVersion: string;
  /** null for a plain file ("Anyone who opens this file can read your records."). */
  readonly password: string | null;
  readonly lock?: LockOptions;
  readonly chain?: readonly Migration[];
}

/** settings.lastBackupAt = exportedAt in a copy, and nothing else (section 10.5 step 2). */
function withBackupRecorded(tables: BackupTablesInput, exportedAt: Instant): BackupTablesInput {
  return {
    ...tables,
    settings: (tables.settings ?? []).map((row) =>
      isPlainObject(row) ? { ...row, lastBackupAt: exportedAt } : row,
    ),
  };
}

const SELF_CHECK_ENV: MigrationEnv = {
  now: '2000-01-01T00:00:00.000Z',
  timeZone: 'UTC',
  randomId: () => {
    throw new RangeError('The export self-check never creates records');
  },
};

/**
 * A backup file (section 10.5 steps 2–4). The snapshot copy records lastBackupAt = exportedAt, so
 * the database matches the file once the owner answers Yes to "Can you see the file?" and the app
 * calls settings.recordBackup(exportedAt). The payload is self-checked with the import validator
 * (steps 5–8) on the plain text in memory; a failure throws BackupExportError('self-check-failed')
 * naming the table, field and rule (no values), and the app then offers createRescueFile.
 */
export async function createBackupFile(input: CreateBackupInput): Promise<BackupFile> {
  const chainOption = input.chain === undefined ? {} : { chain: input.chain };
  const payload = buildBackupPayload(withBackupRecorded(input.tables, input.exportedAt), {
    kind: 'backup',
    exportedAt: input.exportedAt,
    appVersion: input.appVersion,
    ...chainOption,
  });
  const plain = plainBackupText(payload);
  try {
    const parsed = parseBackupText(plain);
    checkBackupPayload(parsed.encrypted ? null : parsed.payload, SELF_CHECK_ENV, chainOption);
  } catch (error) {
    if (!(error instanceof BackupError)) throw error;
    throw new BackupExportError('self-check-failed', {
      table: error.table,
      field: error.field,
      rule: error.rule,
    });
  }
  const locked = input.password !== null;
  const text =
    input.password === null ? plain : await lockPayload(payload, input.password, input.lock);
  return {
    text,
    kind: 'backup',
    locked,
    schemaVersion: payload.schemaVersion,
    exportedAt: input.exportedAt,
  };
}

export interface CreateRescueInput {
  /** Whatever was read (raw IndexedDB rows of `schemaVersion`, or an export snapshot that failed its check). */
  readonly tables: BackupTablesInput;
  /** The version whose allow-list to apply (the installed version for an upgrade failure). */
  readonly schemaVersion: number;
  readonly exportedAt: Instant;
  readonly appVersion: string;
  /** Locked by default in the app; null makes a plain rescue file. */
  readonly password: string | null;
  readonly lock?: LockOptions;
  readonly chain?: readonly Migration[];
}

/**
 * A rescue copy (section 9.5; D22, D23): kind 'rescue', rows built from that version's allow-list
 * alone and otherwise not validated, a listed store that is missing written as []. It goes through
 * the same envelope and locking code as a backup. It never sets lastBackupAt, so the reminder stays.
 */
export async function createRescueFile(input: CreateRescueInput): Promise<BackupFile> {
  const payload = buildBackupPayload(input.tables, {
    kind: 'rescue',
    exportedAt: input.exportedAt,
    appVersion: input.appVersion,
    schemaVersion: input.schemaVersion,
    ...(input.chain === undefined ? {} : { chain: input.chain }),
  });
  const locked = input.password !== null;
  const text =
    input.password === null
      ? plainBackupText(payload)
      : await lockPayload(payload, input.password, input.lock);
  return {
    text,
    kind: 'rescue',
    locked,
    schemaVersion: input.schemaVersion,
    exportedAt: input.exportedAt,
  };
}
