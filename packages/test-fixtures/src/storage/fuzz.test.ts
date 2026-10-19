// Seeded import fuzzing (section 16 test 19). 2,000 mutations of the version-1 fixture's payload:
// decodeBackupText either returns a snapshot that passes validateSnapshot, or throws a
// BackupError, never any other error. A further 40 mutations of a locked file's header and
// ciphertext all give 'damaged' or 'wrong-password-or-damaged'.
// FUZZ_SEED explores another seed: FUZZ_SEED=7 pnpm vitest run packages/test-fixtures
import { BackupError, createBackupFile, decodeBackupText, validateSnapshot } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { fixtureEnv, SYNTHETIC_PHRASE } from './env';
import { SNAPSHOT_V1_APP_VERSION, SNAPSHOT_V1_EXPORTED_AT, snapshotV1 } from './snapshotV1';

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const SEED = Number(env['FUZZ_SEED'] ?? 20000101);

/** mulberry32: a small, fast, seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const MARKER = ['diet', 'backup'].join('-');
const ENUM_POOL = [
  'keto',
  'balanced',
  'label',
  'estimate',
  'g',
  'each',
  'yes',
  'no',
  'extended',
  'stop-sign',
  'rescue',
  'kJ',
  'custom',
  '23:1',
  'nz-men',
];

const basePayload = (): Json =>
  structuredClone({
    schemaVersion: 1,
    kind: 'backup',
    exportedAt: SNAPSHOT_V1_EXPORTED_AT,
    appVersion: SNAPSHOT_V1_APP_VERSION,
    tables: snapshotV1,
  }) as unknown as Json;

/** Every object and array in the value, with how to reach it. */
function containers(value: Json): (Json[] | { [key: string]: Json })[] {
  const out: (Json[] | { [key: string]: Json })[] = [];
  const walk = (v: Json) => {
    if (Array.isArray(v)) {
      out.push(v);
      v.forEach(walk);
    } else if (v !== null && typeof v === 'object') {
      out.push(v);
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return out;
}

const pick = <T>(random: () => number, list: readonly T[]): T =>
  list[Math.floor(random() * list.length)] as T;

function randomValue(random: () => number): Json {
  return pick(random, [
    null,
    true,
    0,
    -1,
    1.5,
    1e9,
    '',
    'x',
    [],
    {},
    'seed:x',
    '2000-01-01',
    12345,
  ]);
}

/** One mutation of the payload, as file text. */
function mutate(random: () => number): string {
  const payload = basePayload() as { [key: string]: Json };
  const kind = Math.floor(random() * 13);
  const all = containers(payload);
  const target = pick(random, all);
  const keys = Array.isArray(target) ? target.map((_, i) => i) : Object.keys(target);
  const key = keys.length > 0 ? pick(random, keys as (string | number)[]) : null;
  const set = (k: string | number, v: Json) => {
    (target as Record<string | number, Json>)[k] = v;
  };
  const get = (k: string | number): Json => (target as Record<string | number, Json>)[k] ?? null;
  let text: string | null = null;
  switch (kind) {
    case 0: // delete a key
      if (key !== null && !Array.isArray(target)) Reflect.deleteProperty(target, key);
      else if (Array.isArray(target)) target.pop();
      break;
    case 1: // add a key
      if (!Array.isArray(target)) target[`zz${Math.floor(random() * 100)}`] = randomValue(random);
      else target.push(randomValue(random));
      break;
    case 2: // rename a key
      if (key !== null && !Array.isArray(target)) {
        const v = get(key);
        Reflect.deleteProperty(target, key);
        target[`${String(key)}X`] = v;
      }
      break;
    case 3: // change a type
      if (key !== null) set(key, randomValue(random));
      break;
    case 4: {
      // push a number past a bound
      const numbers = all.flatMap((c) =>
        (Array.isArray(c)
          ? c.map((_v, i) => [c, i] as const)
          : Object.entries(c).map(([k]) => [c, k] as const)
        ).filter(([cont, k]) => typeof (cont as Record<string | number, Json>)[k] === 'number'),
      );
      if (numbers.length > 0) {
        const [cont, k] = pick(random, numbers);
        const n = (cont as Record<string | number, number>)[k] ?? 0;
        (cont as Record<string | number, Json>)[k] = pick(random, [
          n + 1e6,
          n - 1e6,
          -1,
          n + 0.5,
          1e21,
          2 ** 53,
        ]);
      }
      break;
    }
    case 5: // a 10,000-character string
      if (key !== null) set(key, 'y'.repeat(10_000));
      break;
    case 6: // duplicate or empty an array
      if (Array.isArray(target)) {
        if (random() < 0.5 && target.length > 0) target.push(structuredClone(target[0] ?? null));
        else target.length = 0;
      }
      break;
    case 7: // swap an enum value
      if (key !== null && typeof get(key) === 'string') set(key, pick(random, ENUM_POOL));
      break;
    case 8: // add __proto__
      text = JSON.stringify({ format: MARKER, version: 1, encrypted: false, payload });
      {
        const opens = [...text.matchAll(/\{/g)].map((m) => m.index);
        const at = pick(random, opens.slice(1));
        text = `${text.slice(0, at + 1)}"__proto__":{"polluted":1},${text.slice(at + 1)}`;
      }
      break;
    case 9: // truncate the JSON text
      text = JSON.stringify({ format: MARKER, version: 1, encrypted: false, payload });
      text = text.slice(0, Math.floor(random() * text.length));
      break;
    case 10: {
      // change the store names
      const tables = payload['tables'] as { [key: string]: Json };
      const names = Object.keys(tables);
      const name = pick(random, names);
      const v = tables[name] ?? null;
      Reflect.deleteProperty(tables, name);
      tables[pick(random, [`${name}s`, 'garden_photos', 'transfer_pairings', name.toUpperCase()])] =
        v;
      break;
    }
    case 11: // change exportedAt, appVersion or kind
      payload[pick(random, ['exportedAt', 'appVersion', 'kind'])] = pick(random, [
        '2000-01-01T00:00:00Z',
        'rescue',
        '1.0',
        '0.1.0-beta.1',
        '2100-01-01T00:00:00.000Z',
        'backup',
        7,
      ]);
      break;
    default: {
      // a -0 in place of a number
      text = JSON.stringify({ format: MARKER, version: 1, encrypted: false, payload });
      const numbers = [...text.matchAll(/:(\d+(?:\.\d+)?)([,}\]])/g)];
      if (numbers.length > 0) {
        const m = pick(random, numbers);
        text = `${text.slice(0, m.index)}:-0${m[2] ?? ''}${text.slice(m.index + m[0].length)}`;
      }
    }
  }
  return text ?? JSON.stringify({ format: MARKER, version: 1, encrypted: false, payload });
}

describe('import fuzzing (section 16 test 19)', () => {
  it(`2,000 payload mutations give a valid snapshot or a BackupError, never anything else (seed ${SEED})`, async () => {
    const random = mulberry32(SEED);
    const outcomes = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const text = mutate(random);
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
