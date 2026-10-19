import { execFileSync } from 'node:child_process';
import { ALLOWED_LICENSES, TELEMETRY_PACKAGES } from './rules';

/** Package names in a pnpm v9 lockfile's `packages:` section. */
export function lockfilePackageNames(lockfile: string): string[] {
  const start = lockfile.search(/^packages:\s*$/m);
  if (start < 0) return [];
  const end = lockfile.slice(start).search(/^snapshots:\s*$/m);
  const section = end < 0 ? lockfile.slice(start) : lockfile.slice(start, start + end);
  const names = new Set<string>();
  for (const m of section.matchAll(/^ {2}'?((?:@[^/\s'@]+\/)?[^@\s':]+)@[^\s']+'?:\s*$/gm)) {
    if (m[1]) names.add(m[1]);
  }
  return [...names].sort();
}

/**
 * Entries ending in "/" or "-" are prefixes (a whole npm scope, or a family of packages);
 * anything else must match the package name exactly.
 */
export function isTelemetryPackage(name: string, denylist = TELEMETRY_PACKAGES): boolean {
  return denylist.some((entry) =>
    entry.endsWith('/') || entry.endsWith('-') ? name.startsWith(entry) : name === entry,
  );
}

export function findTelemetryPackages(lockfile: string): string[] {
  return lockfilePackageNames(lockfile).filter((n) => isTelemetryPackage(n));
}

const ALIASES: Record<string, string> = {
  'Apache 2.0': 'Apache-2.0',
  'Apache License 2.0': 'Apache-2.0',
  'BSD-3': 'BSD-3-Clause',
  'BSD-2': 'BSD-2-Clause',
  'MIT License': 'MIT',
};

/**
 * True when an SPDX-style licence expression is satisfied by the allowed list:
 * any branch of an OR may be chosen; every part of an AND must be allowed.
 */
export function licenseAllowed(expression: string, allowed = ALLOWED_LICENSES): boolean {
  const cleaned = expression.trim().replace(/^\((.*)\)$/, '$1');
  if (!cleaned) return false;
  if (/\s+OR\s+/i.test(cleaned)) {
    return cleaned.split(/\s+OR\s+/i).some((part) => licenseAllowed(part, allowed));
  }
  if (/\s+AND\s+/i.test(cleaned)) {
    return cleaned.split(/\s+AND\s+/i).every((part) => licenseAllowed(part, allowed));
  }
  const id = ALIASES[cleaned] ?? cleaned;
  return allowed.includes(id);
}

export interface LicenseEntry {
  name: string;
  versions: string[];
  license: string;
}

/** Licences of every installed dependency (production and development), via pnpm. */
export function installedLicenses(root: string): LicenseEntry[] {
  const out = execFileSync('pnpm', ['licenses', 'list', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(out) as Record<string, { name: string; versions: string[] }[]>;
  return Object.entries(byLicense).flatMap(([license, pkgs]) =>
    pkgs.map((p) => ({ name: p.name, versions: p.versions, license })),
  );
}

export function disallowedLicenses(entries: readonly LicenseEntry[]): LicenseEntry[] {
  return entries.filter((e) => !licenseAllowed(e.license));
}
