import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRepoFiles } from './scan';
import {
  isScannedForScopes,
  type ModuleResolver,
  scanTransactionScopes,
  type ScopeProblem,
} from './txScope';

// Storage spec section 8.5 and section 16 test 38 (D15): transaction scopes are synchronous and
// hold only Dexie requests, so a transaction can never commit early and wipe the phone.
const root = resolve(import.meta.dirname, '../..');
const rules = (problems: readonly ScopeProblem[]) => problems.map((p) => p.rule);

/** Relative imports of the phone app's source, read from the repository. */
const fromRepo =
  (overrides: Readonly<Record<string, string>> = {}): ModuleResolver =>
  (fromFile, specifier) => {
    const base = normalize(join(dirname(fromFile), specifier));
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
      const file = candidate.split('\\').join('/');
      const override = overrides[file];
      if (override !== undefined) return { file, text: override };
      if (existsSync(join(root, file)))
        return { file, text: readFileSync(join(root, file), 'utf8') };
    }
    return null;
  };

/** A file of the phone app's database code with `from` replaced by `to` (exactly once). */
function seeded(file: string, from: string, to: string): string {
  const text = readFileSync(join(root, file), 'utf8');
  expect(text.split(from).length - 1, `${file} holds "${from}" once`).toBe(1);
  return text.replace(from, to);
}

describe('transaction-scope scan (section 8.5)', () => {
  it('reports a WebCrypto await between clear() and bulkAdd() in an import write', () => {
    const fixture = `
      export function importWrite(db, rows) {
        return db.transaction('rw', ['weights'], async () => {
          await db.weights.clear();
          await crypto.subtle.digest('SHA-256', new Uint8Array(1));
          await db.weights.bulkAdd(rows);
        });
      }`;
    expect(rules(scanTransactionScopes('fixture.ts', fixture))).toEqual(
      expect.arrayContaining(['async', 'await', 'forbidden-name']),
    );
  });

  it('reports a try statement, a .catch() and a .finally() inside a scope', () => {
    const fixture = `
      db.transaction('rw', ['weights'], () => {
        try {
          return db.weights.bulkAdd(rows);
        } catch {
          return undefined;
        }
      });
      db.transaction('rw', ['weights'], () => db.weights.bulkAdd(rows).catch(() => undefined));
      db.transaction('rw', ['weights'], () => db.weights.bulkAdd(rows).finally(() => undefined));`;
    expect(rules(scanTransactionScopes('fixture.ts', fixture)).sort()).toEqual([
      'catch',
      'finally',
      'try',
    ]);
  });

  it('reports a .then() on a promise that is not a Dexie request', () => {
    const fixture = `
      const ready = Promise.resolve();
      db.transaction('rw', ['weights'], () => ready.then(() => db.weights.clear()));
      db.transaction('rw', ['weights'], () => helper(db).then(() => db.weights.clear()));`;
    expect(rules(scanTransactionScopes('fixture.ts', fixture))).toEqual([
      'then-receiver',
      'then-receiver',
    ]);
  });

  it('follows a scope passed by name, upgrade and populate scopes, and tagged functions', () => {
    const fixture = `
      function write() { return setTimeout(() => undefined, 0); }
      db.transaction('rw', ['weights'], write);
      db.version(2).stores({}).upgrade((tx) => navigator.storage);
      db.on('populate', (tx) => window.alert);
      /** @transactionScope */
      export function step(tx) { return confirm('x'); }`;
    expect(rules(scanTransactionScopes('fixture.ts', fixture))).toEqual([
      'forbidden-name',
      'forbidden-name',
      'forbidden-name',
      'forbidden-name',
    ]);
  });

  it('accepts the allowed patterns: chains rooted at db, tx or Dexie.Promise, and throws', () => {
    const fixture = `
      db.transaction('rw', ['weights'], () =>
        db.weights.get(id).then((row) => {
          if (row === undefined) throw new Error('missing');
          return db.weights.put(row).then(() => row);
        }));
      db.transaction('rw', ['a', 'b'], () => {
        const ops = [];
        for (const t of tables) ops.push(db.table(t).clear(), db.table(t).bulkAdd(rows[t]));
        return Dexie.Promise.all(ops).then(() => undefined);
      });
      db.version(2).stores({}).upgrade((tx) => tx.table('a').toArray().then((rows) => rows));
      /** @transactionScope A rule chosen at run time, tagged where it is declared. */
      const check = rules.check ?? noCheck;
      db.transaction('rw', ['weights'], () =>
        Dexie.Promise.all([check(row), db.weights.toArray(), db.table('a').count()]));
      const outside = async () => { await crypto.subtle.digest('SHA-256', data); };
      const obj = { crypto: 1, window: 2 };`;
    expect(scanTransactionScopes('fixture.ts', fixture)).toEqual([]);
  });

  it('passes the phone app sources (every scope in apps/mobile-web/src, helpers followed)', () => {
    const files = listRepoFiles(root).filter(isScannedForScopes);
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('apps/mobile-web/src/db/snapshot.ts');
    const problems = files.flatMap((file) =>
      scanTransactionScopes(file, readFileSync(join(root, file), 'utf8'), fromRepo()),
    );
    expect(problems.map((p) => `${p.file}:${String(p.line)} ${p.rule}`)).toEqual([]);
  });

  it('follows a helper a scope calls: an await of WebCrypto inside it is reported (the import-write hazard)', () => {
    const fixture = `
      async function digestFirst(rows) {
        await crypto.subtle.digest('SHA-256', new Uint8Array(1));
        return rows;
      }
      export function importWrite(db, rows) {
        return db.transaction('rw', ['weights'], () =>
          db.weights.clear().then(() => digestFirst(rows)).then((r) => db.weights.bulkAdd(r)),
        );
      }`;
    expect(rules(scanTransactionScopes('fixture.ts', fixture))).toEqual(
      expect.arrayContaining(['async', 'await', 'forbidden-name']),
    );
  });

  it('follows a helper passed on by name, a sleep() helper, nested helpers, and object-literal methods', () => {
    const passed = `
      async function hash(rows) { await crypto.subtle.digest('SHA-256', rows); return rows; }
      db.transaction('rw', ['weights'], () => db.weights.toArray().then(hash));`;
    expect(rules(scanTransactionScopes('fixture.ts', passed))).toContain('await');
    const sleep = `
      function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
      function pause() { return sleep(0); }
      db.transaction('rw', ['weights'], () => db.weights.clear().then(() => pause()));`;
    expect(rules(scanTransactionScopes('fixture.ts', sleep)).sort()).toEqual([
      'forbidden-name',
      'non-dexie-promise',
    ]);
    const swallow = `
      const helpers = { add: (db, rows) => db.weights.bulkAdd(rows).catch(() => undefined) };
      db.transaction('rw', ['weights'], () => helpers.add(db, rows));`;
    expect(rules(scanTransactionScopes('fixture.ts', swallow))).toEqual(['catch']);
    const tryHelper = `
      const write = (db, rows) => { try { return db.weights.bulkAdd(rows); } catch { return null; } };
      db.transaction('rw', ['weights'], () => write(db, rows));`;
    expect(rules(scanTransactionScopes('fixture.ts', tryHelper))).toEqual(['try']);
  });

  it('follows a helper imported from another file of the project', () => {
    const helper = 'export async function settle() { await Promise.resolve(); }';
    const resolver: ModuleResolver = (_from, specifier) =>
      specifier === './helper' ? { file: 'helper.ts', text: helper } : null;
    const fixture = `
      import { settle } from './helper';
      db.transaction('rw', ['weights'], () => db.weights.clear().then(() => settle()));`;
    const problems = scanTransactionScopes('fixture.ts', fixture, resolver);
    expect(problems.map((p) => [p.file, p.rule])).toEqual(
      expect.arrayContaining([
        ['helper.ts', 'async'],
        ['helper.ts', 'await'],
      ]),
    );
    // Without the project's files the imported helper is out of sight.
    expect(scanTransactionScopes('fixture.ts', fixture)).toEqual([]);
  });

  it('F17: follows a scope passed by an imported name (a WebCrypto wait inside it is reported)', () => {
    const helper = `
      export function writeAll(rows) {
        return crypto.subtle.digest('SHA-256', new Uint8Array(1)).then(() => db.weights.bulkAdd(rows));
      }`;
    const resolver: ModuleResolver = (_from, specifier) =>
      specifier === './helper' ? { file: 'helper.ts', text: helper } : null;
    const fixture = `
      import { writeAll } from './helper';
      db.transaction('rw', ['weights'], writeAll);`;
    expect(rules(scanTransactionScopes('fixture.ts', fixture, resolver)).sort()).toEqual([
      'forbidden-name',
      'then-receiver',
    ]);
  });

  it.each([
    [
      'a Blob read given to Dexie.Promise.all',
      'Dexie.Promise.all([db.transfer_pairings.clear(), new Blob([]).arrayBuffer()])',
      ['non-dexie-promise'],
    ],
    [
      'a non-request mapped into Dexie.Promise.all',
      'Dexie.Promise.all(names.map((name) => later(name)))',
      ['non-dexie-promise'],
    ],
    [
      'a database method that is not a store request',
      'db.waitForPersist().then(() => db.weights.clear())',
      ['then-receiver'],
    ],
    [
      'the global Promise',
      'Promise.resolve().then(() => db.weights.clear())',
      ['non-dexie-promise', 'then-receiver'],
    ],
    [
      'a new Promise',
      'new Promise((resolve) => resolve(db.weights.clear()))',
      ['non-dexie-promise'],
    ],
    [
      'caches through globalThis',
      'Dexie.Promise.resolve(globalThis.caches.keys())',
      ['forbidden-name'],
    ],
    [
      'a global reached by element access',
      "Dexie.Promise.resolve(globalThis['cach' + 'es'].keys())",
      ['forbidden-name'],
    ],
    ['a MessageChannel', 'db.weights.clear().then(() => new MessageChannel())', ['forbidden-name']],
  ])('F17: reports %s inside a scope', (_name, body, expected) => {
    const fixture = `db.transaction('rw', ['weights'], () => ${body});`;
    expect(rules(scanTransactionScopes('fixture.ts', fixture)).sort()).toEqual(expected);
  });

  it('catches the mutations from the review of the real code: an awaiting store rule (G1), a swallowed garden removal (G2), and an import write through an async helper (G3)', () => {
    const crud = 'apps/mobile-web/src/db/repos/crud.ts';
    const g1 = seeded(
      crud,
      '  check: ({ db }, row) =>\n    db.weights.toArray()',
      "  check: async ({ db }, row) => {\n    await crypto.subtle.digest('SHA-256', new Uint8Array(1));\n    return db.weights.toArray()",
    ).replace(
      "        throw new StorageInvariantError('weight-onboarding');\n      }\n    }),\n};",
      "        throw new StorageInvariantError('weight-onboarding');\n      }\n    });\n  },\n};",
    );
    expect(rules(scanTransactionScopes(crud, g1, fromRepo()))).toEqual(
      expect.arrayContaining(['async', 'await', 'forbidden-name']),
    );
    const g2 = seeded(
      crud,
      'db.garden_photos.delete(String(key)),',
      'db.garden_photos.delete(String(key)).catch(() => undefined),',
    );
    expect(rules(scanTransactionScopes(crud, g2, fromRepo()))).toContain('catch');
    const snapshot = 'apps/mobile-web/src/db/snapshot.ts';
    const g3 = seeded(
      snapshot,
      "  return db.transaction('rw', db.expectedStoreNames, () => {",
      "  return db.transaction('rw', db.expectedStoreNames, () => writeAll(db, snapshot, gardenIds));\n}\n\nasync function writeAll(db: DietDb, snapshot: Snapshot, gardenIds: string[]): Promise<unknown> {\n  await crypto.subtle.digest('SHA-256', new Uint8Array(1));\n  {",
    );
    expect(rules(scanTransactionScopes(snapshot, g3, fromRepo()))).toEqual(
      expect.arrayContaining(['async', 'await', 'forbidden-name']),
    );
  });

  it('follows the real helpers across files: a timer seeded into prepare() is reported from every scope that writes', () => {
    const prepareFile = 'apps/mobile-web/src/db/prepare.ts';
    const seededPrepare = seeded(
      prepareFile,
      '  const normalized = normalizeRow(table, candidate);',
      '  void setTimeout(() => undefined, 0);\n  const normalized = normalizeRow(table, candidate);',
    );
    const resolver = fromRepo({ [prepareFile]: seededPrepare });
    for (const file of [
      'apps/mobile-web/src/db/repos/crud.ts',
      'apps/mobile-web/src/db/repos/kickstart.ts',
      'apps/mobile-web/src/db/repos/cardState.ts',
    ]) {
      const problems = scanTransactionScopes(
        file,
        readFileSync(join(root, file), 'utf8'),
        resolver,
      );
      expect(
        problems.map((p) => [p.file, p.rule]),
        file,
      ).toContainEqual([prepareFile, 'forbidden-name']);
    }
  });

  it('finds the scopes in the real database code: a timer seeded into each is reported', () => {
    const files = ['snapshot.ts', 'upgrade.ts', 'repos/crud.ts', 'repos/kickstart.ts'];
    for (const file of files) {
      const text = readFileSync(join(root, 'apps/mobile-web/src/db', file), 'utf8');
      expect(scanTransactionScopes(file, text), file).toEqual([]);
      // Into the first transaction scope's arrow, or else the first tagged scope's body.
      const arrow = text.includes('.transaction(');
      const at = arrow
        ? text.indexOf('() =>', text.indexOf('.transaction(')) + '() =>'.length
        : text.indexOf('{', text.indexOf('export function', text.indexOf('@transactionScope'))) + 1;
      const timer = arrow
        ? ' void setTimeout(() => undefined, 0) ||'
        : ' void setTimeout(() => undefined, 0);';
      const seeded = `${text.slice(0, at)}${timer}${text.slice(at)}`;
      expect(rules(scanTransactionScopes(file, seeded)), file).toContain('forbidden-name');
    }
  });
});
