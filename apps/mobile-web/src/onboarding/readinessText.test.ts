// The readiness wording against the gates, over every combination of answers, confirmations, birth
// year and weight (item 13 review: a line must never say a feature is on, can be chosen or comes on
// with a confirmation while the gates keep it off; HEALTH_SAFETY section 1). Pure; no database.
import {
  featureGateOf,
  GATED_FEATURES,
  type GateInput,
  READINESS_QUESTION_IDS,
  type ReadinessGates,
  readinessGates,
  type YesNo,
} from '@diet/core';
import { readiness } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import { confirmationHint, consequenceText, featureOffText } from './readinessText';

/** Every gate input: 2^7 answer sets × both confirmations × low weight × a birth year under 18. */
function* everyInput(): Generator<GateInput> {
  for (let bits = 0; bits < 2 ** 11; bits += 1) {
    const on = (i: number) => (bits & (1 << i)) !== 0;
    const answers = Object.fromEntries(
      READINESS_QUESTION_IDS.map((q, i) => [q, (on(i) ? 'yes' : 'no') satisfies YesNo]),
    ) as GateInput['answers'];
    yield {
      answers,
      confirmations: { prescriberAgreed: on(7), gpExerciseDiscussed: on(8) },
      minimumAgeYears: on(9) ? 16 : 40,
      lowWeight: on(10),
    };
  }
}

/** What a line claims, and what the gates must then allow. */
function claimsHold(text: string, gates: ReadinessGates): string[] {
  const wrong: string[] = [];
  const fasting = featureGateOf(gates, 'fasting');
  if (/\ballowed\b/i.test(text)) wrong.push('says "allowed"');
  if (
    text.includes('Kickstart and carb ceilings under 50 g can be chosen') &&
    fasting.reasons.length > 0
  ) {
    wrong.push('says fasting can be chosen while it is off');
  }
  if (/still planned[^.]*energy deficit/.test(text) && !gates.deficitAllowed) {
    wrong.push('says a deficit is still planned while it is off');
  }
  if (text.includes('carb ceiling of at least 50 g') && !gates.ketoCeilingAvailable) {
    wrong.push('says a carb ceiling is planned while it is off');
  }
  if (text.includes('exercise planner') && !gates.exercisePlansAvailable) {
    wrong.push('says exercise is planned while it is off');
  }
  const onlyConfirmation = fasting.reasons.join() === 'diabetes-medication';
  if (/until you confirm your prescriber has agreed\./.test(text) && !onlyConfirmation) {
    wrong.push('says the confirmation alone switches fasting on');
  }
  if (text.includes('exercise plans can be shown') && !gates.exercisePlansAvailable) {
    wrong.push('says exercise plans can be shown while they are off');
  }
  return wrong;
}

describe('readiness wording follows the gates (item 13 review)', () => {
  it('no consequence line claims more than the gates allow, for every combination', () => {
    const wrong: string[] = [];
    for (const input of everyInput()) {
      const gates = readinessGates(input);
      for (const q of READINESS_QUESTION_IDS.filter((id) => input.answers[id] === 'yes')) {
        for (const mode of ['keto', 'balanced'] as const) {
          const text = consequenceText(q, input, gates, mode);
          for (const problem of claimsHold(text, gates)) {
            wrong.push(`${q} in ${mode} with ${JSON.stringify(input)}: ${problem}`);
          }
          // F34: Balanced mode has no carb ceiling, so no line plans low-carb meals with one.
          if (mode === 'balanced' && /low-carb, with a carb ceiling/.test(text)) {
            wrong.push(`${q} in balanced with ${JSON.stringify(input)}: plans a carb ceiling`);
          }
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('a confirmation hint shows only when that confirmation is the one reason left', () => {
    for (const input of everyInput()) {
      const gates = readinessGates(input);
      for (const feature of GATED_FEATURES) {
        const { reasons } = featureGateOf(gates, feature);
        const hint = confirmationHint(reasons);
        if (hint === null) continue;
        expect(reasons.length, `${feature}: ${reasons.join()}`).toBe(1);
        expect(claimsHold(hint, gates)).toEqual([]);
      }
    }
    expect(confirmationHint(['diabetes-medication'])).toBe(
      readiness.confirmationHints.prescriberAgreed,
    );
    expect(confirmationHint(['exercise-warning'])).toBe(
      readiness.confirmationHints.gpExerciseDiscussed,
    );
    expect(confirmationHint(['pregnant-or-breastfeeding', 'diabetes-medication'])).toBeNull();
    expect(confirmationHint(['under-18'])).toBeNull();
  });

  it('the variants are chosen by the gates: answer 4 never says fasting is allowed', () => {
    const input = (yes: readonly string[], prescriberAgreed = false): GateInput => ({
      answers: Object.fromEntries(
        READINESS_QUESTION_IDS.map((q) => [q, yes.includes(q) ? 'yes' : 'no']),
      ) as GateInput['answers'],
      confirmations: { prescriberAgreed, gpExerciseDiscussed: false },
      minimumAgeYears: 40,
      lowWeight: false,
    });
    const text = (q: (typeof READINESS_QUESTION_IDS)[number], i: GateInput) =>
      consequenceText(q, i, readinessGates(i), 'keto');
    expect(text('q4', input(['q3', 'q4', 'q5']))).toBe(readiness.ifYes.q4);
    expect(text('q3', input(['q3']))).toBe(readiness.ifYes.q3);
    expect(text('q3', input(['q3', 'q5']))).toBe(readiness.ifYesAlsoOff.q3);
    expect(text('q3', input(['q3'], true))).toBe(readiness.confirmed.prescriberAgreed);
    expect(text('q3', input(['q3', 'q5'], true))).toBe(readiness.confirmedAlsoOff.prescriberAgreed);
    expect(text('q1', input(['q1']))).toBe(readiness.ifYes.q1);
    expect(text('q1', input(['q1', 'q6']))).toBe(readiness.ifYesAlsoOff.q1);
    // F34: in Balanced mode answer 3 speaks of the smaller deficit only.
    const q3 = input(['q3']);
    expect(consequenceText('q3', q3, readinessGates(q3), 'balanced')).toBe(
      readiness.ifYesBalanced.q3,
    );
  });

  it('every feature-off line reads as one sentence: "… is off because …"', () => {
    for (const feature of GATED_FEATURES) {
      const line = featureOffText(feature, ['exercise-warning']);
      expect(line, feature).toMatch(/^[A-Z][^.]* is off because of what you told the app about /);
      // A plural name would read "… plans is off".
      expect(readiness.featureNames[feature], feature).not.toMatch(/s$/);
    }
    expect(featureOffText('exercisePlans', ['exercise-warning'])).toBe(
      'Exercise planning is off because of what you told the app about exercise warning signs.',
    );
  });
});
