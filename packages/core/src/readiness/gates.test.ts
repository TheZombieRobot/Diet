import { describe, expect, it } from 'vitest';
import type { YesNo } from '../storage/primitives';
import {
  KETO_CEILING_CLOSED_BY,
  READINESS_QUESTION_IDS,
  type ReadinessGates,
  type ReadinessQuestionId,
  READINESS_WORDING,
  readinessInputFromRows,
} from '../storage/readiness';
import type { KickstartPeriodRecord, ReadinessRecord } from '../storage/records';
import { kickstartEndNeeded } from '../weight/phase';
import {
  ageCrossCheck,
  featureGate,
  type GatedFeature,
  GATED_FEATURES,
  type GateEffectsContext,
  type GateInput,
  gateChangeEffects,
  gateInputFromRecords,
  isDeficitGroupReason,
  isGated,
  READINESS_REASON_IDS,
  READINESS_REASON_QUESTION,
  readinessGates,
  reasonStates,
  under18LiftYear,
} from './gates';

type Answer = YesNo | null;
type Answers = Record<ReadinessQuestionId, Answer>;

const ALL_NO: Answers = { q1: 'no', q2: 'no', q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no' };

function input(
  overrides: Partial<Answers> = {},
  more: Partial<Omit<GateInput, 'answers'>> = {},
): GateInput {
  return {
    answers: { ...ALL_NO, ...overrides },
    confirmations: { prescriberAgreed: false, gpExerciseDiscussed: false },
    minimumAgeYears: 40,
    lowWeight: false,
    ...more,
  };
}

const OPEN: Omit<ReadinessGates, 'reasons'> = {
  under18: false,
  fastingGated: false,
  kickstartAvailable: true,
  deficitAllowed: true,
  ketoCeilingAvailable: true,
  carbCeilingBelow50Allowed: true,
  projectionBandAvailable: true,
  goalSettingAvailable: true,
  energyEstimateAvailable: true,
  alcoholLoggingAvailable: true,
  exercisePlansAvailable: true,
  pharmacistReminder: false,
  bloodPressureSaltWording: false,
  alcoholHelpCardFromDayOne: false,
};

/** Everything closed by answers 1, 2 and 5 (the "no deficit" group), apart from the under-18 extras. */
const NO_DEFICIT = {
  fastingGated: true,
  kickstartAvailable: false,
  deficitAllowed: false,
  ketoCeilingAvailable: false,
  carbCeilingBelow50Allowed: false,
  projectionBandAvailable: false,
  goalSettingAvailable: false,
};

describe('readinessGates: one answer at a time (HEALTH_SAFETY section 1; storage spec 13.3)', () => {
  it('all no: nothing is closed and there is no reason', () => {
    expect(readinessGates(input())).toEqual({ ...OPEN, reasons: [] });
  });

  it('U1 RD-01: answer 1 closes fasting, keto, Kickstart, deficits, band, goals, the estimate and alcohol logging', () => {
    expect(readinessGates(input({ q1: 'yes' }))).toEqual({
      ...OPEN,
      ...NO_DEFICIT,
      under18: true,
      energyEstimateAvailable: false,
      alcoholLoggingAvailable: false,
      reasons: ['under-18'],
    });
  });

  it('U2 RD-01 / HS-32: a birth year that may be under 18 closes the same set, whatever answer 1 says (C24)', () => {
    const gates = readinessGates(input({}, { minimumAgeYears: 17 }));
    expect(gates.energyEstimateAvailable).toBe(false);
    expect(gates.goalSettingAvailable).toBe(false);
    expect(gates.alcoholLoggingAvailable).toBe(false);
    expect(gates).toEqual({
      ...readinessGates(input({ q1: 'yes' })),
      reasons: ['under-18-birth-year'],
    });
    expect(readinessGates(input({}, { minimumAgeYears: 18 }))).toEqual({ ...OPEN, reasons: [] });
    expect(readinessGates(input({}, { minimumAgeYears: null })).under18).toBe(false);
    expect(readinessGates(input({ q1: 'yes' }, { minimumAgeYears: null })).under18).toBe(true);
    // A stored birth year after this year gives a minimum age of 0, which gates (storage spec 4.4).
    expect(readinessGates(input({}, { minimumAgeYears: 0 })).under18).toBe(true);
  });

  it('U3 RD-02: answer 2 closes fasting, keto, Kickstart, deficits, band and goal setting (E48), not the estimate or alcohol', () => {
    expect(readinessGates(input({ q2: 'yes' }))).toEqual({
      ...OPEN,
      ...NO_DEFICIT,
      reasons: ['pregnant-or-breastfeeding'],
    });
  });

  it('U4 RD-03 / HS-03 / HS-33: answer 3 closes fasting, Kickstart and ceilings under 50 g until the prescriber agrees', () => {
    expect(readinessGates(input({ q3: 'yes' }))).toEqual({
      ...OPEN,
      fastingGated: true,
      kickstartAvailable: false,
      carbCeilingBelow50Allowed: false,
      reasons: ['diabetes-medication'],
    });
    const confirmed = input(
      { q3: 'yes' },
      { confirmations: { prescriberAgreed: true, gpExerciseDiscussed: false } },
    );
    expect(readinessGates(confirmed)).toEqual({ ...OPEN, reasons: [] });
  });

  it('U5 RD-04 / HS-32: answer 5 closes fasting, goals, Kickstart, deficits, band and the whole keto ceiling (D30)', () => {
    expect(readinessGates(input({ q5: 'yes' }))).toEqual({
      ...OPEN,
      ...NO_DEFICIT,
      reasons: ['eating-disorder-or-low-weight'],
    });
  });

  it('U5 RD-04: no gate exists for the weight log or its trend ("trend still visible")', () => {
    // A new gated feature must be added here, which forces a decision about what it hides.
    const hides = (feature: GatedFeature): string => {
      switch (feature) {
        case 'fasting':
        case 'kickstart':
        case 'deficit':
        case 'ketoCeiling':
        case 'carbCeilingBelow50':
        case 'projectionBand':
        case 'goalSetting':
        case 'energyEstimate':
        case 'exercisePlans':
          return 'a plan or target';
        case 'alcoholLogging':
          return 'the drinks log';
        default: {
          const never: never = feature;
          return never;
        }
      }
    };
    expect(GATED_FEATURES.map(hides)).not.toContain(undefined);
    const weightLike = GATED_FEATURES.filter(
      (f) => /weigh|trend|log/i.test(f) && f !== 'alcoholLogging',
    );
    expect(weightLike).toEqual([]);
  });

  it('U6 RD-05: answer 6 closes only exercise plans, until the GP discussion is confirmed', () => {
    expect(readinessGates(input({ q6: 'yes' }))).toEqual({
      ...OPEN,
      exercisePlansAvailable: false,
      reasons: ['exercise-warning'],
    });
    const confirmed = input(
      { q6: 'yes' },
      { confirmations: { prescriberAgreed: false, gpExerciseDiscussed: true } },
    );
    expect(readinessGates(confirmed).exercisePlansAvailable).toBe(true);
  });

  it('U7 RD-09: answer 4 closes nothing; it turns on the pharmacist reminder and the salt wording', () => {
    expect(readinessGates(input({ q4: 'yes' }))).toEqual({
      ...OPEN,
      pharmacistReminder: true,
      bloodPressureSaltWording: true,
      reasons: [],
    });
  });

  it('U8 AL-09 (core): answer 7 closes nothing; it shows the help card from day one', () => {
    expect(readinessGates(input({ q7: 'yes' }))).toEqual({
      ...OPEN,
      alcoholHelpCardFromDayOne: true,
      reasons: [],
    });
  });

  it('U9 HS-34 / HS-03: an unanswered question gives exactly the same result as a yes', () => {
    for (const q of READINESS_QUESTION_IDS) {
      expect(readinessGates(input({ [q]: null })), q).toEqual(
        readinessGates(input({ [q]: 'yes' })),
      );
    }
  });

  it('U11: anything but exactly "no" gates, and a lowWeight that is not exactly false gates', () => {
    for (const odd of ['No', '', undefined, 0, false, 'NO ']) {
      expect(isGated(odd)).toBe(true);
      const answers = { ...ALL_NO, q2: odd as unknown as Answer };
      expect(readinessGates(input({}, { answers } as Partial<GateInput>)).fastingGated).toBe(true);
    }
    expect(isGated('no')).toBe(false);
    const forced = input({}, { lowWeight: undefined as unknown as boolean });
    expect(readinessGates(forced).goalSettingAvailable).toBe(false);
  });

  it('the result and its reasons are frozen', () => {
    const gates = readinessGates(input({ q1: 'yes' }));
    expect(Object.isFrozen(gates)).toBe(true);
    expect(Object.isFrozen(gates.reasons)).toBe(true);
  });
});

/** The table of section 3.6, restated here without core helpers. */
function expected(i: GateInput): ReadinessGates {
  const yes = (a: Answer) => a !== 'no';
  const u18 = yes(i.answers.q1) || (i.minimumAgeYears !== null && i.minimumAgeYears < 18);
  const group = u18 || yes(i.answers.q2) || yes(i.answers.q5) || i.lowWeight;
  const d = yes(i.answers.q3) && !i.confirmations.prescriberAgreed;
  const e = yes(i.answers.q6) && !i.confirmations.gpExerciseDiscussed;
  const reasons: string[] = [];
  if (yes(i.answers.q1)) reasons.push('under-18');
  if (i.minimumAgeYears !== null && i.minimumAgeYears < 18) reasons.push('under-18-birth-year');
  if (yes(i.answers.q2)) reasons.push('pregnant-or-breastfeeding');
  if (d) reasons.push('diabetes-medication');
  if (yes(i.answers.q5)) reasons.push('eating-disorder-or-low-weight');
  if (i.lowWeight) reasons.push('low-current-weight');
  if (e) reasons.push('exercise-warning');
  return {
    under18: u18,
    fastingGated: group || d,
    kickstartAvailable: !group && !d,
    deficitAllowed: !group,
    ketoCeilingAvailable: !group,
    carbCeilingBelow50Allowed: !group && !d,
    projectionBandAvailable: !group,
    goalSettingAvailable: !group,
    energyEstimateAvailable: !u18,
    alcoholLoggingAvailable: !u18,
    exercisePlansAvailable: !e,
    pharmacistReminder: yes(i.answers.q4),
    bloodPressureSaltWording: yes(i.answers.q4),
    alcoholHelpCardFromDayOne: yes(i.answers.q7),
    reasons: reasons as ReadinessGates['reasons'],
  };
}

const CHOICES: readonly Answer[] = ['no', 'yes', null];
const AGES = [null, 0, 17, 18, 40] as const;

/** Every combination of section 7.1 U10: 3^7 answers × 4 confirmation pairs × 5 ages × 2 weights. */
function* everyInput(): Generator<GateInput> {
  for (let n = 0; n < 3 ** 7; n++) {
    const answers = {} as Answers;
    let rest = n;
    for (const q of READINESS_QUESTION_IDS) {
      answers[q] = CHOICES[rest % 3] ?? null;
      rest = Math.floor(rest / 3);
    }
    for (const prescriberAgreed of [false, true]) {
      for (const gpExerciseDiscussed of [false, true]) {
        for (const minimumAgeYears of AGES) {
          for (const lowWeight of [false, true]) {
            yield {
              answers,
              confirmations: { prescriberAgreed, gpExerciseDiscussed },
              minimumAgeYears,
              lowWeight,
            };
          }
        }
      }
    }
  }
}

const OPENING_KEYS = [
  'kickstartAvailable',
  'deficitAllowed',
  'ketoCeilingAvailable',
  'carbCeilingBelow50Allowed',
  'projectionBandAvailable',
  'goalSettingAvailable',
  'energyEstimateAvailable',
  'alcoholLoggingAvailable',
  'exercisePlansAvailable',
] as const;
const CLOSING_KEYS = [
  'under18',
  'fastingGated',
  'pharmacistReminder',
  'bloodPressureSaltWording',
  'alcoholHelpCardFromDayOne',
] as const;

/** True when `after` opens nothing that `before` had closed. */
function noLooser(before: ReadinessGates, after: ReadinessGates): boolean {
  return (
    OPENING_KEYS.every((k) => before[k] || !after[k]) &&
    CLOSING_KEYS.every((k) => !before[k] || after[k])
  );
}

describe('readinessGates over every combination (U10, U12)', () => {
  it('U10: every output equals the section 3.6 table; a yes, a missing answer or a low weight never opens anything', () => {
    let cases = 0;
    const failures: string[] = [];
    for (const i of everyInput()) {
      cases += 1;
      const gates = readinessGates(i);
      const want = expected(i);
      if (JSON.stringify(gates) !== JSON.stringify(want)) failures.push(JSON.stringify(i));
      for (const q of READINESS_QUESTION_IDS) {
        if (i.answers[q] !== 'no') continue;
        for (const worse of ['yes', null] as const) {
          const after = readinessGates({ ...i, answers: { ...i.answers, [q]: worse } });
          if (!noLooser(gates, after)) failures.push(`${q}→${String(worse)} ${JSON.stringify(i)}`);
        }
      }
      if (!i.lowWeight && !noLooser(gates, readinessGates({ ...i, lowWeight: true }))) {
        failures.push(`lowWeight ${JSON.stringify(i)}`);
      }
      if (failures.length > 5) break;
    }
    expect(failures).toEqual([]);
    expect(cases).toBe(87_480);
  }, 60_000);

  it('U10 (c): a confirmation only ever opens the gates of its own question', () => {
    const failures: string[] = [];
    for (const i of everyInput()) {
      if (i.confirmations.prescriberAgreed || i.confirmations.gpExerciseDiscussed) continue;
      const before = readinessGates(i);
      const withPrescriber = readinessGates({
        ...i,
        confirmations: { ...i.confirmations, prescriberAgreed: true },
      });
      const withGp = readinessGates({
        ...i,
        confirmations: { ...i.confirmations, gpExerciseDiscussed: true },
      });
      for (const key of [...OPENING_KEYS, ...CLOSING_KEYS]) {
        const own3 = ['fastingGated', 'kickstartAvailable', 'carbCeilingBelow50Allowed'];
        if (!own3.includes(key) && withPrescriber[key] !== before[key]) failures.push(`q3 ${key}`);
        if (key !== 'exercisePlansAvailable' && withGp[key] !== before[key])
          failures.push(`q6 ${key}`);
      }
      if (failures.length > 5) break;
    }
    expect(failures).toEqual([]);
  }, 60_000);

  it('U12: featureGate agrees with readinessGates for every input and feature, with reasons in order', () => {
    const field: Record<GatedFeature, (g: ReadinessGates) => boolean> = {
      fasting: (g) => !g.fastingGated,
      kickstart: (g) => g.kickstartAvailable,
      deficit: (g) => g.deficitAllowed,
      ketoCeiling: (g) => g.ketoCeilingAvailable,
      carbCeilingBelow50: (g) => g.carbCeilingBelow50Allowed,
      projectionBand: (g) => g.projectionBandAvailable,
      goalSetting: (g) => g.goalSettingAvailable,
      energyEstimate: (g) => g.energyEstimateAvailable,
      alcoholLogging: (g) => g.alcoholLoggingAvailable,
      exercisePlans: (g) => g.exercisePlansAvailable,
    };
    const order = (r: (typeof READINESS_REASON_IDS)[number]) => READINESS_REASON_IDS.indexOf(r);
    const inOrder = (reasons: readonly (typeof READINESS_REASON_IDS)[number][]) =>
      reasons.every((r, n) => n === 0 || order(reasons[n - 1] ?? r) < order(r));
    const failures: string[] = [];
    for (const i of everyInput()) {
      const gates = readinessGates(i);
      for (const feature of GATED_FEATURES) {
        const { available, reasons } = featureGate(i, feature);
        if (
          available !== field[feature](gates) ||
          available !== (reasons.length === 0) ||
          !inOrder(reasons)
        ) {
          failures.push(`${feature} ${JSON.stringify(i)}`);
        }
      }
      if (failures.length > 5) break;
    }
    expect(failures).toEqual([]);
  }, 60_000);

  it('U31: KETO_CEILING_CLOSED_BY names exactly the questions that close the keto ceiling, plus the two non-question closers', () => {
    for (const q of READINESS_QUESTION_IDS) {
      const closes = !readinessGates(input({ [q]: 'yes' })).ketoCeilingAvailable;
      expect(closes, q).toBe((KETO_CEILING_CLOSED_BY as readonly string[]).includes(q));
    }
    expect(readinessGates(input({}, { minimumAgeYears: 17 })).ketoCeilingAvailable).toBe(false);
    expect(readinessGates(input({}, { lowWeight: true })).ketoCeilingAvailable).toBe(false);
  });
});

const T1 = '2000-01-01T00:00:00.000Z';
const T2 = '2000-02-01T00:00:00.000Z';
const row = (
  questionId: ReadinessRecord['questionId'],
  answer: YesNo,
  answeredAt: string,
  wordingVersion = 1,
): ReadinessRecord => ({ questionId, answer, wordingVersion, answeredAt });
const allNoRows = (at = T1): ReadinessRecord[] =>
  READINESS_QUESTION_IDS.map((q) => row(q, 'no', at));

describe('gateInputFromRecords (U13, U32)', () => {
  const build = (
    rows: ReadinessRecord[],
    weight: number | null = 90,
    height: number | null = 175,
  ) =>
    gateInputFromRecords({
      rows,
      birthYear: 1970,
      heightCm: height,
      currentWeightKg: weight,
      today: '2000-03-01',
    });

  it('U13 D29: a prescriber agreement older than the latest answer 3 does not count; a newer one does', () => {
    const q3 = (at: string) => [
      ...allNoRows().filter((r) => r.questionId !== 'q3'),
      row('q3', 'yes', at),
    ];
    const stale = build([...q3(T2), row('prescriberAgreed', 'yes', T1)]);
    expect(readinessGates(stale).fastingGated).toBe(true);
    const fresh = build([...q3(T1), row('prescriberAgreed', 'yes', T2)]);
    expect(readinessGates(fresh).fastingGated).toBe(false);
  });

  it('U13: a row under an older wording counts as unanswered and gates', () => {
    const rows = allNoRows();
    const input2 = gateInputFromRecords({
      rows,
      birthYear: 1970,
      heightCm: 175,
      currentWeightKg: 90,
      today: '2000-03-01',
    });
    expect(readinessGates(input2).fastingGated).toBe(false);
    const reworded = readinessInputFromRows(rows, 1970, '2000-03-01', {
      ...READINESS_WORDING,
      q2: 2,
    });
    expect(readinessGates({ ...reworded, lowWeight: false }).fastingGated).toBe(true);
  });

  it('U32 HS-35: lowWeight comes from the weight and height; with answer 5 "no" it gates exactly like a yes', () => {
    expect(build(allNoRows(), 56.6).lowWeight).toBe(true);
    expect(build(allNoRows(), 56.7).lowWeight).toBe(false);
    expect(build(allNoRows(), null).lowWeight).toBe(false);
    expect(build(allNoRows(), 60, null).lowWeight).toBe(false);
    const low = readinessGates(input({}, { lowWeight: true }));
    const answered = readinessGates(input({ q5: 'yes' }));
    expect({ ...low, reasons: [] }).toEqual({ ...answered, reasons: [] });
    expect(low.reasons).toEqual(['low-current-weight']);
  });
});

describe('age cross-check (U14; C24 point 3)', () => {
  it('three outcomes, and the year the under-18 settings lift', () => {
    expect(ageCrossCheck('no', 17)).toBe('birth-year-under-18');
    expect(ageCrossCheck('yes', 18)).toBe('answered-under-18-adult-birth-year');
    expect(ageCrossCheck('no', 18)).toBe('consistent');
    expect(ageCrossCheck('yes', 17)).toBe('consistent');
    expect(ageCrossCheck(null, null)).toBe('consistent');
    expect(under18LiftYear(1982)).toBe(2001);
    expect(() => under18LiftYear(1982.5)).toThrow(RangeError);
    // Born 1981, on 1 March 2000: at least 18, so answer 1 "no" is consistent.
    const age = readinessInputFromRows([], 1981, '2000-03-01').minimumAgeYears;
    expect(age).toBe(18);
    expect(ageCrossCheck('no', age)).toBe('consistent');
  });
});

describe('gateChangeEffects (U15; E17, E52, E65)', () => {
  const open = readinessGates(input());
  const ctx = (over: Partial<GateEffectsContext> = {}): GateEffectsContext => ({
    onboardingCompleted: true,
    dietMode: 'keto',
    firstLowCarbAt: T1,
    q3YesWritten: false,
    kickstartOptIn: false,
    targets: { fastingPreset: null, presetChosenBy: null },
    ...over,
  });
  const closedBy2 = readinessGates(input({ q2: 'yes' }));

  it('a running or not yet started Kickstart ends when Kickstart closes, and only then, by one rule (item 14 kickstartEndNeeded)', () => {
    // Day 1 is 1 March 2000 in Auckland; 21 days run to 21 March.
    const period: KickstartPeriodRecord = {
      id: 'period-1',
      startedAt: '2000-03-01T00:00:00.000Z',
      timeZone: 'Pacific/Auckland',
      endedAt: null,
      endedTimeZone: null,
      endReason: null,
    };
    const endAt = (now: string, today: string, gates: ReadinessGates) =>
      kickstartEndNeeded({
        now,
        today,
        deviceTimeZone: 'Pacific/Auckland',
        homeTimeZone: 'Pacific/Auckland',
        dietMode: 'keto',
        carbCeilingStartedAt: period.startedAt,
        gates,
        periods: [period],
        checks: [],
      });
    const running = ['2000-03-05T00:00:00.000Z', '2000-03-05'] as const;
    const notStarted = ['2000-02-28T00:00:00.000Z', '2000-02-28'] as const;
    const over = ['2000-03-25T00:00:00.000Z', '2000-03-25'] as const;
    expect(endAt(...running, closedBy2)).toBe('readiness-gated');
    expect(endAt(...notStarted, closedBy2)).toBe('readiness-gated');
    expect(endAt(...running, open)).toBeNull();
    expect(endAt(...over, closedBy2)).toBeNull();
    // The gate effects carry no second end rule of their own.
    expect(Object.keys(gateChangeEffects(open, closedBy2, ctx()))).not.toContain('endKickstart');
  });

  it('the carb-ceiling clock restarts when the keto ceiling reopens in keto mode after setup only', () => {
    expect(gateChangeEffects(closedBy2, open, ctx()).restartCarbCeilingClock).toBe(true);
    expect(
      gateChangeEffects(closedBy2, open, ctx({ onboardingCompleted: false }))
        .restartCarbCeilingClock,
    ).toBe(false);
    expect(
      gateChangeEffects(closedBy2, open, ctx({ dietMode: 'balanced' })).restartCarbCeilingClock,
    ).toBe(false);
    expect(gateChangeEffects(open, open, ctx()).restartCarbCeilingClock).toBe(false);
  });

  it('firstLowCarbAt is set once, never in balanced mode or while the ceiling is closed', () => {
    expect(gateChangeEffects(closedBy2, open, ctx({ firstLowCarbAt: null })).setFirstLowCarb).toBe(
      true,
    );
    expect(gateChangeEffects(closedBy2, open, ctx()).setFirstLowCarb).toBe(false);
    expect(
      gateChangeEffects(closedBy2, closedBy2, ctx({ firstLowCarbAt: null })).setFirstLowCarb,
    ).toBe(false);
    expect(
      gateChangeEffects(closedBy2, open, ctx({ firstLowCarbAt: null, dietMode: 'balanced' }))
        .setFirstLowCarb,
    ).toBe(false);
  });

  it('a Q3 "yes" write turns the Kickstart choice off, during and after setup; a Q4 write does not (C06, D31)', () => {
    const q3 = readinessGates(input({ q3: 'yes' }));
    for (const onboardingCompleted of [false, true]) {
      expect(
        gateChangeEffects(
          open,
          q3,
          ctx({ onboardingCompleted, q3YesWritten: true, kickstartOptIn: true }),
        ).clearKickstartOptIn,
      ).toBe(true);
    }
    const q4 = readinessGates(input({ q4: 'yes' }));
    expect(gateChangeEffects(open, q4, ctx({ kickstartOptIn: true })).clearKickstartOptIn).toBe(
      false,
    );
  });

  it('during setup a stored 23:1 is cleared when answer 5 turns yes; after setup it is kept (C07)', () => {
    const q5 = readinessGates(input({ q5: 'yes' }));
    const targets = { fastingPreset: '23:1', presetChosenBy: 'kickstart-default' } as const;
    expect(
      gateChangeEffects(open, q5, ctx({ onboardingCompleted: false, targets })).resetSetupSchedule,
    ).toBe(true);
    expect(gateChangeEffects(open, q5, ctx({ targets })).resetSetupSchedule).toBe(false);
  });

  it('during setup a default the app chose is cleared when answer 4 turns yes; a pattern the owner chose is kept (C07, E49)', () => {
    const q4 = readinessGates(input({ q4: 'yes' }));
    const during = { onboardingCompleted: false, kickstartOptIn: true };
    const kickstartDefault = {
      fastingPreset: '23:1',
      presetChosenBy: 'kickstart-default',
    } as const;
    const user = { fastingPreset: '23:1', presetChosenBy: 'user' } as const;
    expect(
      gateChangeEffects(open, q4, ctx({ ...during, targets: kickstartDefault })).resetSetupSchedule,
    ).toBe(true);
    expect(
      gateChangeEffects(open, open, ctx({ ...during, targets: kickstartDefault }))
        .resetSetupSchedule,
    ).toBe(false);
    expect(gateChangeEffects(open, q4, ctx({ ...during, targets: user })).resetSetupSchedule).toBe(
      false,
    );
  });
});

describe('reasonStates: stated and unanswered fasting reasons (item 15; HS-03, FS-08, C41, C54)', () => {
  const fasting = (i: GateInput) => reasonStates(i, featureGate(i, 'fasting').reasons);

  it('before any answer, every fasting reason is unanswered, so none is put as a fact', () => {
    const none = input({ q1: null, q2: null, q3: null, q4: null, q5: null, q6: null, q7: null });
    expect(fasting(none)).toEqual({
      stated: [],
      unanswered: [
        'under-18',
        'pregnant-or-breastfeeding',
        'diabetes-medication',
        'eating-disorder-or-low-weight',
      ],
    });
  });

  it('a yes, a birth year under 18 and a low current weight are stated; only the deficit group is quiet', () => {
    expect(fasting(input({ q2: 'yes' })).stated).toEqual(['pregnant-or-breastfeeding']);
    expect(fasting(input({}, { minimumAgeYears: 17 })).stated).toEqual(['under-18-birth-year']);
    expect(fasting(input({}, { lowWeight: true })).stated).toEqual(['low-current-weight']);
    expect(fasting(input({ q3: 'yes' })).stated).toEqual(['diabetes-medication']);
    expect(isDeficitGroupReason('diabetes-medication')).toBe(false);
    expect(isDeficitGroupReason('exercise-warning')).toBe(false);
    for (const reason of [
      'under-18',
      'under-18-birth-year',
      'pregnant-or-breastfeeding',
    ] as const) {
      expect(isDeficitGroupReason(reason), reason).toBe(true);
    }
  });

  it('over every combination: the two lists split featureGate exactly, and are empty exactly when fasting is open', () => {
    const failures: string[] = [];
    for (const i of everyInput()) {
      const reasons = featureGate(i, 'fasting').reasons;
      const { stated, unanswered } = reasonStates(i, reasons);
      const split = reasons.every((r) => stated.includes(r) !== unanswered.includes(r));
      const sizes = stated.length + unanswered.length === reasons.length;
      const open = (reasons.length === 0) === !readinessGates(i).fastingGated;
      const asked = unanswered.every((r) => {
        const question = READINESS_REASON_QUESTION[r];
        return question !== null && i.answers[question] === null;
      });
      if (!split || !sizes || !open || !asked) failures.push(JSON.stringify(i));
      if (failures.length > 5) break;
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
