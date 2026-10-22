import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COVERAGE_PATH,
  coverage,
  namingTitles,
  PENDING,
  readRules,
  renderCoverage,
  repoCoverage,
} from '../coverage-table/ruleCoverage';

// Checklist item 36 (TEST_PLAN section 5 item 5): every health-safety rule and non-negotiable case
// maps to a test that names it, and docs/COVERAGE.md is the table as generated now. CI runs this
// with the other scans, so a renamed test, a new rule or a stale table fails the build.
const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const result = repoCoverage(root);

describe('the coverage table (checklist item 36)', () => {
  it('reads every row of HEALTH_SAFETY section 8 and TEST_PLAN section 3.12, once each', () => {
    const ids = result.rules.map((r) => r.rule.id);
    const rows = (doc: string, prefix: string) =>
      new Set(doc.match(new RegExp(`^\\| ${prefix}-\\d{2} \\|`, 'gm'))).size;
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('HS-'))).toHaveLength(
      rows(read('docs/HEALTH_SAFETY.md'), 'HS'),
    );
    expect(ids.filter((id) => id.startsWith('NN-'))).toHaveLength(
      rows(read('docs/TEST_PLAN.md'), 'NN'),
    );
    expect(ids).toContain('HS-41');
    expect(ids).toContain('NN-09');
  });

  it('every rule that is built is named by at least one test', () => {
    expect(result.unmapped).toEqual([]);
  });

  it('every ID a test title names is a rule', () => {
    expect(result.unknown).toEqual([]);
  });

  it('a rule waiting as a whole on the extension is named by no test yet', () => {
    const waiting = PENDING.filter((p) => p.whole).map((p) => p.id);
    const named = result.rules.filter((r) => r.titles.length > 0).map((r) => r.rule.id);
    expect(waiting.filter((id) => named.includes(id))).toEqual([]);
  });

  it(`${COVERAGE_PATH} is up to date (run pnpm coverage:table)`, () => {
    expect(read(COVERAGE_PATH)).toBe(renderCoverage(result));
  });
});

describe('how the table reads titles', () => {
  it('takes it, test and describe titles, describe paths and templates, never comments or bodies', () => {
    const source = [
      "describe('outer (HS-01)', () => {",
      "  it('HS-02: a test', () => {});",
      "  it.each([1, 2])('HS-03 with %s', () => {});",
      '  it(`HS-07 ${name}`, () => {});',
      "  // it('HS-08 in a comment', () => {});",
      "  it('a plain test', () => { expect('HS-10 in a body').toBe('x'); });",
      '});',
      "test.describe.serial('NN-01 browser', () => {",
      "  test('plain', async () => { await test.step('NN-02 a step', async () => {}); });",
      '});',
    ].join('\n');
    expect(namingTitles('e2e/x.spec.ts', source).map((t) => [t.title, t.ids, t.tests])).toEqual([
      ['outer (HS-01)', ['HS-01'], 4],
      ['outer (HS-01) › HS-02: a test', ['HS-02'], null],
      ['outer (HS-01) › HS-03 with %s', ['HS-03'], null],
      ['outer (HS-01) › HS-07 ${name}', ['HS-07'], null],
      ['NN-01 browser', ['NN-01'], 1],
    ]);
  });

  it.each(['skip', 'todo', 'fixme', 'fails', 'skipIf(true)'])(
    'a test or describe block marked %s never counts',
    (modifier) => {
      const source = [
        `it.${modifier}('HS-04 off', () => {});`,
        `describe.${modifier}('HS-05 off', () => { it('HS-06 inside', () => {}); });`,
      ].join('\n');
      expect(namingTitles('packages/core/src/x.test.ts', source)).toEqual([]);
    },
  );

  it('names the kind from where the test lives and what it renders', () => {
    const kind = (file: string, source = "it('HS-01', () => {});") =>
      namingTitles(file, source)[0]?.kind;
    expect(kind('packages/core/src/x.test.ts')).toBe('unit');
    expect(kind('apps/mobile-web/src/screens/X.test.tsx')).toBe('component');
    expect(kind('tools/scans/x.test.ts')).toBe('scan');
    expect(kind('e2e/x.spec.ts')).toBe('browser');
  });

  it('a part of a rule waiting on the extension does not excuse the rest of it', () => {
    const rules = readRules(read('docs/HEALTH_SAFETY.md'), read('docs/TEST_PLAN.md'));
    const unnamed = coverage(rules, []);
    const whole = PENDING.filter((p) => p.whole).map((p) => p.id);
    expect(unnamed.unmapped).toEqual(rules.map((r) => r.id).filter((id) => !whole.includes(id)));
    expect(unnamed.unmapped).toContain('NN-07');
  });
});
