import { describe, expect, it } from 'vitest';
import { type GateInput, readinessGates } from '../readiness/gates';
import type { Instant } from '../storage/primitives';
import { READINESS_QUESTION_IDS, type ReadinessQuestionId } from '../storage/readiness';
import {
  canCompleteOnboarding,
  firstMissingQuestion,
  FLOW_STEPS,
  furthestView,
  nextStep,
  type OnboardingProfile,
  type OnboardingProgress,
  onboardingCompletionPatch,
  onboardingResumeStep,
  previousStep,
  stepBars,
  stepPosition,
  viewAllowed,
} from './steps';

const T = '2000-01-01T00:00:00.000Z' as Instant;
const NOW = '2000-03-01T00:00:00.000Z' as Instant;

const input = (
  answers: Partial<Record<ReadinessQuestionId, 'yes' | 'no' | null>> = {},
  more: Partial<GateInput> = {},
): GateInput => ({
  answers: { q1: 'no', q2: 'no', q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no', ...answers },
  confirmations: { prescriberAgreed: false, gpExerciseDiscussed: false },
  minimumAgeYears: 40,
  lowWeight: false,
  ...more,
});

const done: OnboardingProgress = {
  alcoholNoticeAckAt: T,
  profileConfirmedAt: T,
  scheduleConfirmedAt: T,
  gardenConfirmedAt: T,
  onboardingCompletedAt: T,
};
const profile: OnboardingProfile = { sex: 'female', heightCm: 175, birthYear: 1970 };

/** A small seeded generator, so the 500 cases are the same on every run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe('onboardingResumeStep (storage spec 4.4)', () => {
  it('U16 HS-20: with no acknowledgement it is always the notice, whatever else is stored', () => {
    const random = seeded(13);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)] as T;
    for (let n = 0; n < 500; n++) {
      const progress: OnboardingProgress = {
        alcoholNoticeAckAt: null,
        profileConfirmedAt: pick([null, T]),
        scheduleConfirmedAt: pick([null, T]),
        gardenConfirmedAt: pick([null, T]),
        onboardingCompletedAt: pick([null, T]),
      };
      const answers = Object.fromEntries(
        READINESS_QUESTION_IDS.map((q) => [q, pick(['yes', 'no', null] as const)]),
      );
      const p = {
        sex: pick(['female', 'male', null] as const),
        heightCm: pick([175, null]),
        birthYear: pick([1970, null]),
      };
      expect(onboardingResumeStep(progress, input(answers, { lowWeight: random() < 0.5 }), p)).toBe(
        'alcohol-notice',
      );
    }
  });

  it('U17 RD-07 / RD-08 / HS-34: each step resumes where it should', () => {
    // Missing answers come before everything but the notice, even after setup (import, rewording).
    expect(onboardingResumeStep(done, input({ q6: null }), profile)).toBe('readiness');
    expect(onboardingResumeStep(done, input(), profile)).toBe('done');
    const setup = { ...done, onboardingCompletedAt: null };
    expect(onboardingResumeStep({ ...setup, profileConfirmedAt: null }, input(), profile)).toBe(
      'readiness-summary',
    );
    expect(onboardingResumeStep(setup, input(), { ...profile, sex: null })).toBe('profile');
    const noSchedule = { ...setup, scheduleConfirmedAt: null, gardenConfirmedAt: null };
    expect(onboardingResumeStep(noSchedule, input(), profile)).toBe('schedule');
    // Fasting gated (answer 5, a birth year that may be under 18, a low weight): no schedule step.
    for (const gated of [
      input({ q5: 'yes' }),
      input({}, { minimumAgeYears: 17 }),
      input({}, { lowWeight: true }),
    ]) {
      expect(onboardingResumeStep(noSchedule, gated, profile)).toBe('garden');
    }
    expect(onboardingResumeStep(setup, input(), profile)).toBe('finish');
  });
});

describe('step numbers and moves (U18; E54, E55)', () => {
  const open = readinessGates(input());
  const gated = readinessGates(input({ q5: 'yes' }));

  it('always counts six steps; a skipped schedule is drawn as done once the profile is confirmed', () => {
    expect(FLOW_STEPS.map((s) => stepPosition(s))).toEqual(
      [1, 2, 3, 4, 5, 6].map((index) => ({ index, count: 6 })),
    );
    expect(stepBars('garden', gated, true)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
      'current',
    ]);
    expect(stepBars('profile', gated, false)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'todo',
      'todo',
    ]);
    expect(stepBars('profile', gated, true)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'done',
      'todo',
    ]);
    expect(stepBars('profile', open, true)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'todo',
      'todo',
    ]);
  });

  it('next and previous skip the schedule only while fasting is gated', () => {
    expect(nextStep('profile', open)).toBe('schedule');
    expect(nextStep('profile', gated)).toBe('garden');
    expect(nextStep('garden', open)).toBe('done');
    expect(previousStep('garden', open)).toBe('schedule');
    expect(previousStep('garden', gated)).toBe('profile');
    expect(previousStep('welcome', open)).toBeNull();
    expect(firstMissingQuestion(input({ q3: null, q6: null }))).toBe('q3');
    expect(firstMissingQuestion(input())).toBeNull();
  });

  it('the furthest view for each resume step, and which views are allowed', () => {
    const i = input({ q3: null });
    expect(furthestView('alcohol-notice', i)).toEqual({ kind: 'notice' });
    expect(furthestView('readiness', i)).toEqual({ kind: 'question', question: 'q3' });
    expect(furthestView('readiness-summary', input())).toEqual({ kind: 'profile' });
    expect(furthestView('profile', input())).toEqual({ kind: 'profile' });
    expect(furthestView('schedule', input())).toEqual({ kind: 'schedule' });
    expect(furthestView('garden', input())).toEqual({ kind: 'garden' });
    expect(furthestView('finish', input())).toEqual({ kind: 'finish' });

    expect(viewAllowed({ kind: 'welcome' }, 'alcohol-notice', i)).toBe(true);
    expect(viewAllowed({ kind: 'welcome' }, 'readiness', i)).toBe(false);
    expect(viewAllowed({ kind: 'notice' }, 'profile', input())).toBe(false);
    expect(viewAllowed({ kind: 'question', question: 'q3' }, 'readiness', i)).toBe(true);
    expect(viewAllowed({ kind: 'question', question: 'q4' }, 'readiness', i)).toBe(false);
    expect(viewAllowed({ kind: 'profile' }, 'readiness-summary', input())).toBe(true);
    expect(viewAllowed({ kind: 'schedule' }, 'readiness-summary', input())).toBe(false);
    expect(viewAllowed({ kind: 'schedule' }, 'garden', input())).toBe(true);
    expect(viewAllowed({ kind: 'schedule' }, 'garden', input({ q5: 'yes' }))).toBe(false);
  });
});

describe('completing setup (U19; C72, C109, E16)', () => {
  it('canCompleteOnboarding holds only when every earlier step is done', () => {
    const setup = { ...done, onboardingCompletedAt: null, gardenConfirmedAt: null };
    expect(canCompleteOnboarding(setup, input(), profile)).toBe(true);
    expect(canCompleteOnboarding({ ...setup, scheduleConfirmedAt: null }, input(), profile)).toBe(
      false,
    );
    expect(
      canCompleteOnboarding({ ...setup, scheduleConfirmedAt: null }, input({ q2: 'yes' }), profile),
    ).toBe(true);
    expect(canCompleteOnboarding(setup, input({ q4: null }), profile)).toBe(false);
    expect(canCompleteOnboarding({ ...setup, alcoholNoticeAckAt: null }, input(), profile)).toBe(
      false,
    );
  });

  it('the completion patch fills only empty clocks, and only while the keto ceiling is available', () => {
    const open = readinessGates(input());
    const fresh = { dietMode: 'keto', firstLowCarbAt: null, carbCeilingStartedAt: null } as const;
    expect(onboardingCompletionPatch(fresh, open, NOW)).toEqual({
      firstLowCarbAt: NOW,
      carbCeilingStartedAt: NOW,
    });
    expect(
      onboardingCompletionPatch({ ...fresh, dietMode: 'moderate-low-carb' }, open, NOW),
    ).toEqual({
      firstLowCarbAt: NOW,
    });
    expect(onboardingCompletionPatch({ ...fresh, dietMode: 'balanced' }, open, NOW)).toEqual({});
    expect(onboardingCompletionPatch(fresh, readinessGates(input({ q5: 'yes' })), NOW)).toEqual({});
    const once = { ...fresh, ...onboardingCompletionPatch(fresh, open, NOW) };
    expect(onboardingCompletionPatch(once, open, '2000-03-02T00:00:00.000Z')).toEqual({});
  });
});
