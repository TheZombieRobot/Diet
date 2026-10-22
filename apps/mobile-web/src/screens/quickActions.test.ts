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

  it("Log weight opens item 14's entry in place and Add harvest the garden screen (item 19); the rest arrive later", () => {
    const states = quickActionStates(readinessGates(answers('no')));
    expect(states.map((s) => s.state.kind)).toEqual([
      'ready',
      'later',
      'later',
      'later',
      'ready',
      'later',
      'later',
    ]);
    expect(BUILT_QUICK_ACTIONS['log-weight']).toEqual({
      label: 'Log weight',
      run: openWeightEntry,
    });
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
