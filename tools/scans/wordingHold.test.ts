import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HEALTH_COPY_PATH, heldWordingLines, WORDING_HOLD_MARKER } from '../release/wordingHold';

// Cross-item ruling 8 (item 28 A49; full review of item 28, finding 13): wording that awaits the
// owner's confirmation at the week-1 review is never published, by a "[deploy]" push or by hand.
const root = resolve(import.meta.dirname, '../..');
const pages = readFileSync(join(root, '.github/workflows/pages.yml'), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'wording-hold-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** Runs the workflow's hold step on a file, as CI runs it. */
function hold(source: string): number | null {
  const file = join(scratch, `health-${String(Math.random()).slice(2)}.ts`);
  writeFileSync(file, source);
  return spawnSync(process.execPath, ['tools/release/wording-hold.ts', file], { cwd: root }).status;
}

describe('the wording hold (ruling 8)', () => {
  it('finds a marked comment, and only a comment', () => {
    const source = [
      'export const copy = {',
      '  // C58: wording awaits owner confirmation at the week-1 review',
      "  why: 'Why this card?',",
      `  quoted: '${WORDING_HOLD_MARKER}',`,
      '};',
    ].join('\n');
    expect(heldWordingLines(source)).toEqual([2]);
  });

  it('the step refuses while a string is marked, and passes once the markers are gone', () => {
    expect(hold("// C58: wording awaits owner confirmation\nexport const a = 'x';\n")).toBe(1);
    expect(hold("export const a = 'x';\n")).toBe(0);
  });

  it('every C58 comment in health.ts is a hold comment, so the step sees it', () => {
    const source = readFileSync(join(root, HEALTH_COPY_PATH), 'utf8');
    const c58 = source.split('\n').filter((line) => /^\s*\/\/\s*C58\b/.test(line));
    for (const line of c58) expect(line).toContain(WORDING_HOLD_MARKER);
  });

  it('the Pages build job runs the hold before it installs, checks or uploads anything, and only that job leads to the deploy', () => {
    const build = pages.slice(pages.indexOf('\n  build:'), pages.indexOf('\n  deploy:'));
    const step = build.indexOf('run: node tools/release/wording-hold.ts');
    expect(step).toBeGreaterThan(0);
    for (const later of [
      'pnpm install --frozen-lockfile',
      'run: pnpm check',
      'actions/upload-pages-artifact',
    ]) {
      expect(build.indexOf(later), later).toBeGreaterThan(step);
    }
    expect(build).not.toMatch(/continue-on-error/);
    const deploy = pages.slice(pages.indexOf('\n  deploy:'), pages.indexOf('\n  verify:'));
    expect(deploy).toMatch(/needs: build\b/);
  });
});
