import { describe, expect, it } from 'vitest';
import { alcohol } from '../copy/health';
import type { AlcoholGuidanceSet, ProfileSex } from '../storage/records';
import { readinessGates } from '../readiness/gates';
import {
  guidanceFor,
  guidanceShown,
  helpTriggerWeeklyGuidance,
  isAboveGuidance,
  NZ_GUIDANCE,
  reachesDoubleGuidance,
} from './guidance';

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

  it('F30: with answer 2 "yes" or unanswered no figures are shown, only the pregnancy line', () => {
    const gates = (q2: 'yes' | 'no' | null) =>
      readinessGates({
        answers: { q1: 'no', q2, q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no' },
        confirmations: { prescriberAgreed: false, gpExerciseDiscussed: false },
        minimumAgeYears: 50,
        lowWeight: false,
      });
    expect(guidanceShown('male', null, gates('no'))).toEqual({ kind: 'guidance', set: 'nz-men' });
    for (const q2 of ['yes', null] as const) {
      expect(guidanceShown('female', null, gates(q2))).toEqual({ kind: 'pregnancy' });
      expect(guidanceShown('male', null, gates(q2))).toEqual({ kind: 'pregnancy' });
    }
    const line = alcohol.guidance.pregnancy;
    expect(line).not.toMatch(/\d/);
    expect(line).toMatch(/midwife or GP/);
    // Section 5: never a sudden stop for someone who drinks most days (re-check V19).
    expect(line).toContain(
      'If you drink most days, talk to them before making a change, because stopping suddenly can be risky.',
    );
    expect(line.endsWith(alcohol.noRiskFreeLevel)).toBe(true);
    for (const rule of C66) expect(line).not.toMatch(rule);
  });

  it('says why the set applies', () => {
    expect(guidanceFor(null, 'nz-men').basis).toBe('no-sex');
    expect(guidanceFor('male', 'nz-women').basis).toBe('chosen');
    expect(guidanceFor('male', null).basis).toBe('profile');
    expect(guidanceFor('female', 'nz-men').basis).toBe('profile');
  });
});

describe('the item 28 comparisons (U1; HS-05, HS-06, C94)', () => {
  it('"no more than" includes the figure: only a shown total strictly above it is above', () => {
    expect(isAboveGuidance(3, 3)).toBe(false);
    expect(isAboveGuidance(3.01, 3)).toBe(true);
  });

  it('the help card counts from exactly double the weekly figure', () => {
    expect(reachesDoubleGuidance(20, 10)).toBe(true);
    expect(reachesDoubleGuidance(19.99, 10)).toBe(false);
  });

  it('V21: with answer 2 "yes" or unanswered, the double-guidance trigger takes the women\'s figure, whatever the set', () => {
    const gates = (q2: 'yes' | 'no' | null) =>
      readinessGates({
        answers: { q1: 'no', q2, q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no' },
        confirmations: { prescriberAgreed: false, gpExerciseDiscussed: false },
        minimumAgeYears: 50,
        lowWeight: false,
      });
    expect(helpTriggerWeeklyGuidance('male', null, gates('no'))).toBe(15);
    expect(helpTriggerWeeklyGuidance('male', 'nz-women', gates('no'))).toBe(10);
    for (const q2 of ['yes', null] as const) {
      for (const sex of ['male', 'female', null] as const)
        expect(helpTriggerWeeklyGuidance(sex, 'nz-men', gates(q2))).toBe(10);
    }
  });
});
