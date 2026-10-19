import { describe, expect, it } from 'vitest';
import { readinessGates } from '../readiness/gates';
import type { ReadinessInput, ReadinessQuestionId } from '../storage/readiness';
import {
  addDislikeTerm,
  checkProfileForm,
  kickstartChoice,
  type ProfileDraft,
  type ProfileFormContext,
} from './profileForm';

const TODAY = '2000-03-01';

const readiness = (
  answers: Partial<Record<ReadinessQuestionId, 'yes' | 'no' | null>> = {},
  prescriberAgreed = false,
): ReadinessInput => ({
  answers: { q1: 'no', q2: 'no', q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no', ...answers },
  confirmations: { prescriberAgreed, gpExerciseDiscussed: false },
  minimumAgeYears: null,
});

/** The NN-03 fixture: 175 cm, 90 kg, a 70 kg long-term goal; born 1970. */
const DRAFT: ProfileDraft = {
  heightCm: '175',
  weightKg: '90',
  birthYear: '1970',
  goalKg: '70',
  sex: 'female',
  activityLevel: 'active-job',
  equipmentBands: false,
  equipmentDumbbells: false,
  householdSize: 3,
  allergens: ['sesame', 'milk', 'milk'],
  dislikeTerms: ['liver'],
  glutenFreeHousehold: false,
  kickstartOptIn: true,
};

const ctx = (over: Partial<ProfileFormContext> = {}): ProfileFormContext => ({
  mode: 'onboarding',
  readiness: readiness(),
  storedWeightKg: null,
  today: TODAY,
  storedGoalKg: null,
  ...over,
});

const check = (draft: Partial<ProfileDraft> = {}, over: Partial<ProfileFormContext> = {}) =>
  checkProfileForm({ ...DRAFT, ...draft }, ctx(over));

describe('checkProfileForm: fields (U21)', () => {
  it('a complete draft gives a value, with allergens de-duplicated in order', () => {
    const { problems, value } = check();
    expect(problems).toEqual({});
    expect(value).toMatchObject({
      heightCm: 175,
      weightKg: 90,
      birthYear: 1970,
      sex: 'female',
      goal: { write: true, goalKg: 70 },
      kickstartOptIn: true,
      householdSize: 3,
      allergens: ['milk', 'sesame'],
      dislikeTerms: ['liver'],
    });
  });

  it('height, birth year and sex are required; weight only while goal setting is available', () => {
    const empty = check({ heightCm: '', birthYear: ' ', sex: null, weightKg: '', goalKg: '' });
    expect(empty.problems).toEqual({
      heightCm: 'required',
      birthYear: 'required',
      sex: 'required',
      weightKg: 'required',
    });
    expect(empty.value).toBeNull();
    const q2 = check({ weightKg: '', goalKg: '' }, { readiness: readiness({ q2: 'yes' }) });
    expect(q2.show.weightRequired).toBe(false);
    expect(q2.problems).toEqual({});
    expect(q2.value?.weightKg).toBeNull();
  });

  it('numbers: plain digits with at most one decimal place, in range', () => {
    expect(check({ weightKg: '82,5' }).problems.weightKg).toBe('not-a-number');
    expect(check({ weightKg: '82kg' }).problems.weightKg).toBe('not-a-number');
    expect(check({ weightKg: '82.55' }).problems.weightKg).toBe('one-decimal');
    expect(check({ heightCm: '119.9' }).problems.heightCm).toBe('range');
    expect(check({ heightCm: '120' }).problems.heightCm).toBeUndefined();
    expect(check({ heightCm: '230' }).problems.heightCm).toBeUndefined();
    expect(check({ heightCm: '230.1' }).problems.heightCm).toBe('range');
    expect(check({ weightKg: '19.9' }).problems.weightKg).toBe('range');
    expect(check({ weightKg: '400', goalKg: '' }).problems.weightKg).toBeUndefined();
    expect(check({ weightKg: '400.1' }).problems.weightKg).toBe('range');
    expect(check({ householdSize: 21 }).problems.householdSize).toBe('range');
  });

  it('birth year: 1900 to this year (E42)', () => {
    expect(check({ birthYear: '1900' }).problems.birthYear).toBeUndefined();
    expect(check({ birthYear: '2000' }).problems.birthYear).toBeUndefined();
    expect(check({ birthYear: '2001' }).problems.birthYear).toBe('future-year');
    expect(check({ birthYear: '1899' }).problems.birthYear).toBe('range');
    expect(check({ birthYear: '1970.5' }).problems.birthYear).toBe('not-a-number');
  });
});

describe('checkProfileForm: the long-term goal (U22; HS-01 floor part, C04, NN-03)', () => {
  it('70 kg at 175 cm and 90 kg is accepted: no 20% rule at entry', () => {
    expect(check().value?.goal).toEqual({ write: true, goalKg: 70 });
  });

  it('refuses a goal below BMI 18.5, not below the weight, or without weight or height', () => {
    expect(check({ goalKg: '56.6' }).problems.goalKg).toBe('goal-below-bmi-floor');
    expect(check({ goalKg: '56.7' }).problems.goalKg).toBeUndefined();
    expect(check({ goalKg: '90' }).problems.goalKg).toBe('goal-not-below-weight');
    expect(check({ goalKg: '95' }).problems.goalKg).toBe('goal-not-below-weight');
    expect(check({ weightKg: '' }).problems.goalKg).toBe('goal-needs-weight');
    expect(check({ heightCm: '' }).problems.goalKg).toBe('goal-needs-height');
    expect(check({ goalKg: '' }).value?.goal).toEqual({ write: true, goalKg: null });
  });
});

describe('checkProfileForm: answers that close goal setting and Kickstart (U23; RD-01, RD-02, RD-04, C42, HS-35)', () => {
  const closers: [string, Partial<ProfileDraft>, ReadinessInput][] = [
    ['answer 1', {}, readiness({ q1: 'yes' })],
    ['answer 2', {}, readiness({ q2: 'yes' })],
    ['answer 5', {}, readiness({ q5: 'yes' })],
    ['a birth year that may be under 18', { birthYear: '1982' }, readiness()],
    ['a low weight with answer 5 "no"', { weightKg: '55' }, readiness()],
  ];

  it.each(closers)('%s hides the goal and Kickstart and writes neither', (name, draft, answers) => {
    const result = check(draft, { readiness: answers });
    expect(result.show.goal).toBe(false);
    expect(result.show.kickstart).toBe(false);
    expect(result.value?.goal).toEqual({ write: false });
    expect(result.value?.kickstartOptIn).toBe(false);
    // A low weight was entered, so the weight stays required for it (E11).
    expect(result.show.weightRequired).toBe(name.startsWith('a low weight'));
    expect(result.weightCheck).toBe(
      name.startsWith('a low weight') ? 'low-weight-answered-no' : 'consistent',
    );
  });

  it('changing the low weight back restores the goal and Kickstart', () => {
    expect(check({ weightKg: '55' }).show.goal).toBe(false);
    const back = check({ weightKg: '82' });
    expect(back.show.goal).toBe(true);
    expect(back.show.kickstart).toBe(true);
  });

  it('the age cross-check follows the typed birth year (C24)', () => {
    expect(check({ birthYear: '1982' }).ageCheck).toBe('birth-year-under-18');
    expect(check({}, { readiness: readiness({ q1: 'yes' }) }).ageCheck).toBe(
      'answered-under-18-adult-birth-year',
    );
  });

  it('Settings mode shows no weight, goal or Kickstart, and flags a stored goal below the floor for a new height (E41)', () => {
    const result = check(
      { weightKg: '', goalKg: '', heightCm: '190' },
      { mode: 'settings', storedGoalKg: 60, storedWeightKg: 90 },
    );
    expect(result.show).toEqual({
      weight: false,
      weightRequired: false,
      goal: false,
      kickstart: false,
    });
    expect(result.goalHiddenByHeight).toBe(true);
    expect(result.problems).toEqual({});
    expect(result.value?.goal).toEqual({ write: false });
    expect(
      check({ heightCm: '175' }, { mode: 'settings', storedGoalKg: 60 }).goalHiddenByHeight,
    ).toBe(false);
  });
});

describe('kickstartChoice (U24; C06, D31)', () => {
  const open = readinessGates({ ...readiness(), lowWeight: false });
  const q3Confirmed = readinessGates({ ...readiness({ q3: 'yes' }, true), lowWeight: false });
  const q3Open = readinessGates({ ...readiness({ q3: 'yes' }), lowWeight: false });

  it('on by default; off while answer 3 is yes, even confirmed, until the profile is confirmed; then stored', () => {
    expect(kickstartChoice(open, 'no', true, false)).toEqual({ shown: true, value: true });
    expect(kickstartChoice(q3Confirmed, 'yes', true, false)).toEqual({ shown: true, value: false });
    expect(kickstartChoice(q3Open, 'yes', true, false)).toEqual({ shown: false, value: false });
    expect(kickstartChoice(q3Confirmed, 'yes', true, true)).toEqual({ shown: true, value: true });
    expect(kickstartChoice(open, 'no', false, true)).toEqual({ shown: true, value: false });
  });
});

describe('addDislikeTerm (U25)', () => {
  it('trims, and refuses empty, too long, duplicate ignoring case and a 51st term', () => {
    expect(addDislikeTerm([], '  liver ')).toEqual({ ok: true, list: ['liver'] });
    expect(addDislikeTerm([], '   ')).toEqual({ ok: false, problem: 'empty' });
    expect(addDislikeTerm([], 'x'.repeat(41))).toEqual({ ok: false, problem: 'too-long' });
    expect(addDislikeTerm(['liver'], 'Liver')).toEqual({ ok: false, problem: 'duplicate' });
    const fifty = Array.from({ length: 50 }, (_, i) => `food ${i}`);
    expect(addDislikeTerm(fifty, 'kidney')).toEqual({ ok: false, problem: 'too-many' });
  });
});
