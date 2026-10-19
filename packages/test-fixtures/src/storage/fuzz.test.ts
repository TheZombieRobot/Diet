// Seeded import fuzzing (section 16 test 19). 2,000 mutations of the version-1 fixture's payload:
// decodeBackupText either returns a snapshot that passes validateSnapshot, or throws a
// BackupError, never any other error. A further 40 mutations of a locked file's header and
// ciphertext all give 'damaged' or 'wrong-password-or-damaged'.
// FUZZ_SEED explores another seed: FUZZ_SEED=7 pnpm vitest run packages/test-fixtures
import { BackupError, createBackupFile, decodeBackupText, validateSnapshot } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { fixtureEnv, SYNTHETIC_PHRASE } from './env';
import { type Json, mulberry32, mutateBackupText, pick } from './fuzzMutations';
import { SNAPSHOT_V1_APP_VERSION, SNAPSHOT_V1_EXPORTED_AT, snapshotV1 } from './snapshotV1';

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const SEED = Number(env['FUZZ_SEED'] ?? 20000101);

describe('import fuzzing (section 16 test 19)', () => {
  it(`2,000 payload mutations give a valid snapshot or a BackupError, never anything else (seed ${SEED})`, async () => {
    const random = mulberry32(SEED);
    const outcomes = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const text = mutateBackupText(random);
      try {
        const decoded = await decodeBackupText(text, { env: fixtureEnv() });
        validateSnapshot(decoded.snapshot);
        outcomes.set('accepted', (outcomes.get('accepted') ?? 0) + 1);
      } catch (error) {
        if (!(error instanceof BackupError)) {
          throw new Error(`mutation ${i} threw ${String(error)}`, { cause: error });
        }
        outcomes.set(error.code, (outcomes.get(error.code) ?? 0) + 1);
      }
    }
    // The mutations reach every stage: parsing, the envelope, the payload, rows and invariants.
    for (const code of ['not-a-backup', 'damaged', 'invalid-record'])
      expect(outcomes.get(code) ?? 0, code).toBeGreaterThan(0);
  }, 60_000);

  it('40 mutations of a locked file’s header and ciphertext give damaged or wrong-password-or-damaged', async () => {
    const file = await createBackupFile({
      tables: snapshotV1,
      exportedAt: SNAPSHOT_V1_EXPORTED_AT,
      appVersion: SNAPSHOT_V1_APP_VERSION,
      password: SYNTHETIC_PHRASE,
    });
    const random = mulberry32(SEED + 1);
    const codes = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const e = JSON.parse(file.text) as {
        kdf: Record<string, Json>;
        cipher: Record<string, Json>;
        ciphertext: string;
      } & Record<string, Json>;
      const field = pick(random, [
        'iterations',
        'salt',
        'kdfName',
        'hash',
        'iv',
        'length',
        'tagLength',
        'cipherName',
        'ciphertext',
        'extra',
      ]);
      const flip = (s: string) => {
        const at = Math.floor(random() * s.length);
        const c = s.charAt(at);
        return `${s.slice(0, at)}${c === 'A' ? 'B' : 'A'}${s.slice(at + 1)}`;
      };
      switch (field) {
        case 'iterations':
          e.kdf.iterations = pick(random, [
            600_001,
            600_002,
            599_999,
            10_000_001,
            0,
            '600000',
            600_000.5,
          ]);
          break;
        case 'salt':
          e.kdf.salt = pick(random, [
            flip(typeof e.kdf.salt === 'string' ? e.kdf.salt : ''),
            'AAAA',
            '',
            12,
          ]);
          break;
        case 'kdfName':
          e.kdf.name = 'scrypt';
          break;
        case 'hash':
          e.kdf.hash = 'SHA-1';
          break;
        case 'iv':
          e.cipher.iv = pick(random, [
            flip(typeof e.cipher.iv === 'string' ? e.cipher.iv : ''),
            'AAAAAAAAAAAAAAAAAAAA',
            null,
          ]);
          break;
        case 'length':
          e.cipher.length = pick(random, [128, 192, '256']);
          break;
        case 'tagLength':
          e.cipher.tagLength = 96;
          break;
        case 'cipherName':
          e.cipher.name = 'AES-CBC';
          break;
        case 'ciphertext':
          e.ciphertext = pick(random, [
            flip(e.ciphertext),
            e.ciphertext.slice(0, -4),
            `${e.ciphertext}AAAA`,
            'AAAA',
          ]);
          break;
        default:
          e.kdf.extra = 1;
      }
      try {
        await decodeBackupText(JSON.stringify(e), {
          password: SYNTHETIC_PHRASE,
          env: fixtureEnv(),
        });
        codes.add('accepted');
      } catch (error) {
        codes.add(error instanceof BackupError ? error.code : `other: ${String(error)}`);
      }
    }
    expect([...codes].filter((c) => c !== 'damaged' && c !== 'wrong-password-or-damaged')).toEqual(
      [],
    );
  }, 60_000);
});
