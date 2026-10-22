import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page, Request } from '@playwright/test';
import type * as Axe from 'axe-core';

/**
 * The accessibility audit (checklist item 37): axe-core, the engine Lighthouse's accessibility
 * category runs, injected into the page by the test only. It is a dev dependency of the browser
 * tests and never part of the app. axe-core sends nothing anywhere; its one network call fetches
 * a stylesheet the page cannot read (its CSS preload), which `preload: false` turns off, and the
 * audit checks that no request leaves the page while it runs.
 */
const AXE_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

/** The rule sets run: WCAG 2.0, 2.1 and 2.2 A and AA, and axe's best practices. */
export const AUDIT_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
] as const;

export interface Finding {
  readonly where: string;
  readonly rule: string;
  readonly impact: string;
  readonly help: string;
  readonly targets: readonly string[];
}

/** Runs the audit on the page as it is drawn now; returns every violation, of any impact. */
export async function auditPage(page: Page, where: string): Promise<Finding[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE_SOURCE);
  const requests: string[] = [];
  const onRequest = (request: Request) => requests.push(request.url());
  page.on('request', onRequest);
  const violations = await page.evaluate(async (tags) => {
    const axe = (window as unknown as { axe: typeof Axe }).axe;
    const result = await axe.run(document, {
      preload: false,
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: [...tags] },
    });
    return result.violations.map((v) => ({
      rule: v.id,
      impact: v.impact ?? 'unknown',
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));
  }, AUDIT_TAGS);
  page.off('request', onRequest);
  if (requests.length > 0) throw new Error(`The audit made requests: ${requests.join(', ')}`);
  return violations.map((v) => ({ where, ...v }));
}

/** Serious and critical findings fail the tests. */
export const isSevere = (finding: Finding): boolean =>
  finding.impact === 'serious' || finding.impact === 'critical';

/** A finding, described for a failure message. */
export const describeFinding = (f: Finding): string =>
  `${f.where}: ${f.rule} (${f.impact}) ${f.help}: ${f.targets.join(' | ')}`;
