// @vitest-environment node
// Why transaction scopes must be synchronous (storage spec section 8.5; D15; section 16 test 37).
// (a) documents the hazard with real Dexie on fake-indexeddb: waiting on a timer between clear()
// and bulkAdd() lets IndexedDB commit the clear, so the store is left empty and the write fails.
// If a later fake-indexeddb stops reproducing this, delete this test and keep the scan
// (tools/scans/txScope.test.ts, test 38).
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { freshDeps } from './testKit';

describe('transactions must not commit early (section 8.5)', () => {
  it('(a) an async scope that awaits a timer between clear() and bulkAdd() empties the store and rejects', async () => {
    const deps = freshDeps();
    const db = new Dexie('example-hazard', deps);
    db.version(1).stores({ rows: 'id' });
    await db.open();
    await db.table('rows').bulkAdd([{ id: 'a' }, { id: 'b' }]);

    const hazard = db.transaction('rw', 'rows', async () => {
      await db.table('rows').clear();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      await db.table('rows').bulkAdd([{ id: 'c' }]);
    });
    await expect(hazard).rejects.toMatchObject({
      name: expect.stringMatching(/^(?:PrematureCommitError|TransactionInactiveError)$/) as string,
    });
    // The clear was committed with nothing added back: the records are gone.
    expect(await db.table('rows').count()).toBe(0);
    db.close();
  });

  it('the same write as one synchronous scope of Dexie requests is all or nothing', async () => {
    const deps = freshDeps();
    const db = new Dexie('example-safe', deps);
    db.version(1).stores({ rows: 'id' });
    await db.open();
    await db.table('rows').bulkAdd([{ id: 'a' }, { id: 'b' }]);
    const failing = db.transaction('rw', 'rows', () =>
      Dexie.Promise.all([
        db.table('rows').clear(),
        db.table('rows').bulkAdd([{ id: 'c' }, { id: 'c' }]),
      ]),
    );
    await expect(failing).rejects.toBeDefined();
    expect((await db.table('rows').toArray()).map((r: { id: string }) => r.id)).toEqual(['a', 'b']);
    db.close();
  });
});
