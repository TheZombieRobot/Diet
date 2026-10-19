import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanRepo } from './scan';

// Checklist item 3 acceptance: a seeded violation fails the scan; removing it passes again.
// Runs against a throwaway git repository so the real repository is never touched.
describe('seeded violations in a throwaway repository', () => {
  let root: string;

  const write = (file: string, content: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'diet-scan-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, '.gitignore'), 'docs/private/\n*.backup.json\n');
    write(
      'packages/core/src/copy/health.ts',
      "export const ok = 'No alcohol use is risk-free.';\n",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('a clean tree passes', () => {
    expect(scanRepo(root)).toEqual([]);
  });

  it.each([
    [
      'packages/core/src/copy/health.ts',
      "export const bad = 'Pick a quit date';\n",
      'taper-quit-date',
    ],
    ['apps/mobile-web/src/List.tsx', 'export const t = <p>In stock now</p>;\n', 'stock-status'],
    ['apps/mobile-web/src/api.ts', 'export const go = () => fetch("/x");\n', 'fetch'],
    [
      'packages/test-fixtures/src/me.ts',
      "export const n = 'I weigh 101 kg';\n",
      'first-person-health',
    ],
    ['Handoff.md', '# Notes\n', 'handoff-file'],
  ])('seeding %s fails, removing it passes', (file, content, ruleId) => {
    write(file, content);
    expect(scanRepo(root).map((v) => v.ruleId)).toContain(ruleId);
    rmSync(join(root, file));
    expect(scanRepo(root)).toEqual([]);
  });

  it('ignored files (kept out of git) are not scanned, committed ones are', () => {
    write('docs/private/notes.md', 'I weigh 101 kg\n');
    expect(scanRepo(root)).toEqual([]);
    write('docs/notes.md', 'I weigh 101 kg\n');
    expect(scanRepo(root).map((v) => v.file)).toEqual(['docs/notes.md']);
  });

  it('a file force-added past .gitignore is still caught', () => {
    write('me.backup.json', '{}\n');
    execFileSync('git', ['add', '-f', 'me.backup.json'], { cwd: root });
    expect(scanRepo(root).map((v) => v.ruleId)).toContain('backup-file');
  });
});
