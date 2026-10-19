import { describe, expect, it } from 'vitest';
import { move, readiness } from '../copy/health';
import type { PreCheck, SessionRecord } from '../storage/records';
import type { ReadinessGates } from '../storage/readiness';
import type { DietMode } from '../storage/records';
import { getExerciseData } from './dataset';
import { exerciseById, templateById } from './lookup';
import { planSession, type PlanContext } from './plan';
import {
  PRE_CHECK_KEYS,
  type PreCheckContext,
  type PreCheckOutcome,
  preCheckOutcome,
} from './preCheck';
import { beachPromptLines, isBeachTemplate } from './safety';
import { painFreeOnlyExercises, sessionStartGate } from './start';
import { ALL_NO, check, movement, session } from './testSessions';
import type { IsoWeekday } from '../util/time';
import type { Exercise, SessionTemplate } from './types';
import { nextVariantFor, sessionVariants } from './variants';
import { type ResolvedWeek, resolveWeeklyPattern } from './week';

const data = getExerciseData();
const TOGGLES = [
  { bands: false, dumbbells: false },
  { bands: true, dumbbells: false },
  { bands: false, dumbbells: true },
  { bands: true, dumbbells: true },
];
const BODYWEIGHT = TOGGLES[0] ?? { bands: false, dumbbells: false };

function get<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Missing ${what}`);
  return value;
}
const template = (id: string): SessionTemplate => get(templateById(data, id), id);
const exercise = (id: string): Exercise => get(exerciseById(data, id), id);

describe('the pre-session check (HS-29)', () => {
  const CALM: PreCheckContext = {
    fastingNow: false,
    recentStopSign: false,
    fastOverCeiling: false,
  };
  it.each<[string, PreCheck, Partial<PreCheckContext>, PreCheckOutcome]>([
    [
      'all no',
      ALL_NO,
      {},
      { choices: ['planned', 'lighter', 'rest'], dropPainFreeOnly: false, notes: ['allNo'] },
    ],
    [
      'all no while fasting',
      ALL_NO,
      { fastingNow: true },
      {
        choices: ['lighter', 'planned', 'rest'],
        dropPainFreeOnly: false,
        notes: ['allNo', 'fasted'],
      },
    ],
    [
      'pain or injury',
      check('painOrInjury'),
      {},
      { choices: ['rest', 'lighter'], dropPainFreeOnly: true, notes: ['anyYes', 'painFirst'] },
    ],
    [
      'back or leg symptoms',
      check('backOrLegSymptoms'),
      {},
      { choices: ['rest', 'lighter'], dropPainFreeOnly: true, notes: ['anyYes', 'painFirst'] },
    ],
    [
      'a hot day',
      check('heatOrSun'),
      {},
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['anyYes'] },
    ],
    [
      'a hot day while fasting',
      check('heatOrSun'),
      { fastingNow: true },
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['anyYes', 'fasted'] },
    ],
    [
      'a heavy work day',
      check('heavyWorkDay'),
      {},
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['anyYes', 'heavyWork'] },
    ],
    [
      'an answer that is not a stored one counts as yes',
      { ...ALL_NO, notHydrated: 'maybe' as unknown as 'no' },
      {},
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['anyYes'] },
    ],
    [
      'ruling 9: all no after a recent Kickstart stop sign',
      ALL_NO,
      { recentStopSign: true },
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['recentStopSign'] },
    ],
    [
      'ruling 9: all no with a fast past 24 hours: no fasted note',
      ALL_NO,
      { fastOverCeiling: true, fastingNow: true },
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['overCeiling'] },
    ],
    [
      'ruling 9: pain after a recent stop sign keeps rest first',
      check('painOrInjury'),
      { recentStopSign: true },
      {
        choices: ['rest', 'lighter'],
        dropPainFreeOnly: true,
        notes: ['recentStopSign', 'anyYes', 'painFirst'],
      },
    ],
    [
      'ruling 9: a stop-sign value that is not exactly false counts',
      ALL_NO,
      { recentStopSign: undefined as unknown as boolean },
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['recentStopSign'] },
    ],
  ])('%s', (_label, answers, ctx, outcome) => {
    expect(preCheckOutcome(answers, { ...CALM, ...ctx })).toEqual(outcome);
  });

  it('HS-29: every one of the 63 answers with a yes offers only the lighter session or rest', () => {
    for (let mask = 1; mask < 2 ** PRE_CHECK_KEYS.length; mask++) {
      const answers = check(...PRE_CHECK_KEYS.filter((_, bit) => (mask >> bit) & 1));
      for (const fastingNow of [false, true]) {
        const { choices } = preCheckOutcome(answers, { ...CALM, fastingNow });
        expect(choices).not.toContain('planned');
        expect(choices).toContain('rest');
      }
    }
  });

  it('C112, bodyweight default, HS-29: equipment versions need their toggle, and a lighter session offers only easier', () => {
    const offering = (key: 'band' | 'dumbbell', toggles: (typeof TOGGLES)[number]) =>
      data.exercises
        .filter((e) => sessionVariants(e, toggles, 'planned').includes(key))
        .map((e) => e.id);
    for (const e of data.exercises) {
      expect(sessionVariants(e, BODYWEIGHT, 'planned')).not.toContain('band');
      expect(sessionVariants(e, BODYWEIGHT, 'planned')).not.toContain('dumbbell');
    }
    expect(sessionVariants(exercise('seed:ex-band-pull-apart'), BODYWEIGHT, 'planned')).toEqual([]);
    expect(offering('band', { bands: true, dumbbells: false })).toEqual(['seed:ex-row']);
    expect(offering('dumbbell', { bands: false, dumbbells: true })).toEqual([
      'seed:ex-pike-push-up',
      'seed:ex-row',
    ]);
    for (const e of data.exercises) {
      expect(sessionVariants(e, { bands: true, dumbbells: true }, 'lighter'), e.id).toEqual([
        'easier',
      ]);
    }
    expect(nextVariantFor(exercise('seed:ex-hip-hinge'), 'standard')).toBeNull();
    expect(nextVariantFor(exercise('seed:ex-squat'), 'standard')).toBe('harder');
  });
});

describe('planning a session (HS-29)', () => {
  const week = resolveWeeklyPattern(data, null, { jogUnlocked: false });
  const plan = (id: string, ctx: Partial<PlanContext>) =>
    planSession(data, template(id), {
      preCheck: ALL_NO,
      choice: 'planned',
      equipment: BODYWEIGHT,
      sessions: [],
      week,
      today: '2000-01-21',
      sessionId: null,
      variantOverrides: new Map(),
      ...ctx,
    });
  const fixedBlocks = (p: ReturnType<typeof plan>) => p.movements.filter((m) => m.block !== 'main');

  it('HS-29: after any one yes, asking for the planned session with harder and dumbbell overrides, both toggles and a top-of-range history still gives the lighter session', () => {
    const both = { bands: true, dumbbells: true };
    for (const t of data.templates.filter((x) => x.kind === 'strength')) {
      // Last week: two sessions at the top of every range, at the easier versions.
      const history = [1, 2].map((n) =>
        session(n, {
          date: `2000-01-1${n + 1}`,
          templateId: t.id,
          movements: t.main.map((s) =>
            movement(s.exerciseId, 'easier', Array<number>(s.sets).fill(s.max), {
              unit: exercise(s.exerciseId).unit,
            }),
          ),
        }),
      );
      const overrides = new Map(
        t.main.map(
          (s) => [s.exerciseId, s.exerciseId === 'seed:ex-row' ? 'dumbbell' : 'harder'] as const,
        ),
      );
      for (const key of PRE_CHECK_KEYS) {
        const p = plan(t.id, {
          preCheck: check(key),
          equipment: both,
          sessions: history,
          variantOverrides: overrides,
        });
        expect(p.mode).toBe('lighter');
        for (const m of p.movements.filter((x) => x.block === 'main')) {
          const slot = get(
            t.main.find((x) => x.exerciseId === m.exerciseId),
            m.exerciseId,
          );
          const label = `${t.id} ${key} ${m.exerciseId}`;
          expect(m.variant, label).toBe('easier');
          expect(m.perSet, label).toEqual(Array<number>(slot.sets - 1).fill(slot.min));
          expect(m.dose?.next, label).toBeNull();
        }
      }
    }
    const lighter = plan('seed:session-b', { preCheck: check('heatOrSun') });
    expect(fixedBlocks(lighter)).toEqual(fixedBlocks(plan('seed:session-b', {})));
  });

  it.each(['painOrInjury', 'backOrLegSymptoms'] as const)(
    'with %s, the hip hinge is left out',
    (key) => {
      const ids = plan('seed:session-b', { preCheck: check(key) }).movements.map(
        (m) => m.exerciseId,
      );
      expect(ids).not.toContain('seed:ex-hip-hinge');
      expect(plan('seed:session-b', {}).movements.map((m) => m.exerciseId)).toContain(
        'seed:ex-hip-hinge',
      );
    },
  );

  it('a pain answer earlier today keeps the day lighter and the hinge out, whatever a new check says', () => {
    const restedWithPain = session(1, {
      date: '2000-01-21',
      templateId: 'seed:session-b',
      status: 'rested',
      preCheck: check('painOrInjury'),
    });
    const p = plan('seed:session-b', { sessions: [restedWithPain] });
    expect(p.mode).toBe('lighter');
    expect(p.movements.map((m) => m.exerciseId)).not.toContain('seed:ex-hip-hinge');
  });

  it('keeps the version last used, and ignores a version the switch does not offer', () => {
    const history: SessionRecord[] = [
      session(1, {
        date: '2000-01-11',
        templateId: 'seed:session-a',
        movements: [
          movement('seed:ex-squat', 'harder', [8, 8]),
          movement('seed:ex-row', 'band', [8, 8]),
        ],
      }),
    ];
    const planned = plan('seed:session-a', {
      today: '2000-01-18',
      sessions: history,
      variantOverrides: new Map([['seed:ex-row', 'dumbbell' as const]]),
    });
    const variantOf = (id: string) => planned.movements.find((m) => m.exerciseId === id)?.variant;
    expect(variantOf('seed:ex-squat')).toBe('harder');
    expect(variantOf('seed:ex-row')).toBe('standard');
  });

  describe('re-planning a row (C76, EX-03)', () => {
    const lastWeek = session(1, {
      date: '2000-01-11',
      templateId: 'seed:session-a',
      movements: [movement('seed:ex-squat', 'standard', [8, 8])],
    });
    const squat = (p: ReturnType<typeof plan>) =>
      get(
        p.movements.find((m) => m.exerciseId === 'seed:ex-squat'),
        'squat',
      );
    const tuesday = { today: '2000-01-18', sessions: [lastWeek] };

    it('a version switch after one ticked set of 9 keeps the session within the 17 of the caps', () => {
      expect(squat(plan('seed:session-a', tuesday)).perSet).toEqual([9, 8]);
      const today = session(2, {
        date: '2000-01-18',
        templateId: 'seed:session-a',
        status: 'planned',
        movements: [movement('seed:ex-squat', 'standard', [9])],
      });
      const switched = squat(
        plan('seed:session-a', {
          ...tuesday,
          sessions: [lastWeek, today],
          sessionId: today.id,
          variantOverrides: new Map([['seed:ex-squat', 'easier' as const]]),
        }),
      );
      expect(switched.variant).toBe('easier');
      expect(9 + switched.perSet.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(17);
    });

    it('an id that is not a row of today for this session leaves the history whole', () => {
      expect(squat(plan('seed:session-a', { ...tuesday, sessionId: lastWeek.id })).perSet).toEqual([
        9, 8,
      ]);
    });
  });
});

describe('before Start: stop signs on every path, beach prompts on beach sessions', () => {
  it('HS-28: through the start gate, every session on every equipment setting, new or resumed, shows the stop signs first and the check last', () => {
    const today = '2000-01-19';
    for (const t of data.templates) {
      const onlyToday: ResolvedWeek = {
        days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday: weekday as IsoWeekday,
          templateIds: weekday === 3 ? [t.id] : [],
        })),
        source: 'stored',
        jogShownAsWalk: false,
        problems: [],
      };
      const resumed = session(1, { date: today, templateId: t.id, status: 'planned' });
      for (const toggles of TOGGLES) {
        for (const sessionId of [null, resumed.id]) {
          const gate = sessionStartGate(data, {
            gates: { exercisePlansAvailable: true },
            templateId: t.id,
            today,
            week: onlyToday,
            jogUnlocked: true,
            sessions: [resumed],
            equipment: toggles,
            sessionId,
          });
          const label = `${t.id} ${JSON.stringify(toggles)} ${sessionId ?? 'new'}`;
          expect(gate.kind, label).toBe('ready');
          const steps = gate.kind === 'ready' ? gate.steps : [];
          expect(steps[0], label).toBe('stopRules');
          expect(steps.at(-1), label).toBe('preCheck');
          expect(steps.indexOf('beachPrompts'), label).toBe(t.kind === 'strength' ? -1 : 1);
          expect(steps.includes('painFreeOnly'), label).toBe(
            painFreeOnlyExercises(data, t, toggles).length > 0,
          );
        }
      }
    }
    expect(
      data.templates.map((t) => painFreeOnlyExercises(data, t, BODYWEIGHT).map((e) => e.name)),
    ).toEqual([[], ['Hip hinge to a box'], [], [], []]);
  });

  it('HS-12, EX-02: a session is a beach session by its tags or by any beach movement in it', () => {
    expect(data.templates.filter((t) => isBeachTemplate(data, t)).map((t) => t.id)).toEqual([
      'seed:session-beach-walk',
      'seed:session-beach-jog',
    ]);
    const walkSlot = get(template('seed:session-beach-walk').main[0], 'walk slot');
    const handMade = {
      ...template('seed:session-a'),
      main: [...template('seed:session-a').main, walkSlot],
    };
    expect(isBeachTemplate(data, handMade)).toBe(true);
  });

  const { items, electrolytes } = move.safety.beachPrompts;
  const salt = readiness.bloodPressure.electrolyte;
  it.each<
    [
      string,
      DietMode,
      Pick<ReadinessGates, 'ketoCeilingAvailable' | 'bloodPressureSaltWording'>,
      string[],
    ]
  >([
    [
      'keto with the keto ceiling available',
      'keto',
      { ketoCeilingAvailable: true, bloodPressureSaltWording: false },
      [electrolytes],
    ],
    [
      'keto with the keto ceiling switched off (answer 2, 5 or unanswered)',
      'keto',
      { ketoCeilingAvailable: false, bloodPressureSaltWording: true },
      [],
    ],
    [
      'keto with the ceiling and answer 4 (C102)',
      'keto',
      { ketoCeilingAvailable: true, bloodPressureSaltWording: true },
      [electrolytes, salt],
    ],
    [
      'keto with the ceiling and an answer-4 flag that is not exactly false (C102)',
      'keto',
      {
        ketoCeilingAvailable: true,
        bloodPressureSaltWording: undefined as unknown as boolean,
      },
      [electrolytes, salt],
    ],
    [
      'moderate low-carb',
      'moderate-low-carb',
      { ketoCeilingAvailable: true, bloodPressureSaltWording: true },
      [],
    ],
  ])('beach prompts: %s', (_label, dietMode, gates, extra) => {
    expect(beachPromptLines({ dietMode, gates })).toEqual([
      ...items.slice(0, 4),
      ...extra,
      ...items.slice(4),
    ]);
  });
});
