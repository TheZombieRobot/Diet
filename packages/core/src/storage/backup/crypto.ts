/**
 * Locking primitives for backups (storage spec section 10.4; DOC_REVIEW C99; D19). WebCrypto only,
 * from globalThis.crypto, which Node 22 and Chrome both provide; no dependency.
 *
 * - Password: trimmed, then NFC-normalised, at export and import; 10–1,000 characters. Never
 *   stored or logged.
 * - Key: PBKDF2-HMAC-SHA-256 over the UTF-8 password, a fresh 16-byte salt per file, the
 *   iteration count read from the file (600,000 at export), deriving a non-extractable
 *   AES-256-GCM key.
 * - Encryption: AES-GCM with a fresh 12-byte IV, a 128-bit tag and the header as additional data.
 *
 * Core's TypeScript lib has no DOM types, so the few WebCrypto and encoding members used here are
 * typed locally and read from globalThis.
 */

/** An opaque WebCrypto CryptoKey. */
export type BackupKey = object;

type Bytes = Uint8Array;

interface SubtleCryptoSubset {
  importKey(
    format: 'raw',
    keyData: Bytes,
    algorithm: 'PBKDF2',
    extractable: false,
    usages: string[],
  ): Promise<BackupKey>;
  deriveKey(
    algorithm: { name: 'PBKDF2'; hash: 'SHA-256'; salt: Bytes; iterations: number },
    baseKey: BackupKey,
    derivedKeyType: { name: 'AES-GCM'; length: 256 },
    extractable: false,
    usages: string[],
  ): Promise<BackupKey>;
  encrypt(algorithm: AesGcmParams, key: BackupKey, data: Bytes): Promise<ArrayBuffer>;
  decrypt(algorithm: AesGcmParams, key: BackupKey, data: Bytes): Promise<ArrayBuffer>;
  digest(algorithm: 'SHA-256', data: Bytes): Promise<ArrayBuffer>;
  generateKey(
    algorithm: { name: 'AES-GCM'; length: 256 },
    extractable: boolean,
    usages: string[],
  ): Promise<BackupKey>;
}

interface AesGcmParams {
  name: 'AES-GCM';
  iv: Bytes;
  additionalData: Bytes;
  tagLength: 128;
}

export interface WebCryptoSubset {
  readonly subtle: SubtleCryptoSubset;
  getRandomValues(array: Bytes): Bytes;
}

interface TextCodecs {
  TextEncoder: new () => { encode(input: string): Bytes };
  TextDecoder: new (label: 'utf-8', options: { fatal: true }) => { decode(input: Bytes): string };
}

/** globalThis.crypto, or a clear error when this environment has no WebCrypto. */
export function webCrypto(): WebCryptoSubset {
  const c = (globalThis as { crypto?: Partial<WebCryptoSubset> }).crypto;
  if (c?.subtle === undefined || typeof c.getRandomValues !== 'function') {
    throw new Error('WebCrypto (globalThis.crypto) is not available');
  }
  return c as WebCryptoSubset;
}

/** TextEncoder and TextDecoder from globalThis; core's lib does not declare them. */
function codecs(): TextCodecs {
  const g: Partial<TextCodecs> = globalThis;
  if (typeof g.TextEncoder !== 'function' || typeof g.TextDecoder !== 'function') {
    throw new Error('TextEncoder and TextDecoder are not available');
  }
  return g as TextCodecs;
}

export function utf8Encode(text: string): Uint8Array {
  return new (codecs().TextEncoder)().encode(text);
}

/** Strict UTF-8 decoding: throws a TypeError on invalid bytes. */
export function utf8Decode(bytes: Uint8Array): string {
  return new (codecs().TextDecoder)('utf-8', { fatal: true }).decode(bytes);
}

export function randomBytes(length: number): Uint8Array {
  return webCrypto().getRandomValues(new Uint8Array(length));
}

/** Lowercase hex SHA-256 of bytes or of a string's UTF-8 encoding. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? utf8Encode(data) : data;
  const digest = new Uint8Array(await webCrypto().subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Password length after trimming and NFC (section 10.4; D19). */
export const BACKUP_PASSWORD_LENGTH = Object.freeze({ min: 10, max: 1000 });
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const TAG_BITS = 128;

/** Mobile keyboards add trailing spaces, so both export and import trim, then normalise to NFC. */
export function normalizeBackupPassword(password: string): string {
  return password.trim().normalize('NFC');
}

/** Whether an already-normalised password meets the export rule (10–1,000 characters). */
export function isAcceptableBackupPassword(normalized: string): boolean {
  return (
    normalized.length >= BACKUP_PASSWORD_LENGTH.min &&
    normalized.length <= BACKUP_PASSWORD_LENGTH.max
  );
}

/**
 * PBKDF2-SHA-256 then a non-extractable AES-256-GCM key. Export asks for encrypt and decrypt, so it
 * can verify its own file without a second derivation; import asks for decrypt only.
 * `password` must already be normalised (normalizeBackupPassword).
 */
export async function deriveBackupKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  usages: readonly ('encrypt' | 'decrypt')[],
): Promise<BackupKey> {
  const subtle = webCrypto().subtle;
  const material = await subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [...usages],
  );
}

export async function aesGcmEncrypt(
  key: BackupKey,
  iv: Uint8Array,
  additionalData: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const params: AesGcmParams = { name: 'AES-GCM', iv, additionalData, tagLength: TAG_BITS };
  return new Uint8Array(await webCrypto().subtle.encrypt(params, key, plaintext));
}

/** Rejects (OperationError) on a wrong key, a changed header or changed ciphertext. */
export async function aesGcmDecrypt(
  key: BackupKey,
  iv: Uint8Array,
  additionalData: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const params: AesGcmParams = { name: 'AES-GCM', iv, additionalData, tagLength: TAG_BITS };
  return new Uint8Array(await webCrypto().subtle.decrypt(params, key, ciphertext));
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// The envelope header (section 10.2), bound into the ciphertext as additional data (section 10.4).

/** The backup-format marker: the envelope's first field. The scan's backup-marker rule matches it. */
export const BACKUP_FORMAT = 'diet-backup';
/** The envelope version (not the schema version, which is payload.schemaVersion). */
export const BACKUP_ENVELOPE_VERSION = 1;
export const KDF_NAME = 'PBKDF2';
export const KDF_HASH = 'SHA-256';
export const CIPHER_NAME = 'AES-GCM';
export const CIPHER_KEY_BITS = 256;

/** The validated header values of a locked file. */
export interface LockHeader {
  readonly iterations: number;
  /** Canonical base64 of 16 bytes. */
  readonly salt: string;
  /** Canonical base64 of 12 bytes. */
  readonly iv: string;
}

/**
 * The additional authenticated data: the validated header values in this fixed order, so tampering
 * with any header field makes decryption fail, while the file's key order and whitespace do not
 * matter (section 10.4).
 */
export function lockAdditionalData(header: LockHeader): Uint8Array {
  return utf8Encode(
    JSON.stringify([
      BACKUP_FORMAT,
      BACKUP_ENVELOPE_VERSION,
      true,
      KDF_NAME,
      KDF_HASH,
      header.iterations,
      header.salt,
      CIPHER_NAME,
      CIPHER_KEY_BITS,
      header.iv,
      TAG_BITS,
    ]),
  );
}
