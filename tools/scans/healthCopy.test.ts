import { describe, expect, it } from 'vitest';
import { healthCopy } from '../../packages/core/src/copy/health';
import { commerceRules, healthPhraseRules } from './rules';
import { scanText } from './scan';

// The file scan reads health.ts as source. This reads the evaluated strings, so wording that is
// built up (joined arrays, escapes, constants spliced into templates) is checked as shown.

/** Every string inside the copy object, with its path for readable failures. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [];
}

const copy = strings(healthCopy, 'healthCopy');

describe('evaluated health copy (packages/core/src/copy/health.ts)', () => {
  it('finds every section', () => {
    expect(new Set(copy.map(([path]) => path.split('.')[1]))).toEqual(
      new Set(Object.keys(healthCopy)),
    );
  });

  it.each(copy)(
    '%s passes every health and commerce rule (HS-07, HS-08, HS-16, HS-19, HS-21, HS-31)',
    (path, text) => {
      const found = scanText(path, text, [...healthPhraseRules, ...commerceRules]);
      expect(found.map((v) => v.ruleId)).toEqual([]);
    },
  );
});
