// The Move screens' text (item 27 design section 5.2, A1; EX-08): amounts, the strip's chips and
// sentences, and the stepper's step.
import { type DayState, exerciseById, getExerciseData, templateById } from '@diet/core';
import { move } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import { amountText, dayChipText, daySentence, displayStep } from './moveText';

const data = getExerciseData();
const A = 'seed:session-a';
const WALK = 'seed:session-beach-walk';
const TUE = '2000-01-18';

describe('moveText (A1)', () => {
  it.each([
    ['reps', 1, false, '1 rep'],
    ['reps', 9, false, '9 reps'],
    ['reps', 8, true, '8 reps each side'],
    ['seconds', 30, false, '30 seconds'],
    ['seconds', 60, false, '1 minute'],
    ['seconds', 900, false, '15 minutes'],
    ['seconds', 90, false, '1 minute 30 seconds'],
    ['seconds', 45, true, '45 seconds each side'],
  ] as const)('amountText(%s, %i, per side %s) is %j', (unit, value, perSide, text) => {
    expect(amountText(unit, value, perSide)).toBe(text);
  });

  it.each<[DayState, string]>([
    ['rest-day', 'Tuesday: rest day, counts as success'],
    ['planned', 'Tuesday: Session A'],
    ['done', 'Tuesday: Session A, done'],
    ['rested', 'Tuesday: rested, that counts'],
    ['not-done', 'Tuesday: Session A, not done. Rest counts too.'],
  ])('the %s sentence never reads as a failure', (state, sentence) => {
    const day = { date: TUE, templateIds: state === 'rest-day' ? [] : [A] };
    expect(daySentence(data, day, state, false, false)).toBe(sentence);
    expect(daySentence(data, day, state, true, false)).toBe(`${sentence} (today)`);
  });

  it('a day whose jog shows as the walk says so; two sessions give two chip lines, strength first', () => {
    const day = { date: '2000-01-23', templateIds: [WALK] };
    expect(daySentence(data, day, 'planned', false, true)).toBe(
      `Sunday: Beach walk. ${move.jog.shownAsWalk}`,
    );
    expect(dayChipText(data, { date: TUE, templateIds: [WALK, A] }, 'planned', [])).toEqual([
      'A',
      'Walk',
    ]);
    expect(dayChipText(data, { date: TUE, templateIds: [] }, 'rest-day', [])).toEqual([
      move.week.restChip,
    ]);
  });

  it('the stepper moves a walk 5 minutes at a time, and other movements by their own step', () => {
    const slot = (template: string, exerciseId: string) =>
      templateById(data, template)?.main.find((s) => s.exerciseId === exerciseId) ?? null;
    const step = (id: string, template: string) => {
      const exercise = exerciseById(data, id);
      if (exercise === undefined) throw new Error(id);
      return displayStep(exercise, slot(template, id));
    };
    expect(step('seed:ex-beach-walk', WALK)).toBe(300);
    expect(step('seed:ex-squat', A)).toBe(1);
    expect(step('seed:ex-front-plank', 'seed:session-c')).toBe(5);
  });
});
