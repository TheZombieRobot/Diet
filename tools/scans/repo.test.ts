import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { disallowedLicenses, findTelemetryPackages, installedLicenses } from './deps';
import { formatViolations, scanRepo } from './scan';

// The real repository must stay clean. These run in CI on every push (`pnpm scan`).
const root = resolve(import.meta.dirname, '../..');

describe('repository scan', () => {
  it('has no banned wording, personal data, secrets or network calls', () => {
    const violations = scanRepo(root);
    expect(violations, `\n${formatViolations(violations)}\n`).toEqual([]);
  });

  it('has no telemetry or analytics packages in the dependency tree', () => {
    const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
    expect(findTelemetryPackages(lockfile)).toEqual([]);
  });

  it('uses only allowed licences', () => {
    const bad = disallowedLicenses(installedLicenses(root));
    expect(bad.map((e) => `${e.name} (${e.license})`)).toEqual([]);
  });
});
