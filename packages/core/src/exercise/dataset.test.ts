import { describe, expect, it } from 'vitest';
import raw from '../../data/exercises.json' with { type: 'json' };
import { getExerciseData } from './dataset';
import type { ExerciseData, TemplateSlot, VariantKey } from './types';
import {
  ExerciseDataError,
  type ExerciseDataRule,
  exerciseDataProblems,
  parseExerciseData,
} from './validate';
import { cuesFor } from './variants';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type Data = Mutable<ExerciseData>;
type Slot = Mutable<TemplateSlot>;

// The data is read inside each test, so a broken file fails the first test with its problems.
const fresh = (): Data => JSON.parse(JSON.stringify(raw)) as Data;

function find<T extends { id: string }>(list: T[], id: string): T {
  const found = list.find((item) => item.id === id);
  if (found === undefined) throw new Error(`No ${id} in the dataset`);
  return found;
}
const exercise = (d: Data, id: string) => find(d.exercises, id);
const template = (d: Data, id: string) => find(d.templates, id);
const rules = (d: unknown): ExerciseDataRule[] => exerciseDataProblems(d).map((p) => p.rule);
/** The JSON paths the validator reports. */
const ex = (d: Data, id: string) => `exercises[${d.exercises.findIndex((e) => e.id === id)}]`;
const tp = (d: Data, id: string) => `templates[${d.templates.findIndex((t) => t.id === id)}]`;
/** A main slot of a template and its path. */
function slot(d: Data, templateId: string, exerciseId: string): { s: Slot; path: string } {
  const main = template(d, templateId).main;
  const i = main.findIndex((s) => s.exerciseId === exerciseId);
  const s = main[i];
  if (s === undefined) throw new Error(`No ${exerciseId} in ${templateId}`);
  return { s, path: `${tp(d, templateId)}.main[${i}]` };
}
const A = 'seed:session-a';
const B = 'seed:session-b';
const C = 'seed:session-c';
const WALK = 'seed:session-beach-walk';
const JOG = 'seed:session-beach-jog';
const withoutMain = (d: Data, id: string, drop: string[]) => {
  const t = template(d, id);
  t.main = t.main.filter((s) => !drop.includes(s.exerciseId.slice('seed:ex-'.length)));
  return `${tp(d, id)}.main`;
};
const cue = (text: string) => (d: Data) => {
  exercise(d, 'seed:ex-squat').cues[0] = text;
  return `${ex(d, 'seed:ex-squat')}.cues[0]`;
};
const week = (days: Record<number, string[]>) => (d: Data) => {
  d.defaultWeek = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    templateIds: days[weekday] ?? [],
  }));
  return 'defaultWeek';
};

describe('exercise dataset (item 26)', () => {
  it('EX-01, EX-05: the shipped exercises.json passes every validation rule', () => {
    expect(exerciseDataProblems(raw)).toEqual([]);
    expect(Object.isFrozen(getExerciseData().exercises[0]?.variants.easier)).toBe(true);
  });

  it('EX-01: every exercise has easier and harder versions and a stop-rule link first', () => {
    for (const e of getExerciseData().exercises) {
      expect(e.variants.easier.name, e.id).not.toBe('');
      expect(e.variants.harder.name, e.id).not.toBe('');
      expect(e.safetyKeys[0], e.id).toBe('stopRules');
    }
  });

  it('plans the HEALTH_SAFETY.md section 6 library, leaves out six movements, and has equipment versions only where it lists them', () => {
    const data = getExerciseData();
    const library: [string, VariantKey, string][] = [
      ['seed:ex-squat', 'easier', 'Sit-to-stand'],
      ['seed:ex-squat', 'standard', 'Squat to a chair'],
      ['seed:ex-squat', 'harder', 'Bodyweight squat'],
      ['seed:ex-split-squat', 'standard', 'Split squat'],
      ['seed:ex-split-squat', 'harder', 'Reverse lunge'],
      ['seed:ex-glute-bridge', 'standard', 'Glute bridge'],
      ['seed:ex-glute-bridge', 'harder', 'Single-leg bridge'],
      ['seed:ex-calf-raise', 'standard', 'Calf raise'],
      ['seed:ex-step-up', 'standard', 'Step-up'],
      ['seed:ex-hip-hinge', 'standard', 'Hip hinge to a box'],
      ['seed:ex-push-up', 'easier', 'Wall push-up'],
      ['seed:ex-push-up', 'standard', 'Incline push-up'],
      ['seed:ex-pike-push-up', 'standard', 'Incline pike push-up'],
      ['seed:ex-pike-push-up', 'dumbbell', 'Dumbbell shoulder press'],
      ['seed:ex-row', 'band', 'Band row'],
      ['seed:ex-row', 'standard', 'Inverted row on a rail'],
      ['seed:ex-row', 'dumbbell', 'One-arm dumbbell row'],
      ['seed:ex-band-pull-apart', 'standard', 'Band pull-apart'],
      ['seed:ex-dead-bug', 'standard', 'Dead bug'],
      ['seed:ex-bird-dog', 'standard', 'Bird-dog'],
      ['seed:ex-side-plank', 'standard', 'Side plank'],
      ['seed:ex-front-plank', 'standard', 'Front plank'],
      ['seed:ex-beach-walk', 'harder', 'Walk with soft-sand stretches'],
      ['seed:ex-beach-walk', 'standard', 'Brisk walk on firm sand'],
      ['seed:ex-beach-jog', 'standard', 'Easy jog on firm sand'],
      ['seed:ex-hip-flexor-stretch', 'standard', 'Half-kneeling hip flexor stretch'],
      ['seed:ex-calf-stretch', 'standard', 'Wall calf stretch'],
      ['seed:ex-upper-back-rotation', 'standard', 'Side-lying open book'],
      ['seed:ex-ankle-circles', 'standard', 'Standing ankle circles'],
    ];
    const byId = new Map(data.exercises.map((e) => [e.id, e]));
    for (const [id, key, name] of library) expect(byId.get(id)?.variants[key]?.name, id).toBe(name);
    expect(byId.get('seed:ex-hip-hinge')?.safetyKeys).toContain('painFreeOnly');

    const names = data.exercises.flatMap((e) => [
      e.name,
      ...Object.values(e.variants).flatMap((v) => (v === null ? [] : [v.name])),
    ]);
    for (const name of names) {
      expect(name).not.toMatch(/hollow|wad(?:e|ing)|sprint|swim|on (?:the|your) toes/i);
    }
    const withVersion = (key: 'band' | 'dumbbell') =>
      data.exercises.filter((e) => e.variants[key] !== null).map((e) => e.id);
    expect(withVersion('band')).toEqual(['seed:ex-row']);
    expect(withVersion('dumbbell')).toEqual(['seed:ex-pike-push-up', 'seed:ex-row']);
  });

  it('content review: the press has its own cues, the pike stays inclined, soft sand comes in short stretches, the row needs a fixed rail, C starts both planks kneeling, and the lighter walk and jog have their own cues', () => {
    const data = getExerciseData();
    const byId = new Map(data.exercises.map((e) => [e.id, e]));
    const pike = byId.get('seed:ex-pike-push-up');
    const row = byId.get('seed:ex-row');
    if (pike === undefined || row === undefined) throw new Error('Missing pike or row');
    for (const pikeCue of pike.cues) expect(cuesFor(pike, 'dumbbell')).not.toContain(pikeCue);
    expect(cuesFor(pike, 'standard')).toEqual(pike.cues);
    for (const key of ['easier', 'standard', 'harder'] as const) {
      expect(pike.variants[key].how).not.toMatch(/hands (?:and feet )?on the floor/i);
      expect(row.variants[key].how).toContain('(not a table, chair or broom)');
    }
    expect(byId.get('seed:ex-beach-walk')?.variants.harder.how).toContain(
      '2 to 3 minutes on softer sand',
    );
    // The lighter jog never says to jog, and the lighter walk never says to walk briskly (HS-29).
    const jog = byId.get('seed:ex-beach-jog');
    const walk = byId.get('seed:ex-beach-walk');
    if (jog === undefined || walk === undefined) throw new Error('Missing a beach exercise');
    for (const lighterCue of cuesFor(jog, 'easier')) expect(lighterCue).not.toMatch(/\bjog/i);
    for (const lighterCue of cuesFor(walk, 'easier')) expect(lighterCue).not.toMatch(/\bbrisk/i);
    const c = data.templates.find((t) => t.id === C);
    const planks = c?.main.filter((s) => /plank/.test(s.exerciseId)).map((s) => s.startVariant);
    expect(planks).toEqual(['easier', 'easier']);
  });

  // One row per check, each asserting its own path, so overlapping checks cannot hide each other.
  it.each<[string, ExerciseDataRule, (d: Data) => string]>([
    // shape
    [
      'a dataset version other than 1',
      'shape',
      (d) => {
        (d as { datasetVersion: number }).datasetVersion = 2;
        return 'datasetVersion';
      },
    ],
    [
      'no exercises',
      'shape',
      (d) => {
        d.exercises = [];
        return 'exercises';
      },
    ],
    [
      "a version's own cues that are not a list",
      'shape',
      (d) => {
        const press = exercise(d, 'seed:ex-pike-push-up').variants.dumbbell;
        if (press !== null) (press as { cues: unknown }).cues = 'Sit tall.';
        return `${ex(d, 'seed:ex-pike-push-up')}.variants.dumbbell.cues`;
      },
    ],
    // id
    [
      'an exercise id that breaks the pattern',
      'id',
      (d) => {
        const path = ex(d, 'seed:ex-band-pull-apart');
        exercise(d, 'seed:ex-band-pull-apart').id = 'seed:ex-Band';
        return `${path}.id`;
      },
    ],
    [
      'a repeated id',
      'id',
      (d) => {
        const path = ex(d, 'seed:ex-band-pull-apart');
        exercise(d, 'seed:ex-band-pull-apart').id = 'seed:ex-row';
        return `${path}.id`;
      },
    ],
    [
      'a version 1 exercise id renamed',
      'id',
      (d) => {
        exercise(d, 'seed:ex-band-pull-apart').id = 'seed:ex-band-pull-aparts';
        return 'exercises';
      },
    ],
    [
      'a version 1 session id renamed',
      'id',
      (d) => {
        template(d, C).id = 'seed:session-c-two';
        return 'templates';
      },
    ],
    // text
    [
      'four cues',
      'text',
      (d) => {
        exercise(d, 'seed:ex-squat').cues.push('Breathe out as you rise.');
        return `${ex(d, 'seed:ex-squat')}.cues`;
      },
    ],
    ['a cue with no full stop', 'text', cue('Feet apart')],
    [
      'two exercises with one name',
      'text',
      (d) => {
        exercise(d, 'seed:ex-split-squat').name = 'squat';
        return 'exercises';
      },
    ],
    [
      'a how-to line over 140 characters',
      'text',
      (d) => {
        exercise(d, 'seed:ex-squat').variants.standard.how = 'a'.repeat(141);
        return `${ex(d, 'seed:ex-squat')}.variants.standard.how`;
      },
    ],
    [
      "a version's own cues: only one",
      'text',
      (d) => {
        const press = exercise(d, 'seed:ex-pike-push-up').variants.dumbbell;
        if (press !== null) press.cues = ['Sit tall.'];
        return `${ex(d, 'seed:ex-pike-push-up')}.variants.dumbbell.cues`;
      },
    ],
    // wording: one row per ban, each phrase caught by that ban only
    ['pain in a cue', 'wording', cue('Keep it pain-free.')],
    ['a professional in a cue', 'wording', cue('Ask your physio first.')],
    ['dizziness in a cue', 'wording', cue('Never get dizzy.')],
    ['shortness of breath in a cue', 'wording', cue('Avoid shortness of breath.')],
    ['stop in a cue', 'wording', cue('Stop at the bottom.')],
    ['a marketing claim in a cue', 'wording', cue('Burn fat fast.')],
    ['a hyphenated programme name in a cue', 'wording', cue('As in Couch-to-5K.')],
    ['another programme name in a cue', 'wording', cue('As in StrongLifts.')],
    [
      'wording in a how-to line',
      'wording',
      (d) => {
        exercise(d, 'seed:ex-squat').variants.standard.how = 'Lower until it hurts.';
        return `${ex(d, 'seed:ex-squat')}.variants.standard.how`;
      },
    ],
    [
      'wording in a version name',
      'wording',
      (d) => {
        exercise(d, 'seed:ex-squat').variants.harder.name = 'Safe squat';
        return `${ex(d, 'seed:ex-squat')}.variants.harder.name`;
      },
    ],
    [
      "wording in a version's own cues",
      'wording',
      (d) => {
        const press = exercise(d, 'seed:ex-pike-push-up').variants.dumbbell;
        if (press !== null) press.cues = ['Sit tall.', 'Stop if it pinches.'];
        return `${ex(d, 'seed:ex-pike-push-up')}.variants.dumbbell.cues[1]`;
      },
    ],
    [
      'a programme name in a session name',
      'wording',
      (d) => {
        template(d, A).name = 'Tabata A';
        return `${tp(d, A)}.name`;
      },
    ],
    // variants
    [
      'a required version missing',
      'variants',
      (d) => {
        (exercise(d, 'seed:ex-squat').variants as Record<string, unknown>)['harder'] = null;
        return `${ex(d, 'seed:ex-squat')}.variants.harder`;
      },
    ],
    [
      'an equipment version on the band pull-apart',
      'variants',
      (d) => {
        const pullApart = exercise(d, 'seed:ex-band-pull-apart');
        pullApart.variants.dumbbell = { ...pullApart.variants.easier, name: 'Dumbbell fly' };
        return `${ex(d, 'seed:ex-band-pull-apart')}.variants`;
      },
    ],
    // stop-rule-link
    ...(
      [
        ['the stop rules not first', ['painFreeOnly', 'stopRules']],
        ['a repeated safety key', ['stopRules', 'stopRules']],
        ['an unknown safety key', ['stopRules', 'warmUpOnly']],
      ] as const
    ).map(([label, keys]): [string, ExerciseDataRule, (d: Data) => string] => [
      label,
      'stop-rule-link',
      (d) => {
        (exercise(d, 'seed:ex-hip-hinge') as { safetyKeys: string[] }).safetyKeys = [...keys];
        return `${ex(d, 'seed:ex-hip-hinge')}.safetyKeys`;
      },
    ]),
    // beach
    [
      'a beach exercise without the beach prompts',
      'beach',
      (d) => {
        exercise(d, 'seed:ex-beach-jog').safetyKeys = ['stopRules'];
        return `${ex(d, 'seed:ex-beach-jog')}.tags`;
      },
    ],
    [
      'the beach prompts on an exercise that is not beach',
      'beach',
      (d) => {
        exercise(d, 'seed:ex-squat').safetyKeys = ['stopRules', 'beachPrompts'];
        return `${ex(d, 'seed:ex-squat')}.tags`;
      },
    ],
    [
      'a jog tag without the beach tag',
      'beach',
      (d) => {
        Object.assign(exercise(d, 'seed:ex-beach-jog'), {
          tags: ['jog'],
          safetyKeys: ['stopRules'],
        });
        return `${ex(d, 'seed:ex-beach-jog')}.tags`;
      },
    ],
    ...(['seed:ex-beach-walk', 'seed:ex-beach-jog'] as const).map(
      (id): [string, ExerciseDataRule, (d: Data) => string] => [
        `${id}'s easier version (the lighter session) without its own cues`,
        'beach',
        (d) => {
          exercise(d, id).variants.easier.cues = null;
          return `${ex(d, id)}.variants.easier.cues`;
        },
      ],
    ),
    [
      'a beach session with no beach tag',
      'beach',
      (d) => {
        template(d, WALK).tags = [];
        return `${tp(d, WALK)}.tags`;
      },
    ],
    [
      'a beach movement in a strength session',
      'beach',
      (d) => {
        const main = template(d, A).main;
        main.push({ ...slot(d, WALK, 'seed:ex-beach-walk').s });
        return `${tp(d, A)}.main[${main.length - 1}].exerciseId`;
      },
    ],
    // slot
    ...(
      [
        ['a harder start version', A, 'seed:ex-squat', { startVariant: 'harder' }],
        ['eleven sets', B, 'seed:ex-calf-raise', { sets: 11 }],
        ['a range from 13 to 12', B, 'seed:ex-calf-raise', { min: 13 }],
        ['195 s of rest', B, 'seed:ex-calf-raise', { restSeconds: 195 }],
        ['a hold not in whole steps', C, 'seed:ex-front-plank', { min: 22 }],
        ['31 reps', B, 'seed:ex-calf-raise', { max: 31 }],
        ['the band pull-apart without the band', A, 'seed:ex-band-pull-apart', { onlyWith: null }],
        ['a repeated exercise with another dose', C, 'seed:ex-squat', { sets: 3 }],
        ['a repeated exercise only with dumbbells', C, 'seed:ex-squat', { onlyWith: 'dumbbell' }],
        [
          'an exercise that is not in the dataset',
          B,
          'seed:ex-step-up',
          { exerciseId: 'seed:ex-gone' },
        ],
      ] as const
    ).map(
      ([label, templateId, exerciseId, change]): [
        string,
        ExerciseDataRule,
        (d: Data) => string,
      ] => [
        label,
        'slot',
        (d) => {
          const { s, path } = slot(d, templateId, exerciseId);
          Object.assign(s, change);
          return 'exerciseId' in change ? `${path}.exerciseId` : path;
        },
      ],
    ),
    [
      'more than 20 slots in a session',
      'slot',
      (d) => {
        const t = template(d, A);
        const first = t.warmUp[0];
        if (first !== undefined) t.warmUp.push(...Array.from({ length: 15 }, () => ({ ...first })));
        return tp(d, A);
      },
    ],
    [
      'a step of 1 second',
      'slot',
      (d) => {
        (exercise(d, 'seed:ex-front-plank') as { step: number }).step = 1;
        return `${ex(d, 'seed:ex-front-plank')}.step`;
      },
    ],
    // blocks
    [
      'an empty main block',
      'blocks',
      (d) => {
        template(d, A).main = [];
        return `${tp(d, A)}.main`;
      },
    ],
    [
      'a 90-second march as the warm-up',
      'blocks',
      (d) => {
        Object.assign(template(d, A).warmUp[0] ?? {}, { min: 90, max: 90 });
        return `${tp(d, A)}.warmUp`;
      },
    ],
    [
      'a 60-second cool-down',
      'blocks',
      (d) => {
        const t = template(d, A);
        t.coolDown = t.coolDown.slice(0, 1);
        return `${tp(d, A)}.coolDown`;
      },
    ],
    [
      'two sets in a warm-up slot',
      'blocks',
      (d) => {
        Object.assign(template(d, A).warmUp[0] ?? {}, { sets: 2 });
        return `${tp(d, A)}.warmUp[0]`;
      },
    ],
    [
      'one exercise twice in a main block',
      'blocks',
      (d) => {
        template(d, A).main.push({ ...slot(d, A, 'seed:ex-squat').s });
        return `${tp(d, A)}.main`;
      },
    ],
    [
      'a main movement in a warm-up',
      'blocks',
      (d) => {
        Object.assign(template(d, A).warmUp[0] ?? {}, { exerciseId: 'seed:ex-front-plank' });
        return 'templates';
      },
    ],
    [
      'reps in a warm-up',
      'blocks',
      (d) => {
        Object.assign(template(d, A).warmUp[0] ?? {}, {
          exerciseId: 'seed:ex-squat',
          min: 10,
          max: 10,
        });
        return `${tp(d, A)}.warmUp[0]`;
      },
    ],
    // duration
    [
      'session A over 35 minutes',
      'duration',
      (d) => {
        Object.assign(slot(d, A, 'seed:ex-glute-bridge').s, { sets: 4, min: 10, max: 30 });
        return tp(d, A);
      },
    ],
    [
      'a beach walk under 20 minutes',
      'duration',
      (d) => {
        Object.assign(slot(d, WALK, 'seed:ex-beach-walk').s, { min: 300 });
        return tp(d, WALK);
      },
    ],
    // full-body
    [
      'B with no lower body',
      'full-body',
      (d) => withoutMain(d, B, ['step-up', 'hip-hinge', 'calf-raise']),
    ],
    ['B with no upper body', 'full-body', (d) => withoutMain(d, B, ['pike-push-up', 'row'])],
    ['B with no core', 'full-body', (d) => withoutMain(d, B, ['bird-dog'])],
    [
      'B whose lighter session would hold two movements',
      'full-body',
      (d) => withoutMain(d, B, ['step-up', 'row', 'calf-raise']),
    ],
    [
      'C whose lower body needs dumbbells',
      'full-body',
      (d) => {
        for (const id of ['seed:ex-squat', 'seed:ex-split-squat']) {
          slot(d, C, id).s.onlyWith = 'dumbbell';
        }
        return `${tp(d, C)}.main`;
      },
    ],
    // template-set
    [
      'a second beach walk',
      'template-set',
      (d) => {
        d.templates.push({ ...template(d, WALK), id: 'seed:session-walk-two', shortLabel: 'W2' });
        return 'templates';
      },
    ],
    [
      'a fourth strength session',
      'template-set',
      (d) => {
        d.templates.push({ ...template(d, A), id: 'seed:session-d', name: 'D', shortLabel: 'D' });
        return 'templates';
      },
    ],
    [
      'a walk of jog intervals',
      'template-set',
      (d) => {
        exercise(d, 'seed:ex-beach-walk').tags = ['beach', 'jog'];
        return 'templates';
      },
    ],
    [
      'a jog that is not jogging',
      'template-set',
      (d) => {
        exercise(d, 'seed:ex-beach-jog').tags = ['beach'];
        return 'templates';
      },
    ],
    [
      'jog intervals of 100 s',
      'template-set',
      (d) => {
        slot(d, JOG, 'seed:ex-beach-jog').s.max = 100;
        return 'templates';
      },
    ],
    [
      'an exercise no session uses',
      'template-set',
      (d) => {
        d.exercises.push({
          ...exercise(d, 'seed:ex-squat'),
          id: 'seed:ex-squat-two',
          name: 'Squat two',
        });
        return 'templates';
      },
    ],
    // default-week
    ['B the day after A', 'default-week', week({ 2: [A], 3: [B], 6: [WALK] })],
    ['C added on Thursday', 'default-week', week({ 2: [A], 4: [C], 6: [B, WALK] })],
    ['a jog on Sunday', 'default-week', week({ 2: [A], 5: [B], 6: [WALK], 7: [JOG] })],
    [
      'a session the dataset does not hold',
      'default-week',
      week({ 1: ['seed:session-gone'], 2: [A], 5: [B], 6: [WALK] }),
    ],
  ])('%s is a %s problem at its path', (_label, rule, breakIt) => {
    const d = fresh();
    const path = breakIt(d);
    expect(exerciseDataProblems(d)).toContainEqual({ path, rule });
    expect(() => parseExerciseData(d)).toThrow(ExerciseDataError);
  });

  it('never throws, and a short default week is a default-week problem, not a shape problem', () => {
    const withProto = JSON.parse(
      JSON.stringify(raw).replace('"easier":{', '"easier":{"__proto__":{"polluted":true},'),
    ) as unknown;
    const sixDays = fresh();
    sixDays.defaultWeek.pop();
    for (const input of [null, 42, withProto, sixDays]) {
      expect(() => exerciseDataProblems(input)).not.toThrow();
      expect(exerciseDataProblems(input).length).toBeGreaterThan(0);
    }
    expect(exerciseDataProblems(withProto)).toContainEqual({
      path: 'exercises[0].variants.easier',
      rule: 'shape',
    });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(rules(sixDays)).toEqual(['default-week']);
  });
});
