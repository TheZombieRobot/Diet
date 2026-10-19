import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decodeText, rawSegment, visibleSegments, type TextSegment } from './extract';
import {
  aiAndTelemetryRules,
  ALLOWED_EMAIL_PATTERNS,
  ALLOWED_EMAILS,
  CONTENT_EXEMPT_FILES,
  currencyRules,
  DISABLED_TEST_EXEMPT_FILES,
  disabledTestRules,
  extensionAlwaysRules,
  extensionModeARules,
  extensionPendingPathRule,
  healthPhraseRules,
  NETWORK_ALLOWED_FILES,
  networkRules,
  personalDataRules,
  personalPathRules,
  PRICE_FORMATTER_FILES,
  priceFormatRules,
  SSH_REMOTE_USERS,
  stockAndCartRules,
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
  /**
   * 'visible': the text a person would read (extract.ts): literals and JSX text in code, markup
   * without tags. 'raw': the whole file exactly as committed, comments included.
   */
  text: 'visible' | 'raw';
  /** Which repository-relative paths (forward slashes) the rule set applies to. */
  appliesTo: (file: string) => boolean;
}

const isDoc = (f: string) => f.startsWith('docs/');
const isExempt = (f: string) => CONTENT_EXEMPT_FILES.includes(f);
export const isTestFile = (f: string) =>
  /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f) || f.startsWith('e2e/');
const isTestData = (f: string) => isTestFile(f) || f.startsWith('packages/test-fixtures/');
const isLockfile = (f: string) => f === 'pnpm-lock.yaml';
const isWorkspace = (f: string) => /^(?:apps|packages|services)\//.test(f);
const isCode = (f: string) => /\.(?:[cm]?[jt]sx?|html)$/.test(f);
const isManifest = (f: string) => /(?:^|\/)manifest[^/]*\.json$/.test(f);
const isPriceFormatter = (f: string) => PRICE_FORMATTER_FILES.includes(f);

/** Phrase rules cover everything a person could read, except the docs that define them and tests. */
const wordingScope = (f: string) => !isDoc(f) && !isExempt(f) && !isTestData(f) && !isLockfile(f);

const PERSONAL_DATA: RuleSet = {
  name: 'personal data and secrets',
  rules: personalDataRules,
  text: 'raw',
  // Docs and tests are included: nothing personal may be committed anywhere.
  appliesTo: (f) => !isExempt(f) && !isLockfile(f),
};

/** The fixed rule sets and where each applies (the extension guard is added by ruleSetsFor). */
export const RULE_SETS: readonly RuleSet[] = [
  { name: 'health wording', rules: healthPhraseRules, text: 'visible', appliesTo: wordingScope },
  {
    name: 'currency wording',
    rules: currencyRules,
    text: 'visible',
    appliesTo: (f) => wordingScope(f) && !isPriceFormatter(f),
  },
  {
    name: 'stock and cart wording',
    rules: stockAndCartRules,
    text: 'visible',
    appliesTo: wordingScope,
  },
  {
    name: 'price formatting',
    rules: priceFormatRules,
    text: 'raw',
    appliesTo: (f) => wordingScope(f) && isCode(f) && !isPriceFormatter(f),
  },
  PERSONAL_DATA,
  {
    name: 'network access',
    rules: networkRules,
    text: 'raw',
    appliesTo: (f) =>
      isWorkspace(f) && isCode(f) && !isTestFile(f) && !NETWORK_ALLOWED_FILES.includes(f),
  },
  {
    name: 'AI services and remote assets',
    rules: aiAndTelemetryRules,
    text: 'raw',
    appliesTo: (f) => !isDoc(f) && !isExempt(f) && !isLockfile(f),
  },
  {
    name: 'disabled tests',
    rules: disabledTestRules,
    text: 'raw',
    appliesTo: (f) => isTestFile(f) && !DISABLED_TEST_EXEMPT_FILES.includes(f),
  },
];

export const FEASIBILITY_DOC = 'docs/INTEGRATION_FEASIBILITY.md';

export interface ExtensionDecision {
  /** Section 9.3 still says *Pending.* (or cannot be found). */
  pending: boolean;
  /** Section 9.3 records mode A and is no longer pending. */
  modeAApproved: boolean;
}

/** The text under a Markdown heading, up to the next heading of level 1 to 3. */
function markdownSection(doc: string, heading: RegExp): string | undefined {
  const found = heading.exec(doc);
  if (!found) return undefined;
  const rest = doc.slice(found.index + found[0].length);
  const next = rest.search(/^#{1,3}\s/m);
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * Reads INTEGRATION_FEASIBILITY.md section 9.3. "Mode: A / B / C" (the unfilled template) does
 * not count as choosing A.
 */
export function extensionDecision(doc: string | undefined): ExtensionDecision {
  const section = doc === undefined ? undefined : markdownSection(doc, /^###\s+9\.3\b.*$/m);
  if (section === undefined) return { pending: true, modeAApproved: false };
  const pending = section.includes('*Pending.*');
  return { pending, modeAApproved: !pending && /Mode:\s*A\b(?!\s*\/)/.test(section) };
}

export function readExtensionDecision(root: string): ExtensionDecision {
  const path = join(root, FEASIBILITY_DOC);
  return extensionDecision(existsSync(path) ? readFileSync(path, 'utf8') : undefined);
}

/** No paknsave.co.nz page, cookie or network access unless 9.3 approves mode A. */
export function extensionRuleSets(decision: ExtensionDecision): RuleSet[] {
  return [
    {
      name: 'extension guard',
      rules: decision.modeAApproved
        ? extensionAlwaysRules
        : [...extensionAlwaysRules, ...extensionModeARules],
      text: 'raw',
      appliesTo: (f) => !isExempt(f) && ((isWorkspace(f) && !isTestFile(f)) || isManifest(f)),
    },
  ];
}

export function extensionPathRules(decision: ExtensionDecision): PathRule[] {
  return decision.pending ? [extensionPendingPathRule] : [];
}

export function ruleSetsFor(root: string): RuleSet[] {
  return [...RULE_SETS, ...extensionRuleSets(readExtensionDecision(root))];
}

export function pathRulesFor(root: string): PathRule[] {
  return [...personalPathRules, ...extensionPathRules(readExtensionDecision(root))];
}

function allowMatch(rule: ContentRule, match: RegExpExecArray, text: string): boolean {
  if (rule.id !== 'email') return false;
  const address = match[0].toLowerCase();
  if (ALLOWED_EMAILS.includes(address)) return true;
  if (ALLOWED_EMAIL_PATTERNS.some((p) => p.test(address))) return true;
  return SSH_REMOTE_USERS.includes(address) && text.charAt(match.index + match[0].length) === ':';
}

function locator(text: string) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  return (offset: number) => {
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
      lineText: text.slice(start, end < 0 ? undefined : end),
    };
  };
}

const globalPatterns = new WeakMap<RegExp, RegExp>();
function globalPattern(pattern: RegExp): RegExp {
  let g = globalPatterns.get(pattern);
  if (!g) {
    g = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
    );
    globalPatterns.set(pattern, g);
  }
  return g;
}

/**
 * Runs rules over segments of a file and reports every match at its place in the original text.
 * Text pulled from code is reported at the start of the literal or element it came from.
 */
export function scanSegments(
  file: string,
  text: string,
  segments: readonly TextSegment[],
  rules: readonly ContentRule[],
): Violation[] {
  const locate = locator(text);
  const seen = new Set<string>();
  const violations: Violation[] = [];
  for (const rule of rules) {
    const pattern = globalPattern(rule.pattern);
    for (const segment of segments) {
      for (const match of segment.text.matchAll(pattern)) {
        if (allowMatch(rule, match, segment.text)) continue;
        const { line, column, lineText } = locate(segment.offsetAt(match.index));
        const key = `${line}:${column}:${rule.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        violations.push({
          file,
          line,
          column,
          ruleId: rule.id,
          enforces: rule.enforces,
          description: rule.description,
          excerpt: (segment.excerpt ?? lineText.trim()).slice(0, 160),
        });
      }
    }
  }
  return violations;
}

/**
 * Scans a whole file as written, so a phrase that formatting wraps across two lines ("cut down" /
 * "by") is still caught: the patterns use `\s+` between words.
 */
export function scanText(file: string, text: string, rules: readonly ContentRule[]): Violation[] {
  return scanSegments(file, text, [rawSegment(text)], rules);
}

/** Scans only what a person would read in the file (see extract.ts). */
export function scanVisible(
  file: string,
  text: string,
  rules: readonly ContentRule[],
): Violation[] {
  return scanSegments(file, text, visibleSegments(file, text), rules);
}

/** Applies every rule set that covers this file, each to the kind of text it reads. */
export function scanSource(
  file: string,
  text: string,
  ruleSets: readonly RuleSet[] = RULE_SETS,
): Violation[] {
  const raw = [rawSegment(text)];
  let visible: TextSegment[] | undefined;
  return ruleSets
    .filter((set) => set.appliesTo(file))
    .flatMap((set) =>
      scanSegments(
        file,
        text,
        set.text === 'raw' ? raw : (visible ??= visibleSegments(file, text)),
        set.rules,
      ),
    );
}

export function scanPath(
  file: string,
  sizeBytes: number,
  rules: readonly PathRule[],
  bytes?: Uint8Array,
): Violation[] {
  return rules
    .filter((r) => r.test(file, sizeBytes, bytes))
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
    { cwd: root, encoding: 'utf8' },
  );
  return [...new Set(out.split('\0').filter(Boolean))]
    .filter((f) => existsSync(join(root, f)))
    .sort();
}

export function scanFiles(
  root: string,
  files: readonly string[],
  ruleSets: readonly RuleSet[] = ruleSetsFor(root),
  pathRules: readonly PathRule[] = pathRulesFor(root),
): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const abs = join(root, file);
    const stats = statSync(abs);
    if (!stats.isFile()) continue;
    const bytes = readFileSync(abs);
    violations.push(...scanPath(file, stats.size, pathRules, bytes));
    const text = decodeText(bytes);
    if (text !== undefined) violations.push(...scanSource(file, text, ruleSets));
  }
  return violations;
}

export function scanRepo(root: string): Violation[] {
  return scanFiles(root, listRepoFiles(root));
}

const git = (root: string, args: readonly string[], input?: string): Buffer =>
  execFileSync('git', args, {
    cwd: root,
    maxBuffer: 1024 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });

const historyLabel = (path: string, sha: string) => `${path} (history ${sha.slice(0, 12)})`;

/** Every blob reachable from any ref, with every path it has had, size and content. */
function historyBlobs(
  root: string,
): { sha: string; size: number; paths: Set<string>; bytes: Buffer }[] {
  const paths = new Map<string, Set<string>>();
  const addPath = (sha: string, path: string) => {
    const set = paths.get(sha) ?? new Set<string>();
    if (path) set.add(path);
    paths.set(sha, set);
  };
  for (const line of git(root, ['rev-list', '--objects', '--all']).toString('utf8').split('\n')) {
    if (!line) continue;
    const space = line.indexOf(' ');
    addPath(space < 0 ? line : line.slice(0, space), space < 0 ? '' : line.slice(space + 1));
  }
  if (paths.size === 0) return [];

  // A blob is listed once above; this adds every other path it was committed under.
  const raw = git(root, [
    'log',
    '--all',
    '-m',
    '--raw',
    '--no-renames',
    '--no-abbrev',
    '--format=',
    '-z',
  ])
    .toString('utf8')
    .split('\0');
  for (let i = 0; i + 1 < raw.length; i++) {
    const meta = (raw[i] ?? '').trimStart();
    if (!meta.startsWith(':')) continue;
    const sha = meta.split(' ')[3];
    const path = raw[i + 1] ?? '';
    if (sha && paths.has(sha)) addPath(sha, path);
    i++;
  }

  const types = git(
    root,
    ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
    `${[...paths.keys()].join('\n')}\n`,
  ).toString('utf8');
  const blobs = types
    .split('\n')
    .map((l) => l.split(' '))
    .filter(([, type]) => type === 'blob')
    .map(([sha]) => sha ?? '');
  if (blobs.length === 0) return [];

  const out = git(root, ['cat-file', '--batch'], `${blobs.join('\n')}\n`);
  const result: { sha: string; size: number; paths: Set<string>; bytes: Buffer }[] = [];
  let pos = 0;
  while (pos < out.length) {
    const headerEnd = out.indexOf(0x0a, pos);
    if (headerEnd < 0) break;
    const [sha = '', , sizeText = '0'] = out.subarray(pos, headerEnd).toString('utf8').split(' ');
    const size = Number(sizeText);
    const bytes = out.subarray(headerEnd + 1, headerEnd + 1 + size);
    result.push({ sha, size, paths: paths.get(sha) ?? new Set(), bytes });
    pos = headerEnd + 1 + size + 1;
  }
  return result;
}

/**
 * Checks the whole git history, not just the files present now: something committed and then
 * deleted is still public. Every blob reachable from any ref gets the path rules (for every name
 * it was committed under) and the personal-data and secret rules (text files only, not the
 * lockfile); every commit message gets the personal-data rules. Exemptions match scanFiles.
 */
export function scanHistory(
  root: string,
  pathRules: readonly PathRule[] = personalPathRules,
  contentSets: readonly RuleSet[] = [PERSONAL_DATA],
): Violation[] {
  const violations: Violation[] = [];
  for (const blob of historyBlobs(root)) {
    for (const path of blob.paths) {
      const label = historyLabel(path, blob.sha);
      violations.push(
        ...scanPath(path, blob.size, pathRules, blob.bytes).map((v) => ({
          ...v,
          file: label,
          excerpt: label,
        })),
      );
    }
    const text = decodeText(blob.bytes);
    if (text === undefined) continue;
    // A blob with no recorded path (a tagged blob, say) is checked rather than skipped.
    const candidates = blob.paths.size > 0 ? [...blob.paths] : ['(no path)'];
    for (const set of contentSets) {
      const path = candidates.find((p) => set.appliesTo(p) && !isLockfile(p));
      if (path === undefined) continue;
      violations.push(...scanText(historyLabel(path, blob.sha), text, set.rules));
    }
  }
  const log = git(root, ['log', '--all', '--format=%x1e%H%n%B']).toString('utf8');
  for (const entry of log.split('\x1e')) {
    const newline = entry.indexOf('\n');
    if (newline < 0) continue;
    const sha = entry.slice(0, newline);
    violations.push(
      ...scanText(
        `commit message ${sha.slice(0, 12)}`,
        entry.slice(newline + 1),
        personalDataRules,
      ),
    );
  }
  return violations;
}

/** One line per violation, for assertions: no file content, so nothing leaks into CI logs. */
export function violationKeys(violations: readonly Violation[]): string[] {
  return violations.map((v) => `${v.file}:${v.line} ${v.ruleId}`);
}

/**
 * Human-readable report. In CI (public logs) the matched text is left out, so a failing scan
 * never republishes what it found.
 */
export function formatViolations(
  violations: readonly Violation[],
  showExcerpts = !process.env['CI'],
): string {
  return violations
    .map((v) => {
      const where = v.line > 0 ? `${v.file}:${v.line}:${v.column}` : v.file;
      const head = `${where}  [${v.ruleId}; ${v.enforces.join(', ')}] ${v.description}`;
      return showExcerpts ? `${head}\n    ${v.excerpt}` : head;
    })
    .join('\n');
}
