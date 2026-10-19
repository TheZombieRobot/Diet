// Locking (C99; section 10.4) and the export's self-verification (section 10.5), at the core level
// (section 16 tests 13 and 14; BK-02 and BK-04).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSnapshot } from '../defaults';
import {
  PBKDF2_EXPORT_ITERATIONS,
  PBKDF2_IMPORT_MIN_ITERATIONS,
  PBKDF2_MAX_ITERATIONS,
} from '../limits';
import type { MigrationEnv } from '../migrations';
import { bytesToBase64 } from './base64';
import {
  BACKUP_FORMAT,
  lockAdditionalData,
  type LockHeader,
  utf8Encode,
  webCrypto,
} from './crypto';
import { type BackupPayload, decodeBackupText, parseBackupText } from './decode';
import { buildBackupPayload, createBackupFile, lockPayload } from './encode';
import { BackupError, BackupExportError } from './errors';

const PHRASE = 'synthetic example phrase for tests';
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
let counter = 0;
const env: MigrationEnv = {
  now: '2000-01-01T00:00:00.000Z',
  timeZone: 'Pacific/Auckland',
  randomId: () => id(++counter),
};
const EXPORTED_AT = '2000-01-02T00:00:00.000Z';
const payload: BackupPayload = buildBackupPayload(defaultSnapshot(env), {
  kind: 'backup',
  exportedAt: EXPORTED_AT,
  appVersion: '0.1.0',
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BackupError || error instanceof BackupExportError) return error.code;
    throw error;
  }
  return 'accepted';
}

const decode = (text: string, password: string = PHRASE) =>
  decodeBackupText(text, { password, env: { ...env, now: EXPORTED_AT } });

type Envelope = Record<string, unknown> & {
  kdf: Record<string, unknown>;
  cipher: Record<string, unknown>;
};
const parse = (text: string) => JSON.parse(text) as Envelope;
const edit = (text: string, change: (e: Envelope) => void): string => {
  const e = parse(text);
  change(e);
  return JSON.stringify(e);
};

/** Changes one base64 character without breaking canonical form or length. */
function flipBase64(value: unknown): string {
  const s = String(value);
  const first = s.charAt(0);
  return (first === 'A' ? 'B' : 'A') + s.slice(1);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('locking (C99; section 16 test 13)', () => {
  it('round-trips with the right password', async () => {
    const text = await lockPayload(payload, PHRASE);
    const decoded = await decode(text);
    expect(decoded.locked).toBe(true);
    expect(decoded.snapshot.settings).toEqual(payload.tables.settings);
    const e = parse(text);
    expect(Object.keys(e)).toEqual([
      'format',
      'version',
      'encrypted',
      'kdf',
      'cipher',
      'ciphertext',
    ]);
    expect(e.format).toBe(BACKUP_FORMAT);
    expect(e.kdf).toMatchObject({
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_EXPORT_ITERATIONS,
    });
    expect(e.cipher).toMatchObject({ name: 'AES-GCM', length: 256, tagLength: 128 });
    expect(text).not.toContain(EXPORTED_AT); // the locked header holds no data, not even the export time
  });

  it('BK-02: a wrong password gives wrong-password-or-damaged', async () => {
    const text = await lockPayload(payload, PHRASE);
    expect(await codeOf(decode(text, 'another synthetic phrase'))).toBe(
      'wrong-password-or-damaged',
    );
  });

  it('BK-04: tampering with any header field, or one ciphertext bit, makes the file fail', async () => {
    const text = await lockPayload(payload, PHRASE);
    const tampered: [string, string][] = [
      ['iterations + 1', edit(text, (e) => (e.kdf.iterations = PBKDF2_EXPORT_ITERATIONS + 1))],
      ['iterations − 1', edit(text, (e) => (e.kdf.iterations = PBKDF2_EXPORT_ITERATIONS - 1))],
      ['salt', edit(text, (e) => (e.kdf.salt = flipBase64(e.kdf.salt)))],
      ['IV', edit(text, (e) => (e.cipher.iv = flipBase64(e.cipher.iv)))],
      ['version', edit(text, (e) => (e.version = 2))],
      ['encrypted flag', edit(text, (e) => (e.encrypted = false))],
      ['cipher length', edit(text, (e) => (e.cipher.length = 128))],
      ['kdf hash', edit(text, (e) => (e.kdf.hash = 'SHA-512'))],
      ['tag length', edit(text, (e) => (e.cipher.tagLength = 96))],
      [
        'ciphertext bit',
        edit(text, (e) => {
          const bytes = Uint8Array.from(atobBytes(String(e.ciphertext)));
          bytes[10] = (bytes[10] ?? 0) ^ 0x01;
          e.ciphertext = bytesToBase64(bytes);
        }),
      ],
    ];
    for (const [label, file] of tampered) {
      expect(await codeOf(decode(file)), label).not.toBe('accepted');
    }
    expect(await codeOf(decode(tampered[0]?.[1] ?? ''))).toBe('wrong-password-or-damaged');
    expect(await codeOf(decode(tampered[2]?.[1] ?? ''))).toBe('wrong-password-or-damaged');
    expect(await codeOf(decode(tampered[3]?.[1] ?? ''))).toBe('wrong-password-or-damaged');
    expect(await codeOf(decode(tampered[9]?.[1] ?? ''))).toBe('wrong-password-or-damaged');
  });

  it('iterations of 599,999 and 10,000,001 are refused as damaged before any key derivation', async () => {
    const text = await lockPayload(payload, PHRASE);
    const derive = vi.spyOn(webCrypto().subtle, 'deriveKey');
    for (const iterations of [
      PBKDF2_IMPORT_MIN_ITERATIONS - 1,
      PBKDF2_MAX_ITERATIONS + 1,
      600_000.5,
      '600000',
    ]) {
      expect(
        await codeOf(decode(edit(text, (e) => (e.kdf.iterations = iterations)))),
        String(iterations),
      ).toBe('damaged');
    }
    expect(derive).not.toHaveBeenCalled();
    // The cap itself is accepted by the header check (deriving 10 million iterations is not run here).
    expect(
      parseBackupText(edit(text, (e) => (e.kdf.iterations = PBKDF2_MAX_ITERATIONS))).encrypted,
    ).toBe(true);
  });

  it('a salt of 15 bytes or an IV of 11 bytes is damaged', async () => {
    const text = await lockPayload(payload, PHRASE);
    const salt15 = bytesToBase64(new Uint8Array(15));
    const iv11 = bytesToBase64(new Uint8Array(11));
    expect(await codeOf(decode(edit(text, (e) => (e.kdf.salt = salt15))))).toBe('damaged');
    expect(await codeOf(decode(edit(text, (e) => (e.cipher.iv = iv11))))).toBe('damaged');
    expect(
      await codeOf(decode(edit(text, (e) => (e.ciphertext = bytesToBase64(new Uint8Array(15)))))),
    ).toBe('damaged');
    expect(await codeOf(decode(edit(text, (e) => (e.kdf.extra = 1))))).toBe('damaged');
  });

  it('uses a fresh salt and IV for every file, so two exports differ', async () => {
    const a = parse(await lockPayload(payload, PHRASE));
    const b = parse(await lockPayload(payload, PHRASE));
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('trims and NFC-normalises the password at export and import', async () => {
    const composed = 'café synthetic phrase';
    const decomposed = '  café synthetic phrase \t';
    const text = await lockPayload(payload, composed);
    expect(await codeOf(decode(text, decomposed))).toBe('accepted');
  });

  it('refuses a password under 10 or over 1,000 characters after trimming', async () => {
    expect(await codeOf(lockPayload(payload, '  nine char  '))).toBe('password-too-short');
    expect(await codeOf(lockPayload(payload, 'x'.repeat(1001)))).toBe('password-too-long');
  });

  it('the import minimum stays 600,000 even when the export figure is raised', async () => {
    expect(PBKDF2_IMPORT_MIN_ITERATIONS).toBe(600_000);
    const raised = await lockPayload(payload, PHRASE, { iterations: 700_000 });
    expect(parse(raised).kdf.iterations).toBe(700_000);
    expect(await codeOf(decode(raised))).toBe('accepted');
    const older = await lockPayload(payload, PHRASE, { iterations: 600_000 });
    expect(await codeOf(decode(older))).toBe('accepted');
  });

  it('binds the header as additional data in the fixed order of section 10.4', () => {
    const header: LockHeader = {
      iterations: 600_000,
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      iv: 'AAAAAAAAAAAAAAAA',
    };
    expect(lockAdditionalData(header)).toEqual(
      utf8Encode(
        '["diet-backup",1,true,"PBKDF2","SHA-256",600000,"AAAAAAAAAAAAAAAAAAAAAA==","AES-GCM",256,"AAAAAAAAAAAAAAAA",128]',
      ),
    );
  });
});

/** Decodes base64 without the canonical check, for building tampered files. */
function atobBytes(text: string): number[] {
  const g: { atob?: (s: string) => string } = globalThis;
  const binary = g.atob?.(text) ?? '';
  return Array.from(binary, (c) => c.charCodeAt(0));
}

describe('export self-verification (section 10.5 step 4; section 16 test 14)', () => {
  it('an encoder with the additional-data order swapped makes the export refuse', async () => {
    const swapped = (h: LockHeader) => utf8Encode(JSON.stringify([h.iv, h.salt, h.iterations]));
    expect(await codeOf(lockPayload(payload, PHRASE, { seams: { additionalData: swapped } }))).toBe(
      'lock-check-failed',
    );
  });

  it('a broken base64 chunking variant makes the export refuse', async () => {
    const brokenChunks = (bytes: Uint8Array) => {
      const parts: string[] = [];
      for (let i = 0; i < bytes.length; i += 4) parts.push(bytesToBase64(bytes.subarray(i, i + 4)));
      return parts.join('');
    };
    expect(await codeOf(lockPayload(payload, PHRASE, { seams: { base64: brokenChunks } }))).toBe(
      'lock-check-failed',
    );
  });

  it('createBackupFile locks, verifies and records lastBackupAt in the file only', async () => {
    const tables = defaultSnapshot(env);
    const file = await createBackupFile({
      tables,
      exportedAt: EXPORTED_AT,
      appVersion: '0.1.0',
      password: PHRASE,
    });
    expect(file).toMatchObject({
      kind: 'backup',
      locked: true,
      schemaVersion: 1,
      exportedAt: EXPORTED_AT,
    });
    const decoded = await decode(file.text);
    expect(decoded.snapshot.settings[0]?.lastBackupAt).toBe(EXPORTED_AT);
    expect(tables.settings[0]?.lastBackupAt).toBeNull();
  });
});
