import { readinessGates } from '@diet/core';
import { today } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import { BUILT_QUICK_ACTIONS, QUICK_ACTION_ORDER, quickActionStates } from './quickActions';
import { openWeightEntry } from './weight/entryStore';

const answers = (q1: 'yes' | 'no') => ({
  answers: { q1, q2: 'no', q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no' } as const,
  confirmations: { prescriberAgreed: false, gpExerciseDiscussed: false },
  minimumAgeYears: 50,
  lowWeight: false,
});

describe('quickActionStates (U12; TD-02, T17)', () => {
  it('seven actions in the UX_SCREENS order, labelled with the UX words', () => {
    const states = quickActionStates(readinessGates(answers('no')));
    expect(states.map((s) => s.id)).toEqual([...QUICK_ACTION_ORDER]);
    expect(states.map((s) => today.quickActions.labels[s.id])).toEqual(
      Object.values(today.quickActions.labels),
    );
  });

  it("Log weight opens item 14's entry in place, Finish meal the food log (item 23), Complete workout links to the session (item 27), Add harvest the garden screen (item 19), Swap recipe today's plan (item 22) and Add drink the Drinks screen (item 28); the rest arrive later", () => {
    const states = quickActionStates(readinessGates(answers('no')));
    expect(states.map((s) => s.state.kind)).toEqual([
      'ready',
      'ready',
      'ready',
      'ready',
      'ready',
      'ready',
      'later',
    ]);
    expect(BUILT_QUICK_ACTIONS['log-weight']).toEqual({
      label: 'Log weight',
      run: openWeightEntry,
    });
    expect(BUILT_QUICK_ACTIONS['complete-workout']).toMatchObject({
      label: 'Complete workout',
      href: '#/move-session',
    });
    expect(BUILT_QUICK_ACTIONS['add-drink']).toEqual({ label: 'Add drink', href: '#/drinks' });
    expect(BUILT_QUICK_ACTIONS['finish-meal']).toEqual({
      label: 'Finish meal',
      href: '#/food-log',
    });
    expect(BUILT_QUICK_ACTIONS['swap-recipe']).toEqual({
      label: 'Swap recipe',
      href: '#/plan/today',
    });
  });

  it('RD-05: with readiness answer 6 open, Complete workout is off for exercise plans (item 27)', () => {
    const gates = readinessGates({
      ...answers('no'),
      answers: { ...answers('no').answers, q6: 'yes' },
    });
    const workout = quickActionStates(gates).find((s) => s.id === 'complete-workout');
    expect(workout?.state).toEqual({ kind: 'off', feature: 'exercisePlans' });
  });

  it('C6 G22, G24: Add harvest is never gated: ready, linking to #/garden/harvest, whatever the answers', () => {
    // Every gate open (all "no"), then every gate closed (all "yes").
    for (const a of ['no', 'yes'] as const) {
      const gates = readinessGates({
        ...answers(a),
        answers: { q1: a, q2: a, q3: a, q4: a, q5: a, q6: a, q7: a },
      });
      const harvest = quickActionStates(gates).find((s) => s.id === 'add-harvest');
      expect(harvest?.state).toMatchObject({
        kind: 'ready',
        action: { label: 'Add harvest', href: '#/garden/harvest' },
      });
    }
  });

  it('T11: under 18, Add drink is off for alcohol logging, not hidden', () => {
    const drink = quickActionStates(readinessGates(answers('yes'))).find(
      (s) => s.id === 'add-drink',
    );
    expect(drink?.state).toEqual({ kind: 'off', feature: 'alcoholLogging' });
  });
});
