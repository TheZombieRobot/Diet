import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The two workflows (.github/workflows; DECISIONS "Publishing the phone app"). The history scan
// sees the whole public history only on a full-history checkout (full review F47). Only the head
// commit's subject line can ask for a deploy (F43); every push to a work branch starts the Pages
// workflow, a docs-only one too (F42); and nothing is published before the full checks pass.
const root = resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(join(root, '.github/workflows', file), 'utf8');
const ci = read('ci.yml');
const pages = read('pages.yml');

/** The lines of one top-level job of a workflow, up to the next job. */
const job = (workflow: string, name: string): string =>
  new RegExp(`^ {2}${name}:\\n((?: {4}.*\\n|\\n)+)`, 'm').exec(workflow)?.[1] ?? '';

/** What the marker script tells the Pages workflow for a push (or a run by hand). */
const marker = (message: string, event = 'push'): string =>
  execFileSync('bash', [join(root, '.github/scripts/deploy-marker.sh')], {
    env: { PATH: process.env['PATH'] ?? '', EVENT: event, MESSAGE: message },
    encoding: 'utf8',
  }).trim();

describe('the full history (F47)', () => {
  it('CI checks, and the Pages build, check out the whole history for the history scan', () => {
    expect(job(ci, 'check')).toContain('fetch-depth: 0');
    expect(job(ci, 'check')).toContain('run: pnpm scan');
    expect(job(pages, 'build')).toContain('fetch-depth: 0');
  });
});

describe('the deploy marker (F43)', () => {
  it('publishes a push only when the subject line carries it', () => {
    expect(marker('Item 17: the week-1 build [deploy]')).toBe('deploy=true');
    expect(marker('[deploy] Item 17\r\n\r\nWith a body.')).toBe('deploy=true');
    expect(marker('Item 17: record the decisions')).toBe('deploy=false');
    // A merge note that quotes the marker in its body must never publish.
    expect(
      marker('Item 14: merge the weight log\n\nThe app is published from commits marked [deploy].'),
    ).toBe('deploy=false');
    expect(marker('')).toBe('deploy=false');
  });

  it('publishes a run started by hand', () => {
    expect(marker('', 'workflow_dispatch')).toBe('deploy=true');
  });
});

describe('pages.yml', () => {
  it('starts for every push to a work branch: no path filter can hide a deploy (F42)', () => {
    const trigger = /^on:\n((?: {2}.*\n)+)/m.exec(pages)?.[1] ?? '';
    expect(trigger).toContain("- 'ccr-*'");
    expect(trigger).not.toMatch(/paths(?:-ignore)?:/);
  });

  it('builds only when the marker job says so, and reads the commit message nowhere else', () => {
    expect(job(pages, 'build')).toContain('needs: marker');
    expect(job(pages, 'build')).toContain("if: needs.marker.outputs.deploy == 'true'");
    expect(pages.match(/head_commit\.message/g)).toHaveLength(1);
    expect(job(pages, 'marker')).toContain('MESSAGE: ${{ github.event.head_commit.message }}');
  });

  it('publishes only after the full checks', () => {
    const build = job(pages, 'build');
    const upload = build.indexOf('upload-pages-artifact');
    for (const step of ['run: pnpm check', 'pnpm e2e']) {
      expect(build.indexOf(step), step).toBeGreaterThan(-1);
      expect(build.indexOf(step), step).toBeLessThan(upload);
    }
  });
});
