import { describe, expect, it } from 'vitest';
import raw from '../../data/exercises.json' with { type: 'json' };
import { getExerciseData } from './dataset';
import type { ExerciseData, VariantKey } from './types';
import { type ExerciseDataRule, exerciseDataProblems, parseExerciseData } from './validate';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type Data = Mutable<ExerciseData>;

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

  it('plans the HEALTH_SAFETY.md section 6 library, leaves out five movements, and has equipment versions only where it lists them', () => {
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
      ['seed:ex-pike-push-up', 'standard', 'Pike push-up'],
      ['seed:ex-pike-push-up', 'dumbbell', 'Dumbbell shoulder press'],
      ['seed:ex-row', 'band', 'Band row'],
      ['seed:ex-row', 'standard', 'Inverted row on a rail'],
      ['seed:ex-row', 'dumbbell', 'One-arm dumbbell row'],
      ['seed:ex-band-pull-apart', 'standard', 'Band pull-apart'],
      ['seed:ex-dead-bug', 'standard', 'Dead bug'],
      ['seed:ex-bird-dog', 'standard', 'Bird-dog'],
      ['seed:ex-side-plank', 'standard', 'Side plank'],
      ['seed:ex-front-plank', 'standard', 'Front plank'],
      ['seed:ex-beach-walk', 'harder', 'Soft-sand walk'],
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

  it.each<[ExerciseDataRule, (d: Data) => void]>([
    ['shape', (d) => void ((d as { datasetVersion: number }).datasetVersion = 2)],
    ['id', (d) => void (exercise(d, 'seed:ex-band-pull-apart').id = 'seed:ex-row')],
    ['text', (d) => void exercise(d, 'seed:ex-squat').cues.push('Breathe out as you rise.')],
    ['wording', (d) => void (exercise(d, 'seed:ex-squat').cues[0] = 'Stop at the bottom.')],
    [
      'variants',
      (d) =>
        void ((exercise(d, 'seed:ex-squat').variants as Record<string, unknown>)['harder'] = null),
    ],
    ['stop-rule-link', (d) => void (exercise(d, 'seed:ex-squat').safetyKeys = ['painFreeOnly'])],
    ['beach', (d) => void (exercise(d, 'seed:ex-beach-walk').tags = [])],
    [
      'slot',
      (d) =>
        void ((template(d, 'seed:session-a').main[0] as { startVariant: string }).startVariant =
          'harder'),
    ],
    ['blocks', (d) => void (template(d, 'seed:session-a').coolDown = [])],
    [
      'duration',
      (d) => {
        const bridge = template(d, 'seed:session-a').main.find(
          (s) => s.exerciseId === 'seed:ex-glute-bridge',
        );
        Object.assign(bridge ?? {}, { sets: 4, min: 10, max: 30 });
      },
    ],
    [
      'full-body',
      (d) => {
        const b = template(d, 'seed:session-b');
        b.main = b.main.filter((s) => s.exerciseId !== 'seed:ex-bird-dog');
      },
    ],
    [
      'template-set',
      (d) =>
        void d.templates.push({
          ...template(d, 'seed:session-beach-walk'),
          id: 'seed:session-walk-two',
        }),
    ],
    [
      'default-week',
      (d) => {
        d.defaultWeek = d.defaultWeek.map((day) =>
          day.weekday === 3
            ? { weekday: 3, templateIds: ['seed:session-b'] }
            : day.weekday === 5
              ? { weekday: 5, templateIds: [] }
              : day,
        );
      },
    ],
  ])('the %s rule refuses a broken copy', (rule, breakIt) => {
    const d = fresh();
    breakIt(d);
    expect(rules(d)).toContain(rule);
    expect(() => parseExerciseData(d)).toThrow(rule);
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
