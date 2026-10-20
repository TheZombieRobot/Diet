import { describe, expect, it } from 'vitest';
import { alcohol } from '../copy/health';
import type { AlcoholGuidanceSet, ProfileSex } from '../storage/records';
import { guidanceFor, NZ_GUIDANCE } from './guidance';

// The C66 words the guidance line must never use (it says "no more than", never "up to").
const C66 = [/\bup\s+to\b/i, /\bsafe\b/i, /\ballowed\b/i, /\bOK\s+to\b/i, /\bwithin\s+your\b/i];

describe('NZ alcohol guidance (U7; NN-09, C66, C25, C46, TD-05)', () => {
  it('holds the HEALTH_SAFETY section 5 figures', () => {
    expect(NZ_GUIDANCE['nz-women']).toEqual({
      set: 'nz-women',
      perDay: 2,
      perWeek: 10,
      alcoholFreeDaysPerWeek: 2,
    });
    expect(NZ_GUIDANCE['nz-men']).toEqual({
      set: 'nz-men',
      perDay: 3,
      perWeek: 15,
      alcoholFreeDaysPerWeek: 2,
    });
  });

  it.each(['nz-women', 'nz-men'] as const)(
    "the %s line names its figures in order and ends with 'No alcohol use is risk-free.'",
    (set) => {
      const line = alcohol.guidance.line[set];
      const { perDay, perWeek, alcoholFreeDaysPerWeek } = NZ_GUIDANCE[set];
      expect([...line.matchAll(/\d+/g)].map((m) => Number(m[0]))).toEqual([
        perDay,
        perWeek,
        alcoholFreeDaysPerWeek,
      ]);
      expect(line.endsWith(alcohol.noRiskFreeLevel)).toBe(true);
      expect(line).toMatch(/no alcohol use is risk-free/i);
      for (const rule of C66) expect(line).not.toMatch(rule);
    },
  );

  const sexes: (ProfileSex | null)[] = ['female', 'male', null];
  const settings: (AlcoholGuidanceSet | null)[] = [null, 'nz-women', 'nz-men'];
  const cases = sexes.flatMap((sex) => settings.map((setting) => [sex, setting] as const));

  it.each(cases)('sex %s with setting %s: the stricter set wins', (sex, setting) => {
    const men = sex === 'male' && setting !== 'nz-women';
    expect(guidanceFor(sex, setting).set).toBe(men ? 'nz-men' : 'nz-women');
  });

  it('says why the set applies', () => {
    expect(guidanceFor(null, 'nz-men').basis).toBe('no-sex');
    expect(guidanceFor('male', 'nz-women').basis).toBe('chosen');
    expect(guidanceFor('male', null).basis).toBe('profile');
    expect(guidanceFor('female', 'nz-men').basis).toBe('profile');
  });
});
