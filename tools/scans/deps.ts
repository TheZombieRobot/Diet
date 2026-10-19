import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AI_PACKAGES, ALLOWED_LICENSES, MUST_CONFIGURE_OFF, TELEMETRY_PACKAGES } from './rules';

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
export function matchesPackageList(name: string, list: readonly string[]): boolean {
  return list.some((entry) =>
    entry.endsWith('/') || entry.endsWith('-') ? name.startsWith(entry) : name === entry,
  );
}

export function isTelemetryPackage(name: string, denylist = TELEMETRY_PACKAGES): boolean {
  return matchesPackageList(name, denylist);
}

export function isAiPackage(name: string, denylist = AI_PACKAGES): boolean {
  return matchesPackageList(name, denylist);
}

export function findTelemetryPackages(lockfile: string): string[] {
  return lockfilePackageNames(lockfile).filter((n) => isTelemetryPackage(n));
}

export function findAiPackages(lockfile: string): string[] {
  return lockfilePackageNames(lockfile).filter((n) => isAiPackage(n));
}

/** Reads a repository file, or undefined when it does not exist. */
export const repoFileReader =
  (root: string) =>
  (path: string): string | undefined =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined;

/**
 * Tools in the lockfile that send telemetry unless configured off (MUST_CONFIGURE_OFF), and are
 * not: one message per tool.
 */
export function telemetryConfigProblems(
  lockfile: string,
  readFile: (path: string) => string | undefined,
): string[] {
  const names = new Set(lockfilePackageNames(lockfile));
  return MUST_CONFIGURE_OFF.filter((tool) => names.has(tool.package)).flatMap((tool) => {
    const configured = tool.files.some((file) => {
      const text = readFile(file);
      return text !== undefined && tool.setting.test(text);
    });
    return configured ? [] : [`${tool.package}: ${tool.description} (${tool.files.join(' or ')})`];
  });
}

const ALIASES: Readonly<Record<string, string>> = {
  'Apache 2.0': 'Apache-2.0',
  'Apache License 2.0': 'Apache-2.0',
  'BSD-3': 'BSD-3-Clause',
  'BSD-2': 'BSD-2-Clause',
  'MIT License': 'MIT',
};

type Token = { kind: '(' | ')' | 'AND' | 'OR' | 'WITH' } | { kind: 'id'; value: string };

/** Parentheses, operators, and licence names (consecutive words such as "Apache 2.0" join up). */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let words: string[] = [];
  const flush = () => {
    if (words.length > 0) tokens.push({ kind: 'id', value: words.join(' ') });
    words = [];
  };
  for (const part of expression.split(/([()]|\s+)/)) {
    if (!part.trim()) continue;
    const upper = part.toUpperCase();
    if (part === '(' || part === ')') {
      flush();
      tokens.push({ kind: part });
    } else if (upper === 'AND' || upper === 'OR' || upper === 'WITH') {
      flush();
      tokens.push({ kind: upper });
    } else words.push(part);
  }
  flush();
  return tokens;
}

/**
 * True when an SPDX-style licence expression is satisfied by the allowed list: any branch of an
 * OR may be chosen; every part of an AND must be allowed. AND binds tighter than OR, parentheses
 * group, and "X WITH exception" counts only if listed as a whole. Anything unparseable is false.
 */
export function licenseAllowed(expression: string, allowed = ALLOWED_LICENSES): boolean {
  const tokens = tokenize(expression);
  let pos = 0;
  const isAllowed = (id: string) => allowed.includes(ALIASES[id] ?? id);

  // or := and ('OR' and)* ; and := atom ('AND' atom)* ; atom := '(' or ')' | id ('WITH' id)?
  const parseAtom = (): boolean | undefined => {
    const token = tokens[pos++];
    if (token === undefined) return undefined;
    if (token.kind === '(') {
      const value = parseOr();
      return tokens[pos++]?.kind === ')' ? value : undefined;
    }
    if (token.kind !== 'id') return undefined;
    if (tokens[pos]?.kind !== 'WITH') return isAllowed(token.value);
    pos++;
    const exception = tokens[pos++];
    return exception?.kind === 'id'
      ? isAllowed(`${token.value} WITH ${exception.value}`)
      : undefined;
  };
  const parseAnd = (): boolean | undefined => {
    let value = parseAtom();
    while (value !== undefined && tokens[pos]?.kind === 'AND') {
      pos++;
      const right = parseAtom();
      value = right === undefined ? undefined : value && right;
    }
    return value;
  };
  const parseOr = (): boolean | undefined => {
    let value = parseAnd();
    while (value !== undefined && tokens[pos]?.kind === 'OR') {
      pos++;
      const right = parseAnd();
      value = right === undefined ? undefined : value || right;
    }
    return value;
  };

  const result = parseOr();
  return result === true && pos === tokens.length;
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
