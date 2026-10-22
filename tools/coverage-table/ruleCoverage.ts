/**
 * The coverage table (checklist item 36; TEST_PLAN section 5 item 5): every health-safety rule
 * (HEALTH_SAFETY.md section 8, HS-xx) and every non-negotiable case (TEST_PLAN.md section 3.12,
 * NN-xx), each with the unit, component, scan and browser tests whose titles name it. A test names
 * a rule when its own title, or the title of a describe block around it, contains the rule's ID;
 * the IDs are read from the titles with the TypeScript parser, never from comments or test bodies.
 * rule-coverage.ts writes the table to docs/COVERAGE.md, and tools/scans/ruleCoverage.test.ts
 * fails when that file is out of date or a rule that is built has no test naming it.
 *
 * Reads local files only and contacts nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export const COVERAGE_PATH = 'docs/COVERAGE.md';
const HEALTH_SAFETY_PATH = 'docs/HEALTH_SAFETY.md';
const TEST_PLAN_PATH = 'docs/TEST_PLAN.md';

export interface Rule {
  id: string;
  /** The rule's text, cut to one line for the table. */
  text: string;
}

/**
 * Behaviour of a rule that belongs to an item not built yet: the laptop extension, items 32 to 34,
 * which wait for the owner's Phase 0 decision. A rule that is pending as a whole needs no test
 * yet; every other rule needs at least one, and its pending part is listed beside the table.
 */
export interface Pending {
  id: string;
  whole: boolean;
  what: string;
  items: string;
}

export const PENDING: readonly Pending[] = [
  {
    id: 'HS-16',
    whole: false,
    what: 'The extension’s half: the side panel shows no price, stock or cart-status wording (CX-08). The scan rules for apps/cart-extension are in force already; it holds only its README.',
    items: 'item 33',
  },
  {
    id: 'NN-07',
    whole: false,
    what: 'The laptop half, end to end: after a stopped and restarted send, the side panel holds one copy of the list, no item twice, and its logs intact (TR-09b).',
    items: 'item 33',
  },
  {
    id: 'NN-08',
    whole: true,
    what: 'The extension has no checkout control; in mode A a batch refuses to start when the site’s selected store is not the configured one; a changed page structure shows a visible error and stops.',
    items: 'item 34',
  },
];

export type TestKind = 'unit' | 'component' | 'scan' | 'browser';

/** A test, or a describe block, whose own title names at least one rule. */
export interface NamingTitle {
  file: string;
  kind: TestKind;
  /** The describe titles around it and its own, joined with ' › '. */
  title: string;
  ids: string[];
  /** For a describe block, the number of tests inside it; null for a test. */
  tests: number | null;
}

const RULE_ID = /\b(?:HS|NN)-\d{2}\b/g;
const TEST_FILE = /^(?:apps|packages|services|tools|e2e)\/.+\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** Vitest and Playwright: the functions that declare a test or a describe block. */
const TEST_FUNCTIONS = new Set(['it', 'test', 'describe', 'suite']);
/** Modifiers that still run the test and expect it to pass. */
const MODIFIERS = new Set([
  'each',
  'for',
  'concurrent',
  'sequential',
  'only',
  'serial',
  'parallel',
]);
/** Modifiers of a test that does not run, or passes by failing: nothing in it counts. */
const OFF = new Set(['skip', 'todo', 'fixme', 'fails', 'skipIf', 'runIf']);

/** HEALTH_SAFETY.md section 8 and TEST_PLAN.md section 3.12, in ID order. */
export function readRules(healthSafety: string, testPlan: string): Rule[] {
  const hs = tableRows(healthSafety, /^## 8\. /, 'HS').map(([id, rule]) => ({
    id,
    text: oneLine(rule),
  }));
  const nn = tableRows(testPlan, /^### 3\.12 /, 'NN').map(([id, kase, expected]) => ({
    id,
    text: oneLine(`${kase}: ${expected}`),
  }));
  const byId = (a: Rule, b: Rule) => a.id.localeCompare(b.id);
  return [...hs.sort(byId), ...nn.sort(byId)];
}

function tableRows(markdown: string, heading: RegExp, prefix: string): [string, string, string][] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) throw new Error(`no heading matching ${String(heading)}`);
  const level = (/^#+/.exec(lines[start] ?? '')?.[0] ?? '').length;
  const rows: [string, string, string][] = [];
  for (const line of lines.slice(start + 1)) {
    const next = /^(#+) /.exec(line);
    if (next?.[1] !== undefined && next[1].length <= level) break;
    const cells = /^\|(.*)\|\s*$/
      .exec(line)?.[1]
      ?.split('|')
      .map((cell) => cell.trim());
    if (cells === undefined || !new RegExp(`^${prefix}-\\d{2}$`).test(cells[0] ?? '')) continue;
    const [id, text, more] = cells;
    if (cells.length !== 3 || id === undefined || text === undefined || more === undefined) {
      throw new Error(`${cells[0] ?? ''}: expected 3 cells, found ${cells.length}`);
    }
    rows.push([id, text, more]);
  }
  if (rows.length === 0) throw new Error(`no ${prefix}-xx rows under ${String(heading)}`);
  return rows;
}

/** The first sentence, without bold marks, cut at a word to at most 200 characters. */
function oneLine(text: string): string {
  const plain = text.replaceAll('**', '');
  const sentence = /^.*?\.(?=\s+[A-Z])/.exec(plain)?.[0] ?? plain;
  if (sentence.length <= 200) return sentence;
  return `${sentence.slice(0, sentence.lastIndexOf(' ', 199))} …`;
}

function testKind(file: string, source: string): TestKind {
  if (file.startsWith('e2e/')) return 'browser';
  if (file.startsWith('tools/')) return 'scan';
  return file.endsWith('x') || source.includes("'@testing-library/") ? 'component' : 'unit';
}

/** What a call declares; null for anything else, such as test.step or test.use. */
function testCall(node: ts.CallExpression): 'test' | 'describe' | 'off' | null {
  // it.each(table)('title', fn): the title belongs to the outer call.
  let callee = ts.isCallExpression(node.expression) ? node.expression.expression : node.expression;
  const names: string[] = [];
  while (ts.isPropertyAccessExpression(callee)) {
    names.unshift(callee.name.text);
    callee = callee.expression;
  }
  if (!ts.isIdentifier(callee) || !TEST_FUNCTIONS.has(callee.text)) return null;
  // Playwright's test.describe(...) and test.describe.serial(...) are describe blocks.
  const describe = callee.text === 'describe' || callee.text === 'suite' || names[0] === 'describe';
  const modifiers = callee.text === 'test' && names[0] === 'describe' ? names.slice(1) : names;
  if (modifiers.some((name) => OFF.has(name))) return 'off';
  if (!modifiers.every((name) => MODIFIERS.has(name))) return null;
  return describe ? 'describe' : 'test';
}

/** A title's text; a template's placeholders keep their source, as `${name}`. */
function titleText(node: ts.Expression | undefined, file: ts.SourceFile): string | null {
  if (node === undefined) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    const spans = node.templateSpans.map(
      (s) => `\${${s.expression.getText(file)}}${s.literal.text}`,
    );
    return node.head.text + spans.join('');
  }
  if (ts.isParenthesizedExpression(node)) return titleText(node.expression, file);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = titleText(node.left, file);
    const right = titleText(node.right, file);
    return left === null && right === null ? null : (left ?? '…') + (right ?? '…');
  }
  return null;
}

/** Every test and describe block in one test file whose own title names a rule. */
export function namingTitles(file: string, source: string): NamingTitle[] {
  const kind = testKind(file, source);
  const scriptKind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const found: NamingTitle[] = [];
  /** Returns the number of tests at or under `node`. */
  const visit = (node: ts.Node, path: readonly string[]): number => {
    const call = ts.isCallExpression(node) ? testCall(node) : null;
    if (call === 'off') return 0;
    const title =
      call === null ? null : titleText((node as ts.CallExpression).arguments[0], parsed);
    if (call === null || title === null) {
      let tests = 0;
      ts.forEachChild(node, (child) => {
        tests += visit(child, path);
      });
      return tests;
    }
    const titles = [...path, title];
    const ids = [...new Set(title.match(RULE_ID))];
    const entry = { file, kind, title: titles.join(' › '), ids, tests: null as number | null };
    if (ids.length > 0) found.push(entry);
    let tests = 0;
    for (const arg of (node as ts.CallExpression).arguments.slice(1)) tests += visit(arg, titles);
    if (call === 'test') return 1;
    entry.tests = tests;
    return tests;
  };
  visit(parsed, []);
  return found;
}

/** Every committed test file, and every new one that is not ignored. */
export function repoTestFiles(root: string): string[] {
  // Inside a git hook git exports GIT_DIR and others; drop them so git reads `root` (scan.ts).
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      env,
    },
  );
  return [...new Set(out.split('\0'))]
    .filter((file) => TEST_FILE.test(file) && existsSync(join(root, file)))
    .sort();
}

export interface Coverage {
  rules: { rule: Rule; titles: NamingTitle[]; pending: Pending | undefined }[];
  /** Rules that are built (not pending as a whole) and that no test names. */
  unmapped: string[];
  /** IDs named in test titles that are not rules in either table. */
  unknown: string[];
}

export function coverage(rules: readonly Rule[], titles: readonly NamingTitle[]): Coverage {
  const rows = rules.map((rule) => ({
    rule,
    titles: titles.filter((t) => t.ids.includes(rule.id)),
    pending: PENDING.find((p) => p.id === rule.id),
  }));
  const known = new Set(rules.map((r) => r.id));
  for (const p of PENDING) {
    if (!known.has(p.id)) throw new Error(`PENDING names ${p.id}, which is not a rule`);
  }
  return {
    rules: rows,
    unmapped: rows.filter((r) => r.titles.length === 0 && !r.pending?.whole).map((r) => r.rule.id),
    unknown: [...new Set(titles.flatMap((t) => t.ids).filter((id) => !known.has(id)))].sort(),
  };
}

/** Reads the docs and every test file under `root`. */
export function repoCoverage(root: string): Coverage {
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const rules = readRules(read(HEALTH_SAFETY_PATH), read(TEST_PLAN_PATH));
  const titles = repoTestFiles(root).flatMap((file) => namingTitles(file, read(file)));
  return coverage(rules, titles);
}

const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

function testsCell(titles: readonly NamingTitle[]): string {
  const byFile = new Map<string, NamingTitle[]>();
  for (const t of titles) byFile.set(t.file, [...(byFile.get(t.file) ?? []), t]);
  return [...byFile]
    .map(([file, inFile]) => {
      const names = inFile.map((t) =>
        t.tests === null
          ? `“${t.title}”`
          : `“${t.title}” (describe, ${t.tests} ${t.tests === 1 ? 'test' : 'tests'})`,
      );
      return `${inFile[0]?.kind ?? ''}: \`${file}\`: ${names.join('; ')}`;
    })
    .join('<br>');
}

function table(rows: Coverage['rules']): string[] {
  return [
    '| Rule | Text | Tests that name it (kind: file: title) | Kinds |',
    '|---|---|---|---|',
    ...rows.map(({ rule, titles, pending }) => {
      const waits = pending === undefined ? [] : [`Part waits for ${pending.items} (see below)`];
      const tests =
        titles.length > 0
          ? [testsCell(titles), ...waits].join('<br>')
          : `None yet: waits for ${pending?.items ?? '?'}`;
      const kinds = (['unit', 'component', 'scan', 'browser'] as const)
        .filter((k) => titles.some((t) => t.kind === k))
        .join(', ');
      return `| ${rule.id} | ${cell(rule.text)} | ${cell(tests)} | ${kinds} |`;
    }),
  ];
}

/** docs/COVERAGE.md. */
export function renderCoverage(c: Coverage): string {
  const hs = c.rules.filter((r) => r.rule.id.startsWith('HS-'));
  const nn = c.rules.filter((r) => r.rule.id.startsWith('NN-'));
  const mapped = c.rules.filter((r) => r.titles.length > 0).length;
  const whole = c.rules.filter((r) => r.pending?.whole === true && r.titles.length === 0).length;
  const part = c.rules.filter((r) => r.pending !== undefined && r.titles.length > 0).length;
  return [
    '# Coverage of the safety rules and non-negotiables',
    '',
    'Generated by `pnpm coverage:table` (tools/coverage-table/rule-coverage.ts) from HEALTH_SAFETY.md ' +
      'section 8, TEST_PLAN.md section 3.12 and the titles of every unit, component, scan and ' +
      'browser test. Do not edit it by hand: `pnpm scan` (tools/scans/ruleCoverage.test.ts) fails ' +
      'when this file is out of date, when a rule that is built has no test naming it, or when a ' +
      'title names an ID that is not a rule.',
    '',
    'A test names a rule when its own title, or the title of a describe block around it, contains ' +
      'the rule’s ID. A describe block that names a rule is listed once, with the number of tests ' +
      'inside it. Skipped, todo and expected-to-fail tests never count. The rule text is cut to ' +
      'one line; the full rule is in the document it comes from.',
    '',
    `**${c.rules.length} rules** (${hs.length} HS, ${nn.length} NN): ${mapped} named by at least ` +
      `one test, ${c.unmapped.length} built but unnamed, ${whole} waiting as a whole on the laptop ` +
      `extension, and ${part} more with a part that waits on it.`,
    '',
    '## Health and safety rules (HEALTH_SAFETY.md section 8)',
    '',
    ...table(hs),
    '',
    '## Non-negotiable cases (TEST_PLAN.md section 3.12)',
    '',
    ...table(nn),
    '',
    '## Waiting on the laptop extension (items 32 to 34)',
    '',
    'Items 32 to 34 wait for the owner’s Phase 0 decision. Their tests name these rules when they ' +
      'are built, and the entry is then removed from PENDING in tools/coverage-table/ruleCoverage.ts.',
    '',
    '| Rule | What waits | Item | Built part named above |',
    '|---|---|---|---|',
    ...PENDING.map(
      (p) =>
        `| ${p.id} | ${cell(p.what)} | ${p.items} | ${p.whole ? 'No (all of it waits)' : 'Yes'} |`,
    ),
    '',
  ].join('\n');
}
