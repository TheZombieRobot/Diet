import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FEASIBILITY_DOC, gitEnv, listRepoFiles, scanHistory, scanRepo } from './scan';

// Checklist item 3 acceptance: a seeded violation fails the scan; removing it passes again.
// Runs against throwaway git repositories so the real repository is never touched. Every seed is
// an obviously synthetic string. Case names start with the rule ID they prove (for the item 36
// coverage table).
describe('seeded violations in a throwaway repository', () => {
  let root: string;

  const write = (file: string, content: string | Uint8Array) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Seed',
        '-c',
        'user.email=seed@example.com',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ],
      { cwd: root, stdio: 'pipe', env: gitEnv() },
    );
  const commitAll = (message: string) => {
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', message);
  };
  const ruleIds = () => scanRepo(root).map((v) => v.ruleId);
  const historyRuleIds = () => scanHistory(root).map((v) => v.ruleId);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'diet-scan-'));
    git('init', '-q');
    writeFileSync(join(root, '.gitignore'), 'docs/private/\n*.backup.json\n');
    write(
      'packages/core/src/copy/health.ts',
      "export const ok = 'No alcohol use is risk-free.';\n",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('a clean tree and history pass', () => {
    expect(scanRepo(root)).toEqual([]);
    commitAll('Clean start');
    expect(scanHistory(root)).toEqual([]);
  });

  it('a shallow clone fails loudly instead of passing on part of the history (F47)', () => {
    commitAll('Clean start');
    write('src/a.ts', 'export const a = 1;\n');
    commitAll('Second');
    const shallow = mkdtempSync(join(tmpdir(), 'diet-scan-shallow-'));
    try {
      execFileSync('git', ['clone', '-q', '--depth', '1', `file://${root}`, shallow], {
        stdio: 'pipe',
        env: gitEnv(),
      });
      expect(() => scanHistory(shallow)).toThrow(/shallow/);
    } finally {
      rmSync(shallow, { recursive: true, force: true });
    }
  });

  // The pre-commit hook runs these tests. Inside a hook, git exports GIT_DIR, GIT_INDEX_FILE and
  // GIT_WORK_TREE, which in a linked worktree point at the real repository; the throwaway
  // repository must still be the one that is read and written.
  it('git variables exported by a hook never redirect the throwaway repository', () => {
    const other = mkdtempSync(join(tmpdir(), 'diet-scan-other-'));
    const saved = { ...process.env };
    try {
      execFileSync('git', ['init', '-q'], { cwd: other, stdio: 'pipe', env: gitEnv() });
      process.env.GIT_DIR = join(other, '.git');
      process.env.GIT_INDEX_FILE = join(other, '.git', 'index');
      process.env.GIT_WORK_TREE = other;
      write('src/a.ts', 'export const a = 1;\n');
      expect(listRepoFiles(root)).toContain('src/a.ts');
      commitAll('Clean start');
      expect(scanHistory(root)).toEqual([]);
      const head = (cwd: string) =>
        execFileSync('git', ['rev-list', '--all', '--count'], { cwd, env: gitEnv() })
          .toString()
          .trim();
      expect(head(root)).toBe('1');
      expect(head(other)).toBe('0');
    } finally {
      process.env = saved;
      rmSync(other, { recursive: true, force: true });
    }
  });

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0, 1, 2]);
  const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from('note: I weigh 101 kg\n', 'utf16le')]);

  it.each([
    [
      'HS-07 quit date',
      'packages/core/src/copy/health.ts',
      "export const bad = 'Pick a quit date';\n",
      'taper-quit-date',
    ],
    [
      'HS-07 taper split across a concatenation',
      'packages/core/src/copy/health.ts',
      "export const bad =\n  'Cut it down ' +\n  'by one a day';\n",
      'taper-cut-down-by',
    ],
    [
      'HS-08 blood alcohol',
      'apps/mobile-web/src/Drinks.tsx',
      'export const t = <p>Estimated BAC 0.05</p>;\n',
      'bac',
    ],
    [
      'HS-08 driving',
      'apps/mobile-web/src/Drinks.tsx',
      'export const t = <p>Wait before getting behind the wheel</p>;\n',
      'behind-the-wheel',
    ],
    [
      'HS-19 calories left',
      'apps/mobile-web/src/Today.tsx',
      'export const t = <p>{n} kcal <span>left</span></p>;\n',
      'energy-left',
    ],
    [
      'HS-19 room for drinks',
      'apps/mobile-web/src/Today.tsx',
      "export const t = 'You have room for two more';\n",
      'drink-budget',
    ],
    [
      'HS-21 kg in N weeks',
      'apps/mobile-web/src/Weight.tsx',
      'export const t = (kg: number, n: number) => `Lose ${kg} kg in ${n} weeks`;\n',
      'kg-in-time',
    ],
    [
      'HS-16 "$" price',
      'apps/mobile-web/src/List.tsx',
      'export const t = (price: number) => <td>${price}</td>;\n',
      'currency-placeholder',
    ],
    [
      'HS-16 "in stock"',
      'apps/mobile-web/src/List.tsx',
      'export const t = <p>In stock now</p>;\n',
      'stock-status',
    ],
    [
      'HS-16 "added to cart"',
      'packages/grocery/src/status.ts',
      "export const s = 'Added to cart';\n",
      'cart-status',
    ],
    [
      'HS-14 network call',
      'apps/mobile-web/src/api.ts',
      'export const go = () => fetch("/x");\n',
      'fetch',
    ],
    [
      'no-ai-runtime AI SDK import',
      'apps/mobile-web/src/suggest.ts',
      "import { generateText } from 'ai';\nexport { generateText };\n",
      'ai-import',
    ],
    [
      'privacy first-person health number',
      'packages/test-fixtures/src/me.ts',
      "export const n = 'I weigh 101 kg';\n",
      'first-person-health',
    ],
    ['privacy lab result in a doc', 'docs/notes.md', 'Total cholesterol 6.2\n', 'lab-result'],
    ['privacy handoff file', 'Handoff.md', '# Notes\n', 'handoff-file'],
    ['privacy handoff file under tools/', 'tools/scans/Handoff.md', '# Notes\n', 'handoff-file'],
    ['privacy backup file', 'exports/diet-backup-2000-01-01.json', '{}\n', 'backup-file'],
    ['privacy photo', 'apps/mobile-web/public/IMG_0001.jpg', jpeg, 'photo-format'],
    ['privacy photo under tools/', 'tools/scans/garden.jpg', jpeg, 'photo-format'],
    ['privacy PDF', 'docs/results.pdf', pdf, 'document-or-data-file'],
    ['privacy UTF-16 text', 'packages/test-fixtures/src/notes.csv', utf16, 'first-person-health'],
    ['secrets .dev.vars', 'services/relay/.dev.vars', 'X=1\n', 'secret-file'],
    [
      'HS-14 importScripts in the service worker settings',
      'apps/mobile-web/vite.config.ts',
      "export default { workbox: { importScripts: ['./extra-sw.js'], runtimeCaching: [] } };\n",
      'sw-import-scripts',
    ],
    [
      'HS-14 absolute URL in the offline copy',
      'apps/mobile-web/vite.config.ts',
      "export default {\n  workbox: {\n    additionalManifestEntries: [{ url: 'https://example.org/beacon.gif', revision: '1' }],\n  },\n};\n",
      'sw-absolute-manifest-entry',
    ],
    [
      'HS-14 run-time caching in the service worker',
      'apps/mobile-web/vite.config.ts',
      "export default { workbox: { runtimeCaching: [{ urlPattern: /x/, handler: 'CacheFirst' }] } };\n",
      'sw-runtime-caching',
    ],
    [
      'HEALTH_SAFETY-7 Workbox from its CDN',
      'apps/mobile-web/index.html',
      '<script src="https://storage.googleapis.com/workbox-cdn/releases/7.4.0/workbox-sw.js"></script>\n',
      'remote-asset',
    ],
    [
      'conventions help number in a screen',
      'apps/mobile-web/src/screens/MoveScreen.tsx',
      'export const t = <p>Stop and call 111 if it does not settle.</p>;\n',
      'health-text-help-number',
    ],
    [
      'conventions help line named in a screen',
      'apps/mobile-web/src/screens/AboutScreen.tsx',
      "export const t = 'Alcohol Drug Helpline by text';\n",
      'health-text-service',
    ],
    [
      'conventions GP named in the design system',
      'packages/ui/src/components/Note.tsx',
      'export const t = <p>Ask your GP first.</p>;\n',
      'health-text-gp',
    ],
    [
      'TEST_PLAN-5 skipped test',
      'packages/core/src/x.test.ts',
      "it.skip('x', () => {});\n",
      'disabled-test',
    ],
    // Item 19 (D1; GD-02, HS-15): only the named files reach the photo store, by name or generically.
    [
      'GD-02 the photo store named in an exporter',
      'packages/grocery/src/export.ts',
      'export const rows = (db: Db) => db.garden_photos.toArray();\n',
      'device-only-store-name',
    ],
    [
      'GD-02 a loop over every store name',
      'apps/mobile-web/src/exportAll.ts',
      'export async function all(db: Db) {\n  for (const n of STORE_NAMES) await db.table(n).toArray();\n}\n',
      'generic-store-access',
    ],
    [
      'GD-02 every Dexie table',
      'apps/mobile-web/src/exportAll.ts',
      'export const all = (db: Db) => Promise.all(db.tables.map((t) => t.toArray()));\n',
      'generic-store-access',
    ],
    [
      'GD-02 the device-only list',
      'apps/mobile-web/src/exportAll.ts',
      "import { DEVICE_ONLY_TABLES } from '@diet/core';\nexport const extra = DEVICE_ONLY_TABLES;\n",
      'generic-store-access',
    ],
    [
      'GD-02 a store reached by a computed name',
      'apps/mobile-web/src/exportAll.ts',
      'export const rows = (db: Db, name: string) => db[name].toArray();\n',
      'generic-store-access',
    ],
  ])('%s: seeding %s fails, removing it passes', (_name, file, content, ruleId) => {
    write(file, content);
    expect(ruleIds()).toContain(ruleId);
    rmSync(join(root, file));
    expect(scanRepo(root)).toEqual([]);
  });

  it('LS1 HS-16, NN-05: a grocery file printing "$" or formatting currency fails; the price file passes', () => {
    const code =
      "export const s = (amount: string) => '$' + amount;\nexport const f = { style: 'currency' };\n";
    write('packages/grocery/src/list/export.ts', code);
    expect(ruleIds()).toEqual(
      expect.arrayContaining(['currency-placeholder', 'intl-currency-style']),
    );
    rmSync(join(root, 'packages/grocery/src/list/export.ts'));
    write('packages/grocery/src/list/price.ts', code);
    expect(scanRepo(root)).toEqual([]);
  });

  it('conventions: health text in health.ts, tests and comments is allowed', () => {
    write(
      'packages/core/src/copy/health.ts',
      "export const help = { name: 'Healthline (24/7 health advice)', number: '0800 611 116' };\nexport const gp = 'Talk to your GP; call 111.';\n",
    );
    write(
      'apps/mobile-web/src/App.test.tsx',
      "export const expected = ['tel:111', 'sms:8681', 'Healthline', 'GP'];\n",
    );
    write(
      'apps/mobile-web/src/screens/AboutScreen.tsx',
      '// The 111 row comes from health.ts.\nexport const n = 1;\n',
    );
    write(
      'apps/mobile-web/vite.config.ts',
      'export default { workbox: { runtimeCaching: [] } };\n',
    );
    expect(scanRepo(root)).toEqual([]);
  });

  it('GD-02: a named file may reach the photo store; tests may too', () => {
    write(
      'apps/mobile-web/src/garden/photoStore.ts',
      'export const ids = (repos: Repos) => repos.gardenPhotos.ids();\n',
    );
    write(
      'apps/mobile-web/src/db/snapshot.ts',
      'export const all = (db: Db) => BACKUP_TABLES.map((name) => db.table(name).toArray());\n',
    );
    write('apps/mobile-web/src/x.test.ts', 'export const n = db.garden_photos.count();\n');
    expect(scanRepo(root)).toEqual([]);
  });

  // Item 19 review (high): every way the earlier regular expressions were passed, read now with
  // the compiler and its types. A typed database (DEXIE below) stands in for the app's DietDb.
  describe('GD-02: the device-only scan reads the code with its types', () => {
    const DEXIE =
      'declare class Dexie {\n' +
      '  tables: { name: string }[];\n' +
      '  core: { schema: { tables: unknown[] } };\n' +
      '  _allTables: Record<string, unknown>;\n' +
      '  table(name: string): { toArray(): Promise<unknown[]> };\n' +
      '}\n' +
      'declare const storage: { db: Dexie };\n';
    const app = 'apps/mobile-web/src/garden/exportEverything.ts';
    // A store accessor in an allowed file: a generic repository takes any store's name.
    const crud =
      "export type StoreName = 'garden' | 'garden_photos';\n" +
      'export function crudRepo<K extends StoreName>(ctx: unknown, table: K) {\n' +
      '  return [ctx, table];\n' +
      '}\n';

    it.each([
      [
        'the review repro: an alias, every table, a template and a concatenated name',
        app,
        `${DEXIE}export async function everything() {\n  const database = storage.db;\n  await Promise.all(database.tables.map((t) => t.name));\n  await Promise.all(database.tables.map((t) => storage.db.table(\`\${t.name}\`).toArray()));\n  await storage.db.table('garden_' + 'photos').toArray();\n}\n`,
        ['generic-store-access', 'device-only-store-name'],
      ],
      [
        'a database under another name (alias)',
        app,
        `${DEXIE}const database = storage.db;\nexport const all = database.tables.map((t) => t.name);\n`,
        ['generic-store-access'],
      ],
      [
        'a database held on a class (this.database.tables)',
        app,
        `${DEXIE}export class Exporter {\n  constructor(private readonly database: Dexie) {}\n  all() {\n    return this.database.tables;\n  }\n}\n`,
        ['generic-store-access'],
      ],
      [
        'a template as the store name',
        app,
        `${DEXIE}export const rows = (n: string) => storage.db.table(\`\${n}\`).toArray();\n`,
        ['generic-store-access'],
      ],
      [
        'a concatenated literal as the store name',
        app,
        `${DEXIE}export const rows = () => storage.db.table('garden' + '_photos').toArray();\n`,
        ['generic-store-access', 'device-only-store-name'],
      ],
      [
        'the store name built from constants',
        app,
        "const a = 'garden_';\nconst b = 'photos';\nexport const name = `${a}${b}`;\n",
        ['device-only-store-name'],
      ],
      [
        'the store name with an escape in a string',
        app,
        `${DEXIE}export const rows = () => storage.db.table('garden\\u005fphotos').toArray();\n`,
        ['device-only-store-name'],
      ],
      [
        'the store name with an escape in an identifier',
        app,
        'export const rows = (db: { [k: string]: { toArray(): unknown } }) =>\n  db.garden\\u005fphotos.toArray();\n',
        ['device-only-store-name'],
      ],
      [
        "Dexie's own table list (_allTables)",
        app,
        `${DEXIE}export const all = Object.values(storage.db._allTables);\n`,
        ['generic-store-access'],
      ],
      [
        "Dexie's core schema",
        app,
        `${DEXIE}export const all = storage.db.core.schema.tables;\n`,
        ['generic-store-access'],
      ],
      [
        'a concatenated object-store name',
        app,
        "declare const tx: IDBTransaction;\nexport const req = tx.objectStore('garden' + '_photos').getAll();\n",
        ['generic-store-access', 'device-only-store-name'],
      ],
      [
        'an object store by a variable name',
        app,
        'export const all = (tx: IDBTransaction, name: string) => tx.objectStore(name).getAll();\n',
        ['generic-store-access'],
      ],
      [
        "IndexedDB's list of stores",
        app,
        'export const names = (idb: IDBDatabase) => [...idb.objectStoreNames];\n',
        ['generic-store-access'],
      ],
      [
        'a loop over every store name without .table()',
        app,
        "import { STORE_NAMES } from '@diet/core';\nexport const names: string[] = [];\nfor (const n of STORE_NAMES) names.push(n);\n",
        ['generic-store-access'],
      ],
      [
        "version 1's stores",
        app,
        "import { STORES_V1 } from '@diet/core';\nexport const names = Object.keys(STORES_V1);\n",
        ['generic-store-access'],
      ],
      [
        'the photo repository in the grocery package',
        'packages/grocery/src/photos.ts',
        'export const photo = (repos: { [k: string]: { get(id: string): unknown } }, id: string) =>\n  repos.gardenPhotos.get(id);\n',
        ['device-only-store-name'],
      ],
      [
        'the photo record type in a file that is not listed',
        'apps/mobile-web/src/screens/garden/photoRow.ts',
        "import type { GardenPhotoRecord } from '@diet/core';\nexport type Row = GardenPhotoRecord;\n",
        ['device-only-store-name'],
      ],
      [
        'every table from a file in the database folder that is not named',
        'apps/mobile-web/src/db/exportAll.ts',
        `${DEXIE}export const all = () => storage.db.tables.map((t) => t.name);\n`,
        ['generic-store-access'],
      ],
      [
        'the photo store in the backup code',
        'packages/core/src/storage/backup/photos.ts',
        "export const photos = 'garden_photos';\n",
        ['device-only-store-name'],
      ],
      [
        'the photo store in test data (no longer exempt)',
        'packages/test-fixtures/src/garden/export.ts',
        "export const store = 'garden_photos';\n",
        ['device-only-store-name'],
      ],
      [
        'a database cast to any',
        app,
        `${DEXIE}export const all = (storage.db as unknown as { tables: unknown }).tables;\n`,
        ['generic-store-access'],
      ],
      [
        'a database passed where its type is lost',
        app,
        `${DEXIE}export const all = Object.values(storage.db);\n`,
        ['generic-store-access'],
      ],
      [
        "a database passed through the project's own generic",
        app,
        `${DEXIE}function keys<T>(value: T): string[] {\n  return Object.keys(value as object);\n}\nexport const all = keys(storage.db);\n`,
        ['generic-store-access'],
      ],
      [
        'a database taken apart',
        app,
        `${DEXIE}const { tables } = storage.db;\nexport const all = tables;\n`,
        ['generic-store-access'],
      ],
      [
        'a computed member of a database',
        app,
        `${DEXIE}export const pick = (k: string) => (storage.db as Dexie & { [k: string]: unknown })[k];\n`,
        ['generic-store-access'],
      ],
      [
        'the table method kept to be called later',
        app,
        `${DEXIE}const read = storage.db.table.bind(storage.db);\nexport const rows = read('weights');\n`,
        ['generic-store-access'],
      ],
      [
        'IndexedDB opened outside the database files',
        app,
        "export const open = () => indexedDB.open('diet');\n",
        ['database-opened'],
      ],
      [
        'a second Dexie connection',
        app,
        `${DEXIE}export const db = new Dexie();\n`,
        ['database-opened'],
      ],
    ])('%s fails; removing it passes', (_name, file, content, ruleIdsExpected) => {
      write(file, content);
      expect(ruleIds()).toEqual(expect.arrayContaining(ruleIdsExpected));
      rmSync(join(root, file));
      expect(scanRepo(root)).toEqual([]);
    });

    it('a store accessor of an allowed file takes literal names only, and is not passed on', () => {
      write('apps/mobile-web/src/db/repos/crud.ts', crud);
      const uses = 'apps/mobile-web/src/db/repos/uses.ts';
      write(
        uses,
        "import { crudRepo, type StoreName } from './crud';\nexport const rows = (name: StoreName) => crudRepo(null, name);\n",
      );
      expect(ruleIds()).toEqual(['generic-store-access']);
      write(
        uses,
        "import { crudRepo as make } from './crud';\nconst again = make;\nexport const rows = again(null, 'garden');\n",
      );
      expect(ruleIds()).toEqual(['generic-store-access']);
      // A literal, or a name typed so it can never be the photo store, is fine.
      write(
        uses,
        "import { crudRepo } from './crud';\nexport const a = crudRepo(null, 'garden');\nexport const b = <K extends 'garden'>(t: K) => crudRepo(null, t);\n",
      );
      expect(scanRepo(root)).toEqual([]);
    });

    it('test data and test helpers are imported only by tests and other test helpers', () => {
      const screen = 'apps/mobile-web/src/screens/today/Example.tsx';
      write(
        screen,
        "import { fixtureId } from '@diet/test-fixtures';\nexport const id = fixtureId(1);\n",
      );
      expect(ruleIds()).toEqual(['test-only-import']);
      write(screen, "export { openTestDb } from '../../db/testKit';\n");
      expect(ruleIds()).toEqual(['test-only-import']);
      write(
        screen,
        "export const load = () => import('../../../../../packages/test-fixtures/src/garden/jpeg');\n",
      );
      expect(ruleIds()).toEqual(['test-only-import']);
      rmSync(join(root, screen));
      write(
        'apps/mobile-web/src/screens/today/todayTestKit.ts',
        "export { openTestDb } from '../../db/testKit';\nexport { fixtureId } from '@diet/test-fixtures';\n",
      );
      write(
        'apps/mobile-web/src/screens/today/Today.test.tsx',
        "import { fixtureId } from '@diet/test-fixtures';\nexport const id = fixtureId(1);\n",
      );
      expect(scanRepo(root)).toEqual([]);
    });

    it('what stays allowed: a typed object with its own tables, a literal store name, a typed database, the specs', () => {
      write(
        app,
        `${DEXIE}declare const payload: { tables: Record<string, unknown[]> };\nexport const n = Object.keys(payload.tables).length;\nexport const rows = () => storage.db.table('weights').toArray();\nconst database = storage.db;\nexport function keep(db: Dexie): Dexie {\n  return db;\n}\nexport const same = keep(database);\n`,
      );
      // A validator read by a store's name (the transfer payload checks a grocery list this way).
      write(
        'packages/grocery/src/check.ts',
        "import { checkRow, TABLES_V1 } from '@diet/core';\nexport const ok = (row: unknown) => checkRow('grocery_lists', row, TABLES_V1).ok;\n",
      );
      expect(scanRepo(root)).toEqual([]);
    });
  });

  it('privacy: ignored files (kept out of git) are not scanned, committed ones are', () => {
    write('docs/private/notes.md', 'I weigh 101 kg\n');
    expect(scanRepo(root)).toEqual([]);
    write('docs/notes.md', 'I weigh 101 kg\n');
    expect(scanRepo(root).map((v) => v.file)).toEqual(['docs/notes.md']);
  });

  it('privacy: a file force-added past .gitignore is still caught', () => {
    write('me.backup.json', '{}\n');
    git('add', '-f', 'me.backup.json');
    expect(ruleIds()).toContain('backup-file');
  });

  it('privacy: a leak committed and deleted in a later commit is caught in history', () => {
    commitAll('Clean start');
    write('notes.md', 'I weigh 101 kg\n');
    commitAll('Add notes');
    rmSync(join(root, 'notes.md'));
    commitAll('Remove notes');
    expect(scanRepo(root)).toEqual([]);
    expect(historyRuleIds()).toEqual(['first-person-health']);
  });

  it('privacy: a private file name stays in history after a rename', () => {
    write('Handoff.md', '# Notes\n');
    commitAll('Add file');
    git('mv', 'Handoff.md', 'notes.md');
    commitAll('Rename file');
    expect(scanRepo(root)).toEqual([]);
    expect(historyRuleIds()).toContain('handoff-file');
  });

  it('privacy: commit messages are checked', () => {
    commitAll('Log: my BMI is 31');
    expect(historyRuleIds()).toEqual(['first-person-health']);
  });

  describe('extension guard (INTEGRATION_FEASIBILITY.md 9.3)', () => {
    const decision = (text: string) =>
      `# Integration feasibility\n\n### 9.2 Recommendation\n*Pending.*\n\n### 9.3 Owner decision\n${text}\n`;
    const manifest = JSON.stringify(
      {
        manifest_version: 3,
        permissions: ['sidePanel', 'storage', 'scripting'],
        host_permissions: ['https://www.paknsave.co.nz/*'],
        content_scripts: [{ matches: ['https://www.paknsave.co.nz/*'], js: ['content.js'] }],
      },
      null,
      2,
    );

    it('CX-00: while 9.3 is pending, any extension file other than the README fails', () => {
      write(FEASIBILITY_DOC, decision('*Pending.* Mode: A / B / C. Date. Reason.'));
      write('apps/cart-extension/README.md', '# Extension\n');
      expect(scanRepo(root)).toEqual([]);
      write('apps/cart-extension/src/panel.ts', 'export const x = 1;\n');
      expect(ruleIds()).toEqual(['extension-before-decision']);
    });

    it('CX-00: with no decision document the guard stays closed', () => {
      write('apps/cart-extension/src/panel.ts', 'export const x = 1;\n');
      expect(ruleIds()).toEqual(['extension-before-decision']);
    });

    it('CX-01: after mode B is recorded, extension code is allowed but page access is not', () => {
      write(FEASIBILITY_DOC, decision('Mode: B. 2026-10-25. Guided search only.'));
      write('apps/cart-extension/src/panel.ts', 'export const x = 1;\n');
      expect(scanRepo(root)).toEqual([]);
      write('apps/cart-extension/manifest.json', manifest);
      expect(ruleIds()).toEqual([
        'extension-content-scripts',
        'extension-permission',
        'extension-store-host',
        'extension-store-host',
      ]);
      write('packages/grocery/src/x.ts', 'export const read = () => chrome.cookies;\n');
      expect(ruleIds()).toContain('extension-page-api');
    });

    it('CX-00: the unfilled template "Mode: A / B / C" does not approve mode A', () => {
      write(FEASIBILITY_DOC, decision('Mode: A / B / C. Date. Reason.'));
      write('apps/cart-extension/manifest.json', manifest);
      expect(ruleIds()).toContain('extension-content-scripts');
    });

    it('CX-01: after mode A is recorded, page access is allowed but document.cookie never is', () => {
      write(FEASIBILITY_DOC, decision('Mode: A. 2026-10-25. Written permission received.'));
      write('apps/cart-extension/manifest.json', manifest);
      expect(scanRepo(root)).toEqual([]);
      write('apps/cart-extension/src/content.ts', 'export const c = () => document.cookie;\n');
      expect(ruleIds()).toEqual(['document-cookie']);
    });
  });
});
