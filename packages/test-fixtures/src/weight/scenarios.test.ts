import { checkInvariants, rollingAverageKg, validateSnapshot } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { onDay, scenarioDay, WEIGHT_SCENARIOS, weightScenario } from './scenarios';

describe('weight scenarios (item 14 design section 6.1)', () => {
  it.each(Object.entries(WEIGHT_SCENARIOS))(
    '%s is a valid version-1 snapshot on every day up to its own',
    (_name, options) => {
      for (let day = 1; day <= scenarioDay(options.day1, options.today); day++) {
        const snapshot = weightScenario(onDay(options, day));
        expect(() => validateSnapshot(snapshot)).not.toThrow();
        expect(() => {
          checkInvariants(snapshot);
        }).not.toThrow();
      }
    },
  );

  it('K10 has the worked values: latest 96.786 kg and a 7-day average of 97.857 kg', () => {
    const { weights } = weightScenario(WEIGHT_SCENARIOS.K10);
    expect(weights.at(-1)?.kg).toBeCloseTo(96.786, 3);
    expect(rollingAverageKg(weights, '2000-02-10', 7)).toBeCloseTo(97.857, 3);
    expect(weights[0]?.source).toBe('onboarding');
  });

  it('X3 has extension checks on days 19, 26 and 33, and stores weights unrounded', () => {
    const snapshot = weightScenario(WEIGHT_SCENARIOS.X3);
    expect(snapshot.kickstart_checks.map((c) => c.askedAt.slice(0, 10))).toEqual([
      '2000-02-18',
      '2000-02-25',
      '2000-03-03',
    ]);
    expect(snapshot.weights[1]?.kg).toBe(100 - 2.5 / 7);
  });
});
