import { describe, expect, it } from 'vitest';
import {
  findTelemetryPackages,
  isTelemetryPackage,
  licenseAllowed,
  lockfilePackageNames,
} from './deps';

const LOCKFILE = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      vitest:
        specifier: 4.1.11

packages:

  '@sentry/browser@8.0.0':
    resolution: {integrity: sha512-x}

  posthog-js@1.2.3:
    resolution: {integrity: sha512-y}

  vitest@4.1.11:
    resolution: {integrity: sha512-z}

snapshots:

  vitest@4.1.11: {}
`;

describe('dependency guards', () => {
  it('reads package names from a pnpm lockfile', () => {
    expect(lockfilePackageNames(LOCKFILE)).toEqual(['@sentry/browser', 'posthog-js', 'vitest']);
  });

  it('finds telemetry packages by scope, prefix or exact name', () => {
    expect(findTelemetryPackages(LOCKFILE)).toEqual(['@sentry/browser', 'posthog-js']);
    expect(isTelemetryPackage('insight')).toBe(true);
    expect(isTelemetryPackage('insights-helper')).toBe(false);
    expect(isTelemetryPackage('firebase')).toBe(true);
    expect(isTelemetryPackage('react')).toBe(false);
  });

  it.each([
    ['MIT', true],
    ['(MIT OR CC0-1.0)', true],
    ['MIT AND ISC', true],
    ['Apache 2.0', true],
    ['GPL-3.0', false],
    ['MIT AND GPL-2.0', false],
    ['(GPL-2.0 OR MIT)', true],
    ['UNLICENSED', false],
    ['Unknown', false],
    ['', false],
  ])('licence %j allowed: %s', (expression, allowed) => {
    expect(licenseAllowed(expression)).toBe(allowed);
  });
});
