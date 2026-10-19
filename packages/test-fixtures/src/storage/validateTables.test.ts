// Every store's validator, table-driven from the specs (section 16 test 2): the fixture rows pass,
// and for each field a wrong type, null where not allowed, a value below or above its range, a
// missing key, an extra key and the keys __proto__, constructor and prototype at any depth are
// refused with the right field and rule. A new field is covered automatically.
import { checkRow, type Desc, TABLES, webCrypto } from '@diet/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureId, snapshotV1 } from './snapshotV1';

type DescObject = { readonly [key: string]: Desc };
const asObject = (d: Desc | undefined): DescObject => (d ?? {}) as DescObject;

interface Case {
  readonly label: string;
  readonly path: (string | number)[];
  /** Replace the value at `path`, or delete it when `remove` is set. */
  readonly value?: unknown;
  readonly remove?: boolean;
  readonly expectField: string;
  readonly expectRule: string;
}

const STRINGY = new Set([
  'text',
  'note',
  'instant',
  'local-date',
  'clock-time',
  'time-zone',
  'id',
  'seed-id',
  'ref-id',
  'pattern',
]);

function pathText(path: readonly (string | number)[]): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc === '' ? p : `${acc}.${p}`),
    '',
  );
}

function wrongType(d: DescObject): unknown {
  const type = d['type'];
  if (typeof type === 'string' && STRINGY.has(type)) return 12345;
  if (type === 'enum') return typeof (d['values'] as Desc[])[0] === 'string' ? 12345 : 'x';
  if (type === 'literal') return typeof d['value'] === 'string' ? 12345 : 'x';
  return 'x';
}

/** Cases for one field whose description is `desc` and whose current value is `value`. */
function fieldCases(desc: Desc, value: unknown, path: (string | number)[]): Case[] {
  const outer = asObject(desc);
  const nullable = outer['type'] === 'nullable';
  const d = nullable ? asObject(outer['of']) : outer;
  const field = pathText(path);
  const cases: Case[] = [
    { label: 'wrong type', path, value: wrongType(d), expectField: field, expectRule: 'type' },
  ];
  if (!nullable)
    cases.push({ label: 'null', path, value: null, expectField: field, expectRule: 'type' });
  const type = d['type'];
  if (type === 'int' || type === 'num') {
    const min = d['min'] as number;
    const max = d['max'] as number;
    const below = type === 'num' && d['minExclusive'] === true ? min : min - 1;
    cases.push(
      { label: 'below min', path, value: below, expectField: field, expectRule: 'range' },
      { label: 'above max', path, value: max + 1, expectField: field, expectRule: 'range' },
    );
  }
  if (type === 'text' || type === 'note') {
    const min = type === 'note' ? 1 : (d['min'] as number);
    const max = d['max'] as number;
    if (min >= 1)
      cases.push({ label: 'too short', path, value: '', expectField: field, expectRule: 'length' });
    cases.push({
      label: 'too long',
      path,
      value: 'x'.repeat(max + 1),
      expectField: field,
      expectRule: 'length',
    });
  }
  if (type === 'array') {
    const min = d['min'] as number;
    const max = d['max'] as number;
    if (min > 0)
      cases.push({ label: 'too few', path, value: [], expectField: field, expectRule: 'length' });
    cases.push({
      label: 'too many',
      path,
      value: Array.from({ length: max + 1 }, () => 0),
      expectField: field,
      expectRule: 'length',
    });
  }
  // Recurse into a nested object, or the first item of an array of objects.
  if (type === 'object' && isPlain(value)) cases.push(...objectCases(d, value, path));
  if (
    type === 'array' &&
    Array.isArray(value) &&
    isPlain(value[0]) &&
    asObject(d['of'])['type'] === 'object'
  ) {
    cases.push(...objectCases(asObject(d['of']), value[0], [...path, 0]));
  }
  return cases;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/** Cases for every field of an object, plus missing, extra and forbidden keys on the object itself. */
function objectCases(
  d: DescObject,
  value: Record<string, unknown>,
  path: (string | number)[],
): Case[] {
  const here = pathText(path);
  const fields = asObject(d['fields']);
  const cases: Case[] = [
    {
      label: 'extra key',
      path: [...path, 'zzextra'],
      value: 1,
      expectField: here,
      expectRule: 'extra-key',
    },
  ];
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    cases.push({
      label: `${key} key`,
      path: [...path, key],
      value: {},
      expectField: here,
      expectRule: 'forbidden-key',
    });
  }
  for (const [key, sub] of Object.entries(fields)) {
    cases.push({
      label: 'missing',
      path: [...path, key],
      remove: true,
      expectField: pathText([...path, key]),
      expectRule: 'missing',
    });
    cases.push(...fieldCases(sub, value[key], [...path, key]));
  }
  return cases;
}

/** A deep copy that keeps ArrayBuffers and CryptoKeys as they are. */
function copy(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(copy);
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)]));
  return v;
}

function apply(row: unknown, c: Case): unknown {
  const out = copy(row) as Record<string | number, unknown>;
  let target = out;
  for (const step of c.path.slice(0, -1)) target = target[step] as Record<string | number, unknown>;
  const last = c.path.at(-1) as string | number;
  if (c.remove === true) Reflect.deleteProperty(target, last);
  else
    Object.defineProperty(target, last, {
      value: c.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  return out;
}

const rowsByTable: Record<string, readonly unknown[]> = {
  ...(snapshotV1 as unknown as Record<string, readonly unknown[]>),
};

beforeAll(async () => {
  const key = await webCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  rowsByTable.garden_photos = [
    {
      gardenId: fixtureId(901),
      mimeType: 'image/jpeg',
      bytes: new ArrayBuffer(16),
      width: 2048,
      height: 1,
      takenAt: '2000-01-01T00:00:00.000Z',
    },
  ];
  rowsByTable.transfer_pairings = [
    {
      id: 'singleton',
      relayUrl: 'https://relay.example.com/x',
      roomId: 'abcdefghijklmnopqrstuv',
      key,
      pairedAt: '2000-01-01T00:00:00.000Z',
    },
  ];
});

describe('every store’s validator, generated from the specs (section 16 test 2)', () => {
  for (const name of Object.keys(TABLES)) {
    it(`${name}: valid rows pass; each field's bad values are refused with the right field and rule`, () => {
      const rows = rowsByTable[name] ?? [];
      expect(rows.length).toBeGreaterThan(0);
      const desc = asObject(TABLES[name as keyof typeof TABLES].row.desc);
      const problems: string[] = [];
      let cases = 0;
      for (const [index, row] of rows.entries()) {
        const ok = checkRow(name, row);
        if (!ok.ok) problems.push(`row ${index} refused: ${ok.field} ${ok.rule}`);
        for (const c of objectCases(desc, row as Record<string, unknown>, [])) {
          cases += 1;
          const result = checkRow(name, apply(row, c));
          const got = result.ok ? 'accepted' : `${result.field} ${result.rule}`;
          const want = `${c.expectField} ${c.expectRule}`;
          if (got !== want)
            problems.push(`row ${index} ${pathText(c.path)} ${c.label}: got ${got}, want ${want}`);
        }
      }
      expect(problems).toEqual([]);
      // Every field gives at least a wrong type and a missing key, plus the object's own key cases.
      expect(cases).toBeGreaterThanOrEqual(
        rows.length * (2 * Object.keys(asObject(desc['fields'])).length + 4),
      );
    });
  }

  it('device-only rows: a 5,000 px photo, an extractable key or a non-https relay are refused', async () => {
    const photo = rowsByTable.garden_photos?.[0] as Record<string, unknown>;
    expect(checkRow('garden_photos', { ...photo, width: 5000 })).toMatchObject({
      ok: false,
      field: 'width',
      rule: 'range',
    });
    expect(
      checkRow('garden_photos', { ...photo, bytes: new ArrayBuffer(1_500_001) }),
    ).toMatchObject({ ok: false, rule: 'length' });
    const pairing = rowsByTable.transfer_pairings?.[0] as Record<string, unknown>;
    const extractable = await webCrypto().subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    expect(checkRow('transfer_pairings', { ...pairing, key: extractable })).toMatchObject({
      ok: false,
      field: 'key',
      rule: 'equals',
    });
    expect(
      checkRow('transfer_pairings', { ...pairing, relayUrl: 'http://relay.example.com' }),
    ).toMatchObject({
      ok: false,
      field: 'relayUrl',
      rule: 'pattern',
    });
    expect(checkRow('transfer_pairings', { ...pairing, roomId: 'short' })).toMatchObject({
      ok: false,
      field: 'roomId',
      rule: 'length',
    });
  });
});
