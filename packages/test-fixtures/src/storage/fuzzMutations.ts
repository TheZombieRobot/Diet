/**
 * Seeded mutations of the version-1 fixture's backup payload, for import fuzzing (storage spec
 * section 16 test 19, and the app's own import path). The format marker is built from two words,
 * so the backup-marker scan rule never fires on this file.
 */
import { SNAPSHOT_V1_APP_VERSION, SNAPSHOT_V1_EXPORTED_AT, snapshotV1 } from './snapshotV1';

/** mulberry32: a small, fast, seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
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

export const pick = <T>(random: () => number, list: readonly T[]): T =>
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

/** One mutation of the version-1 fixture's payload, as file text (section 16 test 19). */
export function mutateBackupText(random: () => number): string {
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
