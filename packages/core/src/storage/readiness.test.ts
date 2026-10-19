import { describe, expect, it } from 'vitest';
import {
  KETO_CEILING_CLOSED_BY,
  missingReadinessAnswers,
  READINESS_IDS,
  READINESS_QUESTION_IDS,
  READINESS_WORDING,
  readinessInputFromRows,
} from './readiness';
import type { ReadinessRecord } from './records';

const TODAY = '2000-06-01';
const row = (
  questionId: ReadinessRecord['questionId'],
  answer: 'yes' | 'no',
  answeredAt: string,
  wordingVersion = 1,
): ReadinessRecord => ({
  questionId,
  answer,
  wordingVersion,
  answeredAt,
});
const T1 = '2000-01-01T00:00:00.000Z';
const T2 = '2000-02-01T00:00:00.000Z';
const T3 = '2000-03-01T00:00:00.000Z';

describe('readiness answers and the gate input (section 13; C41; section 16 test 7)', () => {
  it('no rows: every answer is null (gated), no confirmation counts, and q1 to q7 are missing (RD-08)', () => {
    const input = readinessInputFromRows([], null, TODAY);
    expect(Object.values(input.answers).every((a) => a === null)).toBe(true);
    expect(input.confirmations).toEqual({ prescriberAgreed: false, gpExerciseDiscussed: false });
    expect(input.minimumAgeYears).toBeNull();
    expect(missingReadinessAnswers(input)).toEqual([...READINESS_QUESTION_IDS]);
  });

  it('a row under an older wording counts as unanswered; a current "no" is not missing', () => {
    const reworded = { ...READINESS_WORDING, q2: 2 };
    const input = readinessInputFromRows(
      [row('q1', 'no', T1), row('q2', 'no', T1)],
      null,
      TODAY,
      reworded,
    );
    expect(input.answers.q1).toBe('no');
    expect(input.answers.q2).toBeNull();
    expect(missingReadinessAnswers(input)).toEqual(['q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  });

  it('version 1 wording numbers are all 1', () => {
    expect(Object.keys(READINESS_WORDING)).toEqual([...READINESS_IDS]);
    expect(Object.values(READINESS_WORDING).every((v) => v === 1)).toBe(true);
  });

  it('minimum age from the birth year: in the year turning 18 the owner may still be 17 (C24)', () => {
    expect(readinessInputFromRows([], 1982, TODAY).minimumAgeYears).toBe(17);
    expect(readinessInputFromRows([], 1981, TODAY).minimumAgeYears).toBe(18);
  });

  it('a birth year after this year gives a minimum age of 0, which gates as under 18', () => {
    expect(readinessInputFromRows([], 2001, TODAY).minimumAgeYears).toBe(0);
  });

  it('RD-03: a prescriber confirmation answered before the latest Q3 answer does not count; one at or after does (D29)', () => {
    expect(
      readinessInputFromRows(
        [row('prescriberAgreed', 'yes', T1), row('q3', 'yes', T2)],
        null,
        TODAY,
      ).confirmations.prescriberAgreed,
    ).toBe(false);
    expect(
      readinessInputFromRows(
        [row('q3', 'yes', T2), row('prescriberAgreed', 'yes', T3)],
        null,
        TODAY,
      ).confirmations.prescriberAgreed,
    ).toBe(true);
    expect(
      readinessInputFromRows(
        [row('q3', 'yes', T2), row('prescriberAgreed', 'yes', T2)],
        null,
        TODAY,
      ).confirmations.prescriberAgreed,
    ).toBe(true);
    expect(
      readinessInputFromRows([row('q3', 'yes', T2), row('prescriberAgreed', 'no', T3)], null, TODAY)
        .confirmations.prescriberAgreed,
    ).toBe(false);
    expect(
      readinessInputFromRows([row('prescriberAgreed', 'yes', T3)], null, TODAY).confirmations
        .prescriberAgreed,
    ).toBe(false);
  });

  it('RD-05: the GP exercise confirmation follows the same rule with Q6', () => {
    expect(
      readinessInputFromRows(
        [row('gpExerciseDiscussed', 'yes', T1), row('q6', 'yes', T2)],
        null,
        TODAY,
      ).confirmations.gpExerciseDiscussed,
    ).toBe(false);
    expect(
      readinessInputFromRows(
        [row('q6', 'yes', T2), row('gpExerciseDiscussed', 'yes', T3)],
        null,
        TODAY,
      ).confirmations.gpExerciseDiscussed,
    ).toBe(true);
    const reworded = { ...READINESS_WORDING, q6: 2 };
    expect(
      readinessInputFromRows(
        [row('q6', 'yes', T2), row('gpExerciseDiscussed', 'yes', T3)],
        null,
        TODAY,
        reworded,
      ).confirmations.gpExerciseDiscussed,
    ).toBe(false);
  });

  it('D30 as changed: questions 1, 2 and 5 switch the keto carb ceiling off entirely', () => {
    expect(KETO_CEILING_CLOSED_BY).toEqual(['q1', 'q2', 'q5']);
  });
});
