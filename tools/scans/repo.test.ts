import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  disallowedLicenses,
  findAiPackages,
  findTelemetryPackages,
  installedLicenses,
  repoFileReader,
  telemetryConfigProblems,
} from './deps';
import { DEVICE_ONLY_ALLOWED_FILES } from './rules';
import { formatViolations, listRepoFiles, scanHistory, scanRepo, violationKeys } from './scan';

// The real repository must stay clean. These run in CI on every push (`pnpm scan`), and in the
// pre-commit hook. Assertions compare only "file:line rule" so a failure in a public CI log never
// repeats the text it found; the readable report leaves out excerpts in CI too.
const root = resolve(import.meta.dirname, '../..');
const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');

describe('repository scan', () => {
  it('has no banned wording, personal data, secrets or network calls in the current files', () => {
    const violations = scanRepo(root);
    expect(violationKeys(violations), `\n${formatViolations(violations)}\n`).toEqual([]);
  });

  it('has no personal data, secrets or private files anywhere in git history', () => {
    const violations = scanHistory(root);
    expect(violationKeys(violations), `\n${formatViolations(violations)}\n`).toEqual([]);
  });

  // Item 19 (G8): a stale entry would let a new file of the same name reach the photos unchecked.
  it('names only files that exist among those allowed to reach the device-only stores', () => {
    const files = new Set(listRepoFiles(root));
    expect(DEVICE_ONLY_ALLOWED_FILES.filter((f) => !files.has(f))).toEqual([]);
  });

  it('has no telemetry or analytics packages in the dependency tree', () => {
    expect(findTelemetryPackages(lockfile)).toEqual([]);
  });

  it('has no AI SDKs in the dependency tree', () => {
    expect(findAiPackages(lockfile)).toEqual([]);
  });

  it('turns off telemetry for tools that send it by default', () => {
    expect(telemetryConfigProblems(lockfile, repoFileReader(root))).toEqual([]);
  });

  it('uses only allowed licences', () => {
    const bad = disallowedLicenses(installedLicenses(root));
    expect(bad.map((e) => `${e.name} (${e.license})`)).toEqual([]);
  });
});
