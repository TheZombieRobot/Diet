import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extensionRuleSets, RULE_SETS, scanSource, scanText } from './scan';

// Sentences that HEALTH_SAFETY.md, UX_SCREENS.md, TEST_PLAN.md and INTEGRATION_FEASIBILITY.md
// require the app to show, collected by a reviewer. The rules are strict, but they must never
// block copy the docs require: each sentence is checked against every rule set, as plain text,
// as JSX text in a screen and as a string in health.ts.
const required = JSON.parse(
  readFileSync(join(import.meta.dirname, 'required-copy.json'), 'utf8'),
) as string[];

/**
 * UX_SCREENS.md section 8 wording for the mode-A panel. Mode A is not approved
 * (INTEGRATION_FEASIBILITY.md 9.3), so the cart-status rule keeps blocking it.
 */
const MODE_A_ONLY = new Set(['Review in cart']);

const ALL_SETS = [...RULE_SETS, ...extensionRuleSets({ pending: true, modeAApproved: false })];
const ALL_RULES = ALL_SETS.flatMap((set) => set.rules);

const jsxEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');

function hits(sentence: string): string[] {
  const found = [
    ...scanText('copy.txt', sentence, ALL_RULES),
    ...scanSource(
      'apps/mobile-web/src/screens/Copy.tsx',
      `export const Copy = () => <p>${jsxEscape(sentence)}</p>;\n`,
      ALL_SETS,
    ),
    ...scanSource(
      'packages/core/src/copy/health.ts',
      `export const copy = ${JSON.stringify(sentence)};\n`,
      ALL_SETS,
    ),
  ];
  return [...new Set(found.map((v) => v.ruleId))];
}

describe('required copy passes every rule set', () => {
  it('holds the full reviewed list', () => {
    expect(required).toHaveLength(120);
  });

  it.each(required.filter((s) => !MODE_A_ONLY.has(s)))('%j is not flagged', (sentence) => {
    expect(hits(sentence)).toEqual([]);
  });

  it('mode-A-only wording stays blocked until mode A is approved', () => {
    for (const sentence of MODE_A_ONLY) {
      expect(required).toContain(sentence);
      expect(hits(sentence)).toEqual(['in-cart']);
    }
  });
});
