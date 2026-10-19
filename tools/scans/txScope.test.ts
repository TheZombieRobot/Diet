import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRepoFiles } from './scan';
import { isScannedForScopes, scanTransactionScopes, type ScopeProblem } from './txScope';

// Storage spec section 8.5 and section 16 test 38 (D15): transaction scopes are synchronous and
// hold only Dexie requests, so a transaction can never commit early and wipe the phone.
const root = resolve(import.meta.dirname, '../..');
const rules = (problems: readonly ScopeProblem[]) => problems.map((p) => p.rule);

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
      const outside = async () => { await crypto.subtle.digest('SHA-256', data); };
      const obj = { crypto: 1, window: 2 };`;
    expect(scanTransactionScopes('fixture.ts', fixture)).toEqual([]);
  });

  it('passes the phone app sources (every scope in apps/mobile-web/src)', () => {
    const files = listRepoFiles(root).filter(isScannedForScopes);
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('apps/mobile-web/src/db/snapshot.ts');
    const problems = files.flatMap((file) =>
      scanTransactionScopes(file, readFileSync(join(root, file), 'utf8')),
    );
    expect(problems.map((p) => `${p.file}:${String(p.line)} ${p.rule}`)).toEqual([]);
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
