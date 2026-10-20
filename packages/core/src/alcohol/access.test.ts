import { describe, expect, it } from 'vitest';
import { gateInputFromRecords, readinessGates } from '../readiness/gates';
import { READINESS_QUESTION_IDS, READINESS_WORDING } from '../storage/readiness';
import type { ReadinessRecord } from '../storage/records';
import { alcoholAccess } from './access';

const ACK = '2000-03-01T00:00:00.000Z';

/** The gates from real readiness rows: every question "no", q1 as given (null: unanswered). */
function gatesFor(q1: 'yes' | 'no' | null, birthYear: number) {
  const rows: ReadinessRecord[] = READINESS_QUESTION_IDS.filter(
    (q) => q !== 'q1' || q1 !== null,
  ).map((q) => ({
    questionId: q,
    answer: q === 'q1' && q1 !== null ? q1 : 'no',
    wordingVersion: READINESS_WORDING[q],
    answeredAt: ACK,
  }));
  return readinessGates(
    gateInputFromRecords({
      rows,
      birthYear,
      heightCm: null,
      currentWeightKg: null,
      today: '2000-03-01',
    }),
  );
}

describe('alcoholAccess (U2; HS-20, C53, RD-01)', () => {
  it.each([
    ['no acknowledgement, gates open', null, gatesFor('no', 1970), 'notice-first'],
    ['acknowledged, q1 yes', ACK, gatesFor('yes', 1970), 'logging-off'],
    ['acknowledged, q1 unanswered', ACK, gatesFor(null, 1970), 'logging-off'],
    ['acknowledged, a birth year that may be under 18', ACK, gatesFor('no', 1985), 'logging-off'],
    ['acknowledged and open', ACK, gatesFor('no', 1970), 'open'],
  ] as const)('%s gives %s', (_case, alcoholNoticeAckAt, gates, expected) => {
    expect(alcoholAccess({ alcoholNoticeAckAt, gates })).toBe(expected);
  });
});
