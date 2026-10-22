import { readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { NETWORK_ALLOWED_FILES } from './rules';
import { isTestFile, listRepoFiles } from './scan';

// Send to laptop (checklist item 31 design 5.6; Q1 to Q3; HS-14, HS-NN, L10, L57): shapes, not
// just words. One file may use the network, with one call shape; the test relay origin cannot
// reach a real build; the sending code reads only the list, its send fields and the pairing.
const root = resolve(import.meta.dirname, '../..');
const files = listRepoFiles(root);
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const CLIENT = 'apps/mobile-web/src/transfer/relayClient.ts';
const sourceOf = (code: string) => ts.createSourceFile('x.tsx', code, ts.ScriptTarget.Latest, true);

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => {
    walk(child, visit);
  });
}

/** Every fetch call whose first argument is not written as relayEndpoint(…). */
function fetchProblems(code: string): string[] {
  const problems: string[] = [];
  walk(sourceOf(code), (n) => {
    if (!ts.isCallExpression(n)) return;
    const callee = n.expression;
    const named =
      (ts.isIdentifier(callee) && callee.text === 'fetch') ||
      (ts.isPropertyAccessExpression(callee) && callee.name.text === 'fetch');
    if (!named) return;
    const [first] = n.arguments;
    const direct =
      first !== undefined &&
      ts.isCallExpression(first) &&
      ts.isIdentifier(first.expression) &&
      first.expression.text === 'relayEndpoint';
    if (!direct) problems.push(n.getText());
  });
  return problems;
}

describe('Q1 HS-14: one network file, one call shape', () => {
  it('only the relay client may use the network, and it holds no address', () => {
    expect(NETWORK_ALLOWED_FILES).toEqual([CLIENT]);
    expect(read(CLIENT)).not.toMatch(/https?:\/\//);
    expect(
      ts.preProcessFile(read(CLIENT), true, true).importedFiles.map((f) => f.fileName),
    ).toContain('@diet/core');
    expect(read(CLIENT)).toMatch(/import \{[^}]*\brelayEndpoint\b[^}]*\} from '@diet\/core'/);
  });

  it('every fetch in it takes relayEndpoint(…) directly; seeded copies fail', () => {
    expect(fetchProblems(read(CLIENT))).toEqual([]);
    expect(read(CLIENT)).toContain('deps.fetch(relayEndpoint(origin, slot), init)');
    for (const bad of [
      'const url = relayEndpoint(origin, slot); deps.fetch(url, init);',
      "fetch('https://example.com');",
      'globalThis.fetch(target);',
    ]) {
      expect(fetchProblems(bad), bad).toHaveLength(1);
    }
  });
});

describe('Q2 L10: the test relay origin cannot reach a real build', () => {
  it('no workflow or package script sets it, and vite.config.ts reads it only through buildRelayOrigin', () => {
    const configs = files.filter((f) => f.startsWith('.github/') || f.endsWith('package.json'));
    for (const file of configs) expect(read(file), file).not.toContain('DIET_TEST_RELAY_ORIGIN');
    const vite = read('apps/mobile-web/vite.config.ts');
    expect(vite).toContain('buildRelayOrigin(process.env[TEST_RELAY_ENV])');
    expect(vite).not.toContain('DIET_TEST_RELAY_ORIGIN');
  });
});

describe('Q3 HS-NN: the sending code reads only the list, its send fields and the pairing', () => {
  const SENDING = files.filter(
    (f) =>
      ((f.startsWith('apps/mobile-web/src/transfer/') && /\.tsx?$/.test(f)) ||
        f === 'apps/mobile-web/src/screens/list/SendAndExport.tsx' ||
        f === 'apps/mobile-web/src/screens/list/PastePanel.tsx') &&
      !isTestFile(f),
  );
  const PACKAGES = [
    'react',
    'dexie',
    '@diet/core',
    '@diet/core/relay',
    '@diet/core/copy/health',
    '@diet/grocery/transfer',
    '@diet/ui',
  ];
  const APP_FILES = [
    'db/repos/groceryTransfer',
    'db/liveQuery',
    'db/gate',
    'db/env',
    'db/runtime',
    'store',
    'format',
    'clipboard',
    'files',
    'routes',
    'screens/backup/Progress',
    'screens/backup/redraw',
    'screens/backup/focus',
    'screens/pairing/usePairing',
    'screens/list/ListExportButtons',
    'screens/list/PastePanel',
  ];
  /** Imports outside the allow-list: packages by name, app files resolved from apps/mobile-web/src. */
  function importProblems(file: string, code: string): string[] {
    return ts.preProcessFile(code, true, true).importedFiles.flatMap(({ fileName }) => {
      if (!fileName.startsWith('.')) return PACKAGES.includes(fileName) ? [] : [fileName];
      const target = posix.join(posix.dirname(file), fileName).replace('apps/mobile-web/src/', '');
      // The relative path to core's protocol, which vite.config.ts needs (buildOrigin.ts).
      if (target === 'packages/core/src/relay/protocol') return [];
      return target.startsWith('transfer/') || APP_FILES.includes(target) ? [] : [fileName];
    });
  }
  /** Repository names reached other than the list, its send fields and the pairing; any db access. */
  function accessProblems(code: string): string[] {
    const allowed = new Set(['groceryLists', 'groceryTransfer', 'pairing']);
    const problems: string[] = [];
    const isRepos = (e: ts.Expression) =>
      (ts.isIdentifier(e) && e.text === 'repos') ||
      (ts.isPropertyAccessExpression(e) && e.name.text === 'repos');
    walk(sourceOf(code), (n) => {
      if (ts.isPropertyAccessExpression(n)) {
        if (n.name.text === 'db') problems.push(n.getText());
        if (isRepos(n.expression) && !allowed.has(n.name.text)) problems.push(n.getText());
      }
      if (ts.isElementAccessExpression(n) && isRepos(n.expression)) problems.push(n.getText());
      if (
        ts.isVariableDeclaration(n) &&
        ts.isObjectBindingPattern(n.name) &&
        n.initializer !== undefined &&
        isRepos(n.initializer)
      ) {
        problems.push(n.getText());
      }
    });
    return problems;
  }

  it('finds the sending code', () => {
    expect(SENDING).toContain(CLIENT);
    expect(SENDING).toContain('apps/mobile-web/src/screens/list/SendAndExport.tsx');
  });

  it.each(SENDING)(
    '%s imports only the allowed files and reaches only those repositories',
    (file) => {
      expect(importProblems(file, read(file))).toEqual([]);
      expect(accessProblems(read(file))).toEqual([]);
    },
  );

  it('seeded violations fail', () => {
    const file = 'apps/mobile-web/src/transfer/send.ts';
    expect(accessProblems('storage.repos.profile.get();')).toHaveLength(1);
    expect(accessProblems('const { weights } = storage.repos;')).toHaveLength(1);
    expect(accessProblems("storage.repos['symptoms'];")).toHaveLength(1);
    expect(accessProblems('storage.db.weights.toArray();')).toHaveLength(1);
    expect(
      importProblems(file, "import { readSettings } from '../screens/settings/readSettings';"),
    ).toHaveLength(1);
  });
});
