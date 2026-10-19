import { describe, expect, it } from 'vitest';
import { move, readiness } from '../copy/health';
import type { PreCheck, SessionRecord } from '../storage/records';
import type { ReadinessGates } from '../storage/readiness';
import type { DietMode } from '../storage/records';
import { getExerciseData } from './dataset';
import { exerciseById, templateById } from './lookup';
import { planSession, type PlanContext } from './plan';
import { PRE_CHECK_KEYS, type PreCheckOutcome, preCheckOutcome } from './preCheck';
import { beachPromptLines, isBeachTemplate } from './safety';
import { beforeStartSteps } from './start';
import { ALL_NO, check, movement, session } from './testSessions';
import type { Exercise, SessionTemplate } from './types';
import { nextVariantFor, sessionVariants } from './variants';
import { resolveWeeklyPattern } from './week';

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
  it.each<[string, PreCheck, boolean, PreCheckOutcome]>([
    [
      'all no',
      ALL_NO,
      false,
      { choices: ['planned', 'lighter', 'rest'], dropPainFreeOnly: false, notes: ['allNo'] },
    ],
    [
      'all no while fasting',
      ALL_NO,
      true,
      {
        choices: ['lighter', 'planned', 'rest'],
        dropPainFreeOnly: false,
        notes: ['allNo', 'fasted'],
      },
    ],
    [
      'pain or injury',
      check('painOrInjury'),
      false,
      { choices: ['rest', 'lighter'], dropPainFreeOnly: true, notes: ['anyYes', 'painFirst'] },
    ],
    [
      'back or leg symptoms',
      check('backOrLegSymptoms'),
      false,
      { choices: ['rest', 'lighter'], dropPainFreeOnly: true, notes: ['anyYes', 'painFirst'] },
    ],
    [
      'a hot day',
      check('heatOrSun'),
      false,
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['anyYes'] },
    ],
    [
      'a heavy work day',
      check('heavyWorkDay'),
      false,
      { choices: ['lighter', 'rest'], dropPainFreeOnly: false, notes: ['anyYes', 'heavyWork'] },
    ],
  ])('%s', (_label, answers, fastingNow, outcome) => {
    expect(preCheckOutcome(answers, { fastingNow })).toEqual(outcome);
  });

  it('HS-29: every one of the 63 answers with a yes offers only the lighter session or rest', () => {
    for (let mask = 1; mask < 2 ** PRE_CHECK_KEYS.length; mask++) {
      const answers = check(...PRE_CHECK_KEYS.filter((_, bit) => (mask >> bit) & 1));
      for (const fastingNow of [false, true]) {
        const { choices } = preCheckOutcome(answers, { fastingNow });
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

  it('after a yes, asking for the planned session still gives the lighter one, warm-up and cool-down kept', () => {
    const lighter = plan('seed:session-b', { preCheck: check('heatOrSun'), choice: 'planned' });
    expect(lighter.mode).toBe('lighter');
    const main = lighter.movements.filter((m) => m.block === 'main');
    expect(main.length).toBe(template('seed:session-b').main.length);
    for (const m of main) {
      const slot = get(
        template('seed:session-b').main.find((s) => s.exerciseId === m.exerciseId),
        m.exerciseId,
      );
      expect(m.variant).toBe('easier');
      expect(m.perSet).toEqual(Array<number>(slot.sets - 1).fill(slot.min));
    }
    expect(fixedBlocks(lighter)).toEqual(fixedBlocks(plan('seed:session-b', {})));
  });

  it('with pain, the hip hinge is left out', () => {
    const ids = plan('seed:session-b', { preCheck: check('painOrInjury') }).movements.map(
      (m) => m.exerciseId,
    );
    expect(ids).not.toContain('seed:ex-hip-hinge');
    expect(plan('seed:session-b', {}).movements.map((m) => m.exerciseId)).toContain(
      'seed:ex-hip-hinge',
    );
  });

  it('keeps the version last used, and ignores a version the switch does not offer', () => {
    const history: SessionRecord[] = [
      session(1, {
        date: '2000-01-11',
        templateId: 'seed:session-a',
        movements: [movement('seed:ex-squat', 'harder', [8, 8])],
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
});

describe('before Start: stop signs on every path, beach prompts on beach sessions', () => {
  it('HS-28: the stop signs come first and the check last, for every session and every equipment setting', () => {
    for (const t of data.templates) {
      for (const toggles of TOGGLES) {
        const steps = beforeStartSteps(data, t, toggles);
        expect(steps[0], t.id).toBe('stopRules');
        expect(steps.at(-1), t.id).toBe('preCheck');
      }
    }
    expect(beforeStartSteps(data, template('seed:session-b'), BODYWEIGHT)).toContain(
      'painFreeOnly',
    );
    for (const id of ['seed:session-beach-walk', 'seed:session-beach-jog']) {
      expect(beforeStartSteps(data, template(id), BODYWEIGHT)[1]).toBe('beachPrompts');
    }
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
