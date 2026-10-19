import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRepoFiles } from './scan';

// Tests and type checks only run where the configuration finds them. A new package without a
// vitest config or typecheck script, or a test file in a place nothing runs, would pass CI while
// never running. These checks make that fail instead.
const root = resolve(import.meta.dirname, '../..');
const files = listRepoFiles(root);
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const WORKSPACE_INCLUDE = "'src/**/*.{test,spec}.{ts,tsx}'";
const packages = files
  .map((f) => /^((?:apps|packages|services)\/[^/]+)\/package\.json$/.exec(f)?.[1])
  .filter((dir): dir is string => dir !== undefined);

describe('every workspace package is tested and type-checked', () => {
  it('finds the workspace packages', () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  it.each(packages)('%s has vitest.config.ts, tsconfig.json and a typecheck script', (dir) => {
    expect(existsSync(join(root, dir, 'vitest.config.ts'))).toBe(true);
    expect(existsSync(join(root, dir, 'tsconfig.json'))).toBe(true);
    const pkg = JSON.parse(read(`${dir}/package.json`)) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['typecheck']).toMatch(/\btsc\b/);
    expect(read(`${dir}/vitest.config.ts`)).toContain(WORKSPACE_INCLUDE);
  });

  it('the root vitest config runs every workspace project', () => {
    const config = read('vitest.config.ts');
    for (const top of ['apps', 'packages', 'services']) {
      expect(config).toContain(`'${top}/*/vitest.config.ts'`);
    }
  });

  it('browser tests are type-checked with DOM types, separately from the root', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(scripts['typecheck']).toContain('tsc -p e2e/tsconfig.json');
    expect(read('e2e/tsconfig.json')).toContain('"DOM"');
    expect(read('tsconfig.json')).not.toContain('e2e');
  });
});

describe('every committed test file is in a place that runs it', () => {
  const testFiles = files.filter((f) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f));

  const runs = (file: string): boolean => {
    if (/^e2e\/.+\.(?:test|spec)\.ts$/.test(file)) return true;
    if (/^tools\/scans\/.+\.test\.ts$/.test(file)) return true;
    const pkg = /^((?:apps|packages|services)\/[^/]+)\/src\/.+\.(?:test|spec)\.tsx?$/.exec(file);
    return pkg?.[1] !== undefined && packages.includes(pkg[1]);
  };

  it('finds the test files', () => {
    expect(testFiles.length).toBeGreaterThan(0);
  });

  it('runs every one (under e2e/, tools/scans/, or a workspace package src/)', () => {
    expect(testFiles.filter((f) => !runs(f))).toEqual([]);
  });
});
