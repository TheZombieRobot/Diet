import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FEASIBILITY_DOC, scanHistory, scanRepo } from './scan';

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
      { cwd: root, stdio: 'pipe' },
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
  ])('%s: seeding %s fails, removing it passes', (_name, file, content, ruleId) => {
    write(file, content);
    expect(ruleIds()).toContain(ruleId);
    rmSync(join(root, file));
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
