import { describe, expect, it } from 'vitest';
import { alcohol, healthCopy, helpNumbers } from './health';

/** Every string inside a copy section, with its path for readable failures. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [];
}

/**
 * Extra rules per section, on top of the repository-wide banned phrases (tools/scans/rules.ts).
 * Every section must be listed here, so a new section cannot skip review.
 */
const SECTION_RULES: Record<keyof typeof healthCopy, readonly RegExp[]> = {
  helpNumbers: [],
  general: [/\byou(?:'re|\s+are)\s+safe\b/i],
  // HEALTH_SAFETY.md section 5, HS-19, NN-09, UX 5 "deliberately absent".
  alcohol: [
    /\bstreaks?\b/i,
    /\bbadges?\b/i,
    /\btargets?\b/i,
    /\blimits?\b/i,
    /\ballowance\b/i,
    /\bgoals?\b/i,
    /\bwell\s+done\b/i,
    /\bcongrat\w*/i,
    /\bproud\b/i,
    /\bsafe\s+(?:level|amount|limit)\b/i,
    /\byou\s+should\s+stop\b/i,
  ],
};

describe('health copy', () => {
  it('every section has declared rules', () => {
    expect(Object.keys(SECTION_RULES).sort()).toEqual(Object.keys(healthCopy).sort());
  });

  for (const [section, rules] of Object.entries(SECTION_RULES)) {
    it(`${section} copy obeys its section rules`, () => {
      const found = strings(healthCopy[section as keyof typeof healthCopy], section).flatMap(
        ([path, text]) =>
          rules.filter((r) => r.test(text)).map((r) => `${path}: ${String(r)} in "${text}"`),
      );
      expect(found).toEqual([]);
    });
  }

  it('alcohol copy says no alcohol use is risk-free (NN-09)', () => {
    expect(alcohol.noRiskFreeLevel).toBe('No alcohol use is risk-free.');
  });

  it('the first-run notice and help card carry the helpline, text number and 111 (HS-13, HS-20)', () => {
    for (const text of [alcohol.firstRunNotice, alcohol.helpCard]) {
      expect(text).toContain(helpNumbers.alcoholDrugHelpline.number);
      expect(text).toContain(helpNumbers.alcoholDrugHelpline.text);
      expect(text).toContain(helpNumbers.emergency.number);
    }
  });

  it('help numbers match HEALTH_SAFETY.md exactly', () => {
    expect(helpNumbers).toEqual({
      emergency: { name: 'Emergency', number: '111' },
      healthline: { name: 'Healthline (24/7 health advice)', number: '0800 611 116' },
      alcoholDrugHelpline: {
        name: 'Alcohol Drug Helpline (24/7, free, confidential)',
        number: '0800 787 797',
        text: '8681',
      },
      needToTalk: { name: 'Need to Talk (free call or text)', number: '1737' },
    });
  });
});
