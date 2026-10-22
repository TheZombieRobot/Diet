// The one entry point and its records adapter (item 21 design sections 3.9 and 6.1): WT-06,
// WT-07, HS-22, HS-25, RD-01 to RD-04, C06, C56, T3, T7, T27; U7, U8, U12, U20, U21, U25, U28.
// Synthetic records: a male fixture, 185 cm, born 1969, three 100 kg weigh-ins, a Kickstart
// started the day before, seen on 15 June 2000 in New Zealand time.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { FASTING_PRESETS } from '../fasting/eatingWindow';
import { readinessGates, gateInputFromRecords } from '../readiness/gates';
import { defaultProfile, defaultSettings, defaultTargets } from '../storage/defaults';
import { READINESS_QUESTION_IDS, READINESS_WORDING } from '../storage/readiness';
import type {
  CardStateRecord,
  KickstartCheckRecord,
  ProfileRecord,
  ReadinessRecord,
  TargetsRecord,
  WeightRecord,
} from '../storage/records';
import {
  type DayTargetRecords,
  type DayTargetsInput,
  dayTargets,
  dayTargetsFromRecords,
  type TargetsClock,
} from './dayTargets';
import { PRE_START_STOP_SIGN_CARD, preStartTrigger } from '../weight/preStart';
import { energyForMealChecks, plannerEnergyAim } from './energy';

const ZONE = 'Pacific/Auckland';
/** An instant from a New Zealand winter wall-clock time (UTC+12). */
const nz = (date: string, time: string) => new Date(`${date}T${time}:00+12:00`).toISOString();
const SETUP = nz('2000-06-01', '06:30');
const START = nz('2000-06-14', '07:30');
const clock: TargetsClock = {
  at: nz('2000-06-15', '09:00'),
  today: '2000-06-15',
  deviceZone: ZONE,
};

const weighIn = (date: string, kg: number, id: string): WeightRecord => ({
  id,
  at: nz(date, '07:00'),
  timeZone: ZONE,
  kg,
  source: 'manual',
  note: null,
});

const answers = (over: Partial<Record<string, 'yes' | 'no' | null>> = {}): ReadinessRecord[] =>
  READINESS_QUESTION_IDS.flatMap((q) => {
    const answer = q in over ? over[q] : 'no';
    return answer === null || answer === undefined
      ? []
      : [{ questionId: q, answer, wordingVersion: READINESS_WORDING[q], answeredAt: SETUP }];
  });

interface Over {
  readonly profile?: Partial<ProfileRecord>;
  readonly targets?: Partial<TargetsRecord>;
  readonly readiness?: readonly ReadinessRecord[];
  readonly checks?: readonly KickstartCheckRecord[];
  readonly weights?: readonly WeightRecord[];
  readonly cardStates?: readonly CardStateRecord[];
  readonly running?: boolean;
}

function records(over: Over = {}): DayTargetRecords {
  return {
    profile: {
      ...defaultProfile(SETUP),
      heightCm: 185,
      sex: 'male',
      birthYear: 1969,
      carbCeilingStartedAt: START,
      ...over.profile,
    },
    targets: { ...defaultTargets(SETUP), ...over.targets },
    settings: { ...defaultSettings(), homeTimeZone: ZONE },
    readiness: over.readiness ?? answers(),
    periods:
      over.running === false
        ? []
        : [
            {
              id: 'p1',
              startedAt: START,
              timeZone: ZONE,
              endedAt: null,
              endedTimeZone: null,
              endReason: null,
            },
          ],
    checks: over.checks ?? [],
    weights: over.weights ?? [
      weighIn('2000-06-13', 100, 'w1'),
      weighIn('2000-06-14', 100, 'w2'),
      weighIn('2000-06-15', 100, 'w3'),
    ],
    cardStates: over.cardStates ?? [],
  };
}

const view = (over: Over = {}) => dayTargetsFromRecords(records(over), clock);
const t = (over: Over = {}) => view(over).targets;

const stopSign: KickstartCheckRecord = {
  id: 'c1',
  periodId: 'p1',
  askedAt: nz('2000-06-15', '08:00'),
  timeZone: ZONE,
  dizzyOnStanding: 'no',
  palpitations: 'yes',
  crampsNotSettling: 'no',
  faintAtWork: 'no',
  energyRating: null,
  sleepRating: null,
  outcome: 'stop-sign',
};

describe('every figure for the day from one entry point', () => {
  it('WT-07, HS-09, U7: a running Kickstart plans 10,162 kJ, 140 g protein, 20 g net carbs and a 27 g budget', () => {
    expect(t()).toMatchObject({
      figures: 'kickstart',
      kickstartSuspended: null,
      estimate: { available: true, kj: 14_516, weight: { kg: 100, basis: 'seven-day-average' } },
      deficit: { pct: 30, basis: 'kickstart' },
      energy: { kind: 'target', targetKj: 10_162, clampedToFloor: false },
      protein: { checkTargetG: 140, basis: 'range-top' },
      netCarbs: { kind: 'ceiling', grams: 20, basis: 'kickstart' },
      saturatedFat: { kind: 'budget', grams: 27 },
      fibre: { grams: 30, source: 'nrv' },
      water: { ml: 2600, source: 'nrv' },
    });
  });

  it('WT-06, HS-25, U8: a 5,217 kJ guide plans the 5,000 kJ floor, with protein still at 140 g', () => {
    const input: DayTargetsInput = {
      today: '2000-06-15',
      gates: readinessGates(
        gateInputFromRecords({
          rows: answers(),
          birthYear: 1929,
          heightCm: 160,
          currentWeightKg: 55,
          today: '2000-06-15',
        }),
      ),
      kickstart: { running: true, periodId: 'p1', startedAt: START, stopSignReported: false },
      dietMode: 'keto',
      profile: {
        sex: 'female',
        heightCm: 160,
        birthYear: 1929,
        activityLevel: 'sedentary',
        carbCeilingStartedAt: START,
      },
      targets: defaultTargets(SETUP),
      weight: { kg: 55, basis: 'seven-day-average', date: '2000-06-15', at: null, timeZone: null },
    };
    expect(dayTargets(input)).toMatchObject({
      figures: 'kickstart',
      estimate: { kj: 5217 },
      energy: { targetKj: 5000, clampedToFloor: true, estimateBelowFloor: false },
      protein: { checkTargetG: 140 },
      fibre: { grams: 25 },
    });
  });

  it('T7, U21: each Kickstart condition taken away gives Steady figures at once, with its reason', () => {
    const steady = { figures: 'steady', deficit: { pct: 15, basis: 'steady' } };
    expect(t({ readiness: answers({ q3: 'yes' }) })).toMatchObject({
      ...steady,
      kickstartSuspended: 'readiness',
      netCarbs: { grams: 50, basis: 'keto-held-at-50' },
    });
    expect(t({ profile: { dietMode: 'balanced' } })).toMatchObject({
      ...steady,
      kickstartSuspended: 'diet-mode',
      netCarbs: { kind: 'none', basis: 'balanced' },
    });
    const later = new Date(Date.parse(START) + 1000).toISOString();
    expect(t({ profile: { carbCeilingStartedAt: later } })).toMatchObject({
      ...steady,
      kickstartSuspended: 'mode-changed',
      netCarbs: { grams: 30 },
    });
    expect(t({ profile: { carbCeilingStartedAt: null } })).toMatchObject({
      kickstartSuspended: 'mode-changed',
    });
    expect(t({ profile: { heightCm: null } })).toMatchObject({
      figures: 'steady',
      kickstartSuspended: 'no-estimate',
    });
    // A closed gate and balanced mode together report readiness first.
    expect(
      t({ readiness: answers({ q3: 'yes' }), profile: { dietMode: 'balanced' } })
        .kickstartSuspended,
    ).toBe('readiness');
    expect(t({ running: false })).toMatchObject({ figures: 'steady', kickstartSuspended: null });
  });

  it('T27: a stop-sign in the running period pauses the Kickstart figures: no deficit, own ceiling, protein at the bottom', () => {
    expect(t({ checks: [stopSign] })).toMatchObject({
      figures: 'steady',
      kickstartSuspended: 'stop-sign',
      deficit: { pct: 0, basis: 'none-stop-sign' },
      energy: { targetKj: 14_516 },
      netCarbs: { grams: 30, basis: 'keto' },
      protein: { checkTargetG: 120 },
    });
    expect(t({ checks: [{ ...stopSign, periodId: 'p0' }] }).figures).toBe('kickstart');
  });

  it('HEALTH_SAFETY section 2: a stop-sign "yes" outside a check, recorded or held for today, plans no deficit for the rest of that day', () => {
    const yes: CardStateRecord = {
      cardId: PRE_START_STOP_SIGN_CARD,
      trigger: preStartTrigger('2000-06-15'),
      firstShownAt: nz('2000-06-15', '08:00'),
      dismissedAt: null,
      dismissedTimeZone: null,
      doneAt: null,
    };
    const none = { pct: 0, basis: 'none-stop-sign' };
    expect(t({ running: false }).deficit.basis).toBe('steady');
    const recorded = view({ running: false, cardStates: [yes] });
    expect(recorded.stopSignToday).toBe(true);
    expect(recorded.targets.deficit).toEqual(none);
    const held = dayTargetsFromRecords(records({ running: false }), {
      ...clock,
      preStartHeld: '2000-06-15',
    });
    expect(held.targets.deficit).toEqual(none);
    // During a running Kickstart (an extension check that could not be saved) too.
    expect(t({ cardStates: [yes] }).deficit).toEqual(none);
    const nextDay = dayTargetsFromRecords(records({ running: false, cardStates: [yes] }), {
      ...clock,
      at: nz('2000-06-16', '09:00'),
      today: '2000-06-16',
    });
    expect(nextDay.targets.deficit.basis).toBe('steady');
  });

  it('W13: a period whose end is latched but not yet written reads as not running', () => {
    const latched = dayTargetsFromRecords(records(), {
      ...clock,
      endsPending: new Map([['p1', 'readiness-gated']]),
    });
    expect(latched.kickstart).toEqual({ running: false });
    expect(latched.targets.figures).toBe('steady');
  });
});

describe('readiness answers (RD-01 to RD-04, C06, C56, D30 override; U12, U25)', () => {
  it('U25: answer 5 yes or unanswered closes the keto ceiling; answer 3 alone holds 50 g and closes Kickstart', () => {
    for (const q5 of ['yes', null] as const) {
      expect(view({ readiness: answers({ q5 }) }).gates.ketoCeilingAvailable).toBe(false);
    }
    const q3 = view({ readiness: answers({ q3: 'yes' }) }).gates;
    expect([q3.carbCeilingBelow50Allowed, q3.kickstartAvailable]).toEqual([false, false]);
    expect(view({ readiness: answers({ q1: 'yes' }) }).gates.energyEstimateAvailable).toBe(false);
  });

  it('U12, RD-02: answer 2 with a Kickstart running and 30% stored plans at the guide, with no ceiling', () => {
    expect(t({ readiness: answers({ q2: 'yes' }) })).toMatchObject({
      figures: 'steady',
      kickstartSuspended: 'readiness',
      deficit: { pct: 0, basis: 'none-readiness' },
      energy: { targetKj: 14_516 },
      netCarbs: { kind: 'none', basis: 'readiness' },
    });
  });

  it('RD-01: under 18 there is no estimate, no energy figure, no budget and no ceiling', () => {
    expect(t({ readiness: answers({ q1: 'yes' }) })).toMatchObject({
      estimate: { available: false, reason: 'not-estimated' },
      energy: { kind: 'no-estimate', reason: 'not-estimated' },
      saturatedFat: { kind: 'none' },
      netCarbs: { kind: 'none' },
    });
    expect(view({ readiness: answers({ q1: 'yes' }) }).display.plainFigures).toBe(true);
  });
});

describe('no rough guide during a running Kickstart (C10, HS-18, HS-25, T3; U28)', () => {
  it.each([
    ['height cleared', { profile: { heightCm: null } }, 'missing-height'],
    ['every weigh-in removed', { weights: [] }, 'missing-weight'],
    [
      'one weigh-in of 380 kg this week',
      { weights: [weighIn('2000-06-15', 380, 'w9')] },
      'weight-out-of-range',
    ],
  ] as const)(
    '%s: no energy figure, no planner aim, no 20 g ceiling, protein 120',
    (_name, over, reason) => {
      const targets = t(over);
      expect(targets).toMatchObject({
        figures: 'steady',
        kickstartSuspended: 'no-estimate',
        energy: { kind: 'no-estimate', reason },
        netCarbs: { grams: 30 },
        protein: { checkTargetG: 120 },
      });
      expect(energyForMealChecks(targets.energy)).toBeNull();
      expect(plannerEnergyAim(targets.energy)).toEqual({ kind: 'none', reason: 'needs-guide' });
    },
  );
});

describe('the eating window never changes a target (HS-22; U20)', () => {
  it('every preset, custom windows, no preset, who chose it and the reflux choices give the same targets', () => {
    const reference = t();
    const windows = [
      ...FASTING_PRESETS.map((p) => ({ fastingPreset: p.id, eatingWindow: p.window })),
      { fastingPreset: 'custom' as const, eatingWindow: { start: '06:00', end: '07:00' } },
      { fastingPreset: 'custom' as const, eatingWindow: { start: '22:00', end: '02:00' } },
      { fastingPreset: null, eatingWindow: null },
    ];
    for (const window of windows) {
      for (const presetChosenBy of ['kickstart-default', 'default', 'user'] as const) {
        for (const reflux of [false, true]) {
          expect(
            t({
              targets: {
                ...window,
                presetChosenBy,
                refluxPreferEarlier: reflux,
                refluxPreferSplit: reflux,
              },
            }),
          ).toEqual(reference);
        }
      }
    }
    expectTypeOf<DayTargetsInput['targets']>().not.toHaveProperty('eatingWindow');
    expectTypeOf<DayTargetsInput['targets']>().not.toHaveProperty('fastingPreset');
  });
});
