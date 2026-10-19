import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  aiAndTelemetryRules,
  commerceRules,
  healthPhraseRules,
  NETWORK_ALLOWED_FILES,
  networkRules,
  personalDataRules,
  personalPathRules,
  type ContentRule,
  type PathRule,
} from './rules';

export interface Violation {
  file: string;
  /** 1-based; 0 for whole-file (path) rules. */
  line: number;
  column: number;
  ruleId: string;
  enforces: readonly string[];
  description: string;
  excerpt: string;
}

export interface RuleSet {
  name: string;
  rules: readonly ContentRule[];
  /** Which repository-relative paths (forward slashes) the rule set applies to. */
  appliesTo: (file: string) => boolean;
}

const isDoc = (f: string) => f.startsWith('docs/');
const isScanTool = (f: string) => f.startsWith('tools/scans/');
const isTest = (f: string) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f) || f.startsWith('e2e/');
const isLockfile = (f: string) => f === 'pnpm-lock.yaml';
const isWorkspaceSource = (f: string) => /^(?:apps|packages|services)\//.test(f);
const isCode = (f: string) => /\.(?:[cm]?[jt]sx?|html)$/.test(f);

/** The rule sets and where each applies. Docs describe the banned phrases, so they are exempt. */
export const RULE_SETS: readonly RuleSet[] = [
  {
    name: 'health wording',
    rules: healthPhraseRules,
    appliesTo: (f) => !isDoc(f) && !isScanTool(f) && !isTest(f) && !isLockfile(f),
  },
  {
    name: 'price, stock and cart wording',
    rules: commerceRules,
    appliesTo: (f) => isWorkspaceSource(f) && !isTest(f),
  },
  {
    name: 'personal data and secrets',
    rules: personalDataRules,
    // Docs and tests are included: nothing personal may be committed anywhere.
    appliesTo: (f) => !isScanTool(f) && !isLockfile(f),
  },
  {
    name: 'network access',
    rules: networkRules,
    appliesTo: (f) =>
      isWorkspaceSource(f) && isCode(f) && !isTest(f) && !NETWORK_ALLOWED_FILES.includes(f),
  },
  {
    name: 'AI services and remote assets',
    rules: aiAndTelemetryRules,
    appliesTo: (f) => !isDoc(f) && !isScanTool(f) && !isLockfile(f),
  },
];

/** Addresses that are allowed to appear (commit attribution and examples). */
const ALLOWED_EMAILS = new Set(['noreply@anthropic.com']);

function allowMatch(rule: ContentRule, match: string): boolean {
  if (rule.id === 'email') {
    const lower = match.toLowerCase();
    return (
      ALLOWED_EMAILS.has(lower) ||
      /@example\.(?:com|org|net)$/.test(lower) ||
      lower.endsWith('@users.noreply.github.com')
    );
  }
  return false;
}

/**
 * Scans a whole file, so a phrase that formatting wraps across two lines ("cut down" / "by") is
 * still caught: the patterns use `\s+` between words. Reports every match of every rule.
 */
export function scanText(file: string, text: string, rules: readonly ContentRule[]): Violation[] {
  const violations: Violation[] = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const locate = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    const start = lineStarts[lo] ?? 0;
    const end = text.indexOf('\n', start);
    return {
      line: lo + 1,
      column: offset - start + 1,
      excerpt: text
        .slice(start, end < 0 ? undefined : end)
        .trim()
        .slice(0, 160),
    };
  };
  for (const rule of rules) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
    for (const match of text.matchAll(new RegExp(rule.pattern.source, flags))) {
      if (allowMatch(rule, match[0])) continue;
      violations.push({
        file,
        ...locate(match.index),
        ruleId: rule.id,
        enforces: rule.enforces,
        description: rule.description,
      });
    }
  }
  return violations;
}

export function scanPath(file: string, sizeBytes: number, rules: readonly PathRule[]): Violation[] {
  return rules
    .filter((r) => r.test(file, sizeBytes))
    .map((r) => ({
      file,
      line: 0,
      column: 0,
      ruleId: r.id,
      enforces: r.enforces,
      description: r.description,
      excerpt: file,
    }));
}

/**
 * Every file that is committed or would be committed (tracked, plus untracked files that are not
 * ignored). Ignored files such as backups in docs/private/ are already kept out of git.
 */
export function listRepoFiles(root: string): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  return [...new Set(out.split('\0').filter(Boolean))]
    .filter((f) => existsSync(join(root, f)))
    .sort();
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

export function scanFiles(
  root: string,
  files: readonly string[],
  ruleSets: readonly RuleSet[] = RULE_SETS,
  pathRules: readonly PathRule[] = personalPathRules,
): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const abs = join(root, file);
    const stats = statSync(abs);
    if (!stats.isFile()) continue;
    if (!isScanTool(file)) violations.push(...scanPath(file, stats.size, pathRules));
    const buf = readFileSync(abs);
    if (isBinary(buf)) continue;
    const text = buf.toString('utf8');
    for (const set of ruleSets) {
      if (set.appliesTo(file)) violations.push(...scanText(file, text, set.rules));
    }
  }
  return violations;
}

export function scanRepo(root: string): Violation[] {
  return scanFiles(root, listRepoFiles(root));
}

export function formatViolations(violations: readonly Violation[]): string {
  return violations
    .map((v) => {
      const where = v.line > 0 ? `${v.file}:${v.line}:${v.column}` : v.file;
      return `${where}  [${v.ruleId}; ${v.enforces.join(', ')}] ${v.description}\n    ${v.excerpt}`;
    })
    .join('\n');
}
