import { describe, expect, it } from 'vitest';
import { StorageValidationError, validateRow } from '../storage/validate';
import { MAX_DAILY_STEPS, parseStepCount, stepsRepeatOffer } from './steps';

describe('parseStepCount (U4; TD-04)', () => {
  it.each([
    ['12000', 12000],
    ['12,000', 12000],
    ['12 000', 12000],
    [' 0 ', 0],
    ['007', 7],
    ['100000', 100000],
    ['100,000', 100000],
  ])('accepts %j as %d', (text, steps) => {
    expect(parseStepCount(text)).toEqual({ ok: true, steps });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['-5', 'format'],
    ['abc', 'format'],
    ['1.5', 'format'],
    ['12,00', 'format'],
    ['1,2345', 'format'],
    ['１２０００', 'format'],
    ['1e3', 'format'],
    ['100001', 'too-many'],
    ['100,001', 'too-many'],
  ])('refuses %j (%s)', (text, reason) => {
    expect(parseStepCount(text)).toEqual({ ok: false, reason });
  });

  it('the bound is the steps_log validator bound', () => {
    const steps = (n: number) => ({
      date: '2000-03-15',
      steps: n,
      source: 'manual',
      updatedAt: '2000-03-15T01:20:00.000Z',
    });
    expect(validateRow('steps_log', steps(MAX_DAILY_STEPS)).steps).toBe(MAX_DAILY_STEPS);
    expect(() => validateRow('steps_log', steps(MAX_DAILY_STEPS + 1))).toThrow(
      StorageValidationError,
    );
    expect(() => validateRow('steps_log', steps(MAX_DAILY_STEPS + 1))).toThrow(
      /steps_log\.steps failed range/,
    );
  });
});

describe('stepsRepeatOffer (U4; TD-04, T9)', () => {
  it("offers yesterday's count only when today has no entry", () => {
    expect(stepsRepeatOffer(null, { steps: 12000 })).toBe(12000);
    expect(stepsRepeatOffer({ steps: 9000 }, { steps: 12000 })).toBeNull();
    expect(stepsRepeatOffer(undefined, undefined)).toBeNull();
  });
});
