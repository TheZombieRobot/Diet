import { describe, expect, it } from 'vitest';
import {
  checkLongTermGoal,
  goalView,
  goalVisible,
  MILESTONE_MAX_FRACTION_BELOW,
  nearerMilestoneKg,
  parseWeightInput,
} from './goal';

describe('the long-term goal (WT-01, HS-01; DECISIONS weight goals)', () => {
  it('WT-01, HS-01: refuses a goal below BMI 18.5 by item 13’s strict-side rule, and accepts one at it', () => {
    expect(checkLongTermGoal(59.9, 180, 100)).toEqual({ ok: false, reason: 'below-bmi-floor' });
    expect(checkLongTermGoal(60.0, 180, 100)).toEqual({ ok: true, goalKg: 60 });
    expect(checkLongTermGoal(74.0, 200, 100)).toEqual({ ok: true, goalKg: 74 });
    expect(checkLongTermGoal(73.9, 200, 100).ok).toBe(false);
    // An imported goal and height that are not whole tenths: goal rounded down, height up.
    expect(checkLongTermGoal(59.98, 180.05, 100)).toEqual({ ok: false, reason: 'below-bmi-floor' });
  });

  it('WT-01: needs a height, a current weight and a goal below it, from 20 to 400 kg', () => {
    expect(checkLongTermGoal(70, null, 100)).toEqual({ ok: false, reason: 'needs-height' });
    expect(checkLongTermGoal(70, 180, null)).toEqual({ ok: false, reason: 'needs-weigh-in' });
    expect(checkLongTermGoal(100, 180, 100)).toEqual({ ok: false, reason: 'not-below-weight' });
    expect(checkLongTermGoal(101, 180, 100)).toEqual({ ok: false, reason: 'not-below-weight' });
    expect(checkLongTermGoal(19.9, 180, 100)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(checkLongTermGoal(400.1, 180, 100)).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('WT-01: a typed weight is a plain number from 20 to 400, rounded to 0.1 kg', () => {
    for (const text of ['', ' ', '5,5', '82.5kg', '-80']) {
      expect(parseWeightInput(text)).toEqual({ ok: false, reason: 'not-a-number' });
    }
    expect(parseWeightInput('19.9')).toEqual({ ok: false, reason: 'out-of-range' });
    expect(parseWeightInput('82.46')).toEqual({ ok: true, kg: 82.5 });
  });
});

describe('the next milestone (WT-02 as reworded, HS-01)', () => {
  it('is no more than 20% below the reference, rounded up to 0.1 kg, and never below the goal', () => {
    expect(MILESTONE_MAX_FRACTION_BELOW).toBe(0.2);
    expect(nearerMilestoneKg(78, 100)).toBe(80);
    expect(nearerMilestoneKg(80, 100)).toBe(80);
    expect(nearerMilestoneKg(85, 100)).toBe(85);
    expect(nearerMilestoneKg(78, 685 / 7)).toBe(78.3);
    expect(nearerMilestoneKg(101, 100)).toBeNull();
  });

  it('property: at or above the goal, at or above 0.8 × reference, and within 0.1 kg of it when it is not the goal', () => {
    let seed = 20_001;
    const random = () => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
    for (let i = 0; i < 5000; i++) {
      const goal = Math.round((40 + random() * 110) * 10) / 10;
      const reference = 40 + random() * 160;
      const milestone = nearerMilestoneKg(goal, reference);
      if (goal >= reference) {
        expect(milestone).toBeNull();
        continue;
      }
      expect(milestone).not.toBeNull();
      const kg = milestone ?? 0;
      expect(kg).toBeGreaterThanOrEqual(goal);
      expect(kg).toBeGreaterThanOrEqual(0.8 * reference - 1e-9);
      if (kg !== goal) expect(kg - 0.8 * reference).toBeLessThan(0.1 + 1e-9);
    }
  });
});

describe('what the goal displays show (D50, W4, W5)', () => {
  const open = { goalSettingAvailable: true, deficitAllowed: true };
  const view = (over: Partial<Parameters<typeof goalView>[0]>) =>
    goalView({ goalKg: 78, heightCm: 180, referenceKg: 100, gates: open, ...over });

  it('W4: hidden while readiness closes goal setting or the deficit, with the stored goal kept', () => {
    expect(view({ gates: { goalSettingAvailable: false, deficitAllowed: false } })).toEqual({
      status: 'gated',
    });
    expect(view({ gates: { goalSettingAvailable: true, deficitAllowed: false } })).toEqual({
      status: 'gated',
    });
  });

  it('item 13 alignment: goalVisible is false for answers 1, 2 and 5 and true with all "no"', () => {
    // Answers 1 and 5 close both; answer 2 closes the deficit (item 13's gates).
    expect(goalVisible({ goalSettingAvailable: false, deficitAllowed: false })).toBe(false);
    expect(goalVisible({ goalSettingAvailable: true, deficitAllowed: false })).toBe(false);
    expect(goalVisible(open)).toBe(true);
  });

  it('D50, W5: no number without a height, or for a stored goal now below the floor', () => {
    expect(view({ goalKg: null })).toEqual({ status: 'none' });
    expect(view({ heightCm: null })).toEqual({ status: 'needs-height' });
    expect(view({ goalKg: 59.9 })).toEqual({ status: 'needs-update' });
  });

  it('a set goal carries its milestone, a weigh-in prompt, or none at or above the reference', () => {
    expect(view({})).toEqual({
      status: 'set',
      goalKg: 78,
      milestone: { kind: 'milestone', kg: 80 },
    });
    expect(view({ goalKg: 85 })).toEqual({
      status: 'set',
      goalKg: 85,
      milestone: { kind: 'is-goal' },
    });
    expect(view({ referenceKg: null })).toMatchObject({ milestone: { kind: 'needs-weigh-in' } });
    expect(view({ referenceKg: 70 })).toMatchObject({ milestone: { kind: 'none' } });
  });
});
