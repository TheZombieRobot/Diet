import {
  BACKUP_TABLES_BY_VERSION,
  checkInvariants,
  type Desc,
  primaryKeyOf,
  comparePrimaryKeys,
  sha256Hex,
  TABLES_BY_VERSION,
  validateSnapshot,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import { snapshotV1 } from './snapshotV1';

const SPECS_V1 = TABLES_BY_VERSION[1] ?? {};
const tables = snapshotV1 as unknown as Record<string, readonly unknown[]>;

/** Pinned when version 1 was released; a released fixture is never edited (section 9.4). */
const SNAPSHOT_V1_SHA256 = 'def5a74ea2e4d2d19317ac2c2dc9d6c239355d88f34860687e711d8ca9f51ae2';

const SINGLETONS = new Set(['profile', 'targets', 'settings']);

/** Enum fields whose every value need not appear (with the reason). */
const ENUM_COVERAGE_EXEMPT = new Set([
  // Any backed-up store name: a migration or grocery audit row can name any store.
  'audit.table',
]);

type DescObject = { readonly [key: string]: Desc };
const asObject = (d: Desc): DescObject => d as DescObject;

/**
 * Walks a validator description and the fixture's values at the same path, reporting a nullable
 * field that is never null or never set, and an enum value that never appears. Arrays of objects
 * are walked item by item; arrays of plain values are not. Inside a tagged union every variant
 * must appear and nested nullables are checked.
 */
function coverageGaps(
  desc: Desc,
  values: readonly unknown[],
  path: string,
  enums: boolean,
): string[] {
  const d = asObject(desc);
  switch (d['type']) {
    case 'nullable': {
      const gaps: string[] = [];
      if (!values.some((v) => v === null)) gaps.push(`${path}: never null`);
      const set = values.filter((v) => v !== null);
      if (set.length === 0) gaps.push(`${path}: never set`);
      return [...gaps, ...coverageGaps(d['of'] ?? null, set, path, enums)];
    }
    case 'enum': {
      if (!enums || ENUM_COVERAGE_EXEMPT.has(path)) return [];
      const seen = new Set(values);
      return (d['values'] as readonly Desc[])
        .filter((v) => !seen.has(v))
        .map((v) => `${path}: never ${JSON.stringify(v)}`);
    }
    case 'object': {
      const fields = asObject(d['fields'] ?? {});
      return Object.entries(fields).flatMap(([key, sub]) =>
        coverageGaps(
          sub,
          values.map((v) => (v as Record<string, unknown>)[key]),
          path === '' ? key : `${path}.${key}`,
          enums,
        ),
      );
    }
    case 'array': {
      const of = asObject(d['of'] ?? {});
      const kind = of['type'] === 'nullable' ? asObject(of['of'] ?? {})['type'] : of['type'];
      if (kind !== 'object' && kind !== 'variants') return [];
      return coverageGaps(
        d['of'] ?? null,
        values.flatMap((v) => v as unknown[]),
        `${path}[]`,
        enums,
      );
    }
    case 'variants': {
      const key = d['key'] as string;
      const options = asObject(d['options'] ?? {});
      return Object.entries(options).flatMap(([tag, sub]) => {
        const group = values.filter((v) => (v as Record<string, unknown>)[key] === tag);
        return group.length === 0
          ? [`${path}: never ${tag}`]
          : coverageGaps(sub, group, `${path}<${tag}>`, false);
      });
    }
    default:
      return [];
  }
}

describe('the version-1 fixture (section 9.4)', () => {
  it('holds exactly the version-1 backed-up stores, each with at least one row', () => {
    expect(Object.keys(tables)).toEqual(BACKUP_TABLES_BY_VERSION[1]);
    for (const [name, rows] of Object.entries(tables)) expect(rows.length, name).toBeGreaterThan(0);
  });

  it('passes the version-1 specs unchanged, with every field in spec order', () => {
    const validated = validateSnapshot(tables, SPECS_V1);
    expect(JSON.stringify(validated)).toBe(JSON.stringify(snapshotV1));
  });

  it('passes the cross-record invariants', () => {
    expect(() => {
      checkInvariants(snapshotV1);
    }).not.toThrow();
  });

  it('lists rows in primary-key order, as an export writes them', () => {
    for (const [name, rows] of Object.entries(tables)) {
      const spec = SPECS_V1[name];
      if (spec === undefined) throw new Error(name);
      for (let i = 1; i < rows.length; i++) {
        expect(
          comparePrimaryKeys(primaryKeyOf(spec, rows[i - 1]), primaryKeyOf(spec, rows[i])),
          name,
        ).toBeLessThan(0);
      }
    }
  });

  it('has every nullable field both null and set, and every enum value, in every non-singleton store', () => {
    const gaps = Object.entries(tables)
      .filter(([name]) => !SINGLETONS.has(name))
      .flatMap(([name, rows]) => coverageGaps(SPECS_V1[name]?.row.desc ?? null, rows, name, true));
    expect(gaps).toEqual([]);
  });

  it('the coverage check reports a field that is never set and an enum value that never appears', () => {
    const weights = (tables.weights ?? []).map((w) => ({
      ...(w as object),
      note: null,
      source: 'manual',
    }));
    expect(coverageGaps(SPECS_V1['weights']?.row.desc ?? null, weights, 'weights', true)).toEqual([
      'weights.source: never "onboarding"',
      'weights.note: never set',
    ]);
  });

  it('is pinned: a released fixture cannot be edited', async () => {
    expect(await sha256Hex(JSON.stringify(snapshotV1))).toBe(SNAPSHOT_V1_SHA256);
  });
});
