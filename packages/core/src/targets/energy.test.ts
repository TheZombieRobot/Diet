import { describe, expect, expectTypeOf, it } from 'vitest';
import { restingEnergyKcal } from '../energy/energyEstimate';
import { STEADY_DEFICIT_PCT, SAT_FAT_BUDGET_PCT } from '../storage/limits';
import type { WeighIn } from '../weight/trend';
import type { PhaseGates } from '../weight/phase';
import {
  ESTIMATE_LIMITS,
  KICKSTART_DEFICIT_OPTIONS_PCT,
  SAT_FAT_BUDGET_OPTIONS_PCT,
  STEADY_DEFICIT_OPTIONS_PCT,
} from './constants';
import {
  type DayEnergy,
  type DeficitChoice,
  dayEnergyFor,
  effectiveDeficit,
  energyEstimateFor,
  energyForMealChecks,
  floorCheck,
  noEstimateEnergy,
  type PlanWriteKind,
  plannerEnergyAim,
  weightForEstimate,
  weightIsStale,
} from './energy';
import {
  safeFloorKj,
  safeKetoCeilingG,
  safeKickstartDeficitPct,
  safeSteadyDeficitPct,
} from './sanitize';

const open: PhaseGates = {
  deficitAllowed: true,
  kickstartAvailable: true,
  ketoCeilingAvailable: true,
  carbCeilingBelow50Allowed: true,
};
const kickstart30: DeficitChoice = { pct: 30, basis: 'kickstart' };
const ZONE = 'Pacific/Auckland';
/** A weigh-in at 07:00 New Zealand time (UTC+12 in June) on `date`. */
const weighIn = (date: string, kg: number, time = '07:00'): WeighIn => ({
  at: new Date(Date.parse(`${date}T${time}:00+12:00`)).toISOString(),
  timeZone: ZONE,
  kg,
});

describe('the day’s energy figure (WT-06, WT-07, HS-25, C50, C61, C108)', () => {
  it('WT-07, HS-25: a 13,000 kJ estimate with the 30% Kickstart deficit plans 9,100 kJ', () => {
    expect(dayEnergyFor(13_000, kickstart30, 5000)).toMatchObject({
      targetKj: 9100,
      clampedToFloor: false,
      estimateBelowFloor: false,
    });
  });

  it('WT-07, T1: the profile fixture’s 14,516 kJ rounds up to 10,162 kJ, never more than 30% below', () => {
    const { targetKj } = dayEnergyFor(14_516, kickstart30, 5000) as { targetKj: number };
    expect(targetKj).toBe(10_162);
    expect(targetKj).toBeGreaterThanOrEqual(14_516 * 0.7);
    expect(targetKj - 14_516 * 0.7).toBeLessThan(1);
  });

  it('WT-06, HS-25: never below the floor, which a stored value can raise but never lower', () => {
    expect(dayEnergyFor(6500, kickstart30, 5000)).toMatchObject({
      targetKj: 5000,
      clampedToFloor: true,
      estimateBelowFloor: false,
    });
    expect(dayEnergyFor(4652, kickstart30, 5000)).toMatchObject({
      targetKj: 5000,
      estimateBelowFloor: true,
    });
    expect(dayEnergyFor(6500, kickstart30, 6000)).toMatchObject({ targetKj: 6000, floorKj: 6000 });
    expect(dayEnergyFor(5500, { pct: 15, basis: 'steady' }, 6000)).toMatchObject({
      targetKj: 6000,
      clampedToFloor: true,
      estimateBelowFloor: true,
    });
    expect(dayEnergyFor(13_000, kickstart30, 3000)).toMatchObject({
      targetKj: 9100,
      floorKj: 5000,
    });
  });

  it('HS-25: a hand-built 50% deficit is treated as 30%, and the target rounds up to a whole kJ', () => {
    expect(dayEnergyFor(13_000, { pct: 50, basis: 'kickstart' }, 5000)).toMatchObject({
      targetKj: 9100,
    });
    expect(dayEnergyFor(12_345, kickstart30, 5000)).toMatchObject({ targetKj: 8642 });
  });

  it('WT-06: there is no protein input', () => {
    expectTypeOf(dayEnergyFor).parameters.toEqualTypeOf<[number, DeficitChoice, number]>();
  });

  it('U11, HS-25, HS-10, C50: every estimate, stored deficit and stored floor keeps the invariants', () => {
    const estimates = [
      1, 2500, 4999, 5000, 5001, 7142, 7143, 10_000, 13_000, 14_516, 40_000, 99_999,
    ];
    const kickstartPcts = [-5, 0, 1, 15, 29, 30, 31, 50, Number.NaN];
    const steadyPcts = [0, 14, 15, 17, 20, 21, Number.NaN];
    const floors = [-1, 0, 3000, 4999, 5000, 6000, 20_000, 99_999, Number.NaN];
    for (const figures of ['kickstart', 'steady'] as const) {
      for (const kickstartDeficitPct of kickstartPcts) {
        for (const steadyDeficitPct of steadyPcts) {
          const deficit = effectiveDeficit({
            figures,
            dietMode: 'keto',
            gates: open,
            stopSignPause: false,
            kickstartDeficitPct,
            steadyDeficitPct,
          });
          if (figures === 'kickstart') expect(deficit.pct).toBeLessThanOrEqual(30);
          else expect(deficit.pct).toBeGreaterThanOrEqual(STEADY_DEFICIT_PCT.min);
          expect(deficit.pct).toBeLessThanOrEqual(figures === 'kickstart' ? 30 : 20);
          for (const estimate of estimates) {
            for (const floor of floors) {
              const e = dayEnergyFor(estimate, deficit, floor);
              if (e.kind !== 'target') throw new Error('expected a target');
              const used = safeFloorKj(floor);
              expect(e.targetKj).toBeGreaterThanOrEqual(5000);
              expect(e.targetKj).toBeGreaterThanOrEqual(used);
              expect(e.targetKj).toBeGreaterThanOrEqual(estimate * 0.7);
              expect(e.targetKj).toBeLessThanOrEqual(Math.max(estimate, used));
              expect(Number.isInteger(e.targetKj)).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe('the deficit (WT-08, C56, C61; item 14 amendment)', () => {
  const deficit = (over: Partial<Parameters<typeof effectiveDeficit>[0]>) =>
    effectiveDeficit({
      figures: 'steady',
      dietMode: 'keto',
      gates: open,
      stopSignPause: false,
      kickstartDeficitPct: 30,
      steadyDeficitPct: 15,
      ...over,
    });

  it('WT-08: the Steady deficit always lies in 15–20%', () => {
    expect(deficit({})).toEqual({ pct: 15, basis: 'steady' });
    expect(deficit({ steadyDeficitPct: 25 })).toEqual({ pct: 20, basis: 'steady' });
    expect(deficit({ steadyDeficitPct: 10 })).toEqual({ pct: 15, basis: 'steady' });
  });

  it('the Kickstart deficit, capped at 30%, needs keto and every Kickstart gate open', () => {
    expect(deficit({ figures: 'kickstart' })).toEqual({ pct: 30, basis: 'kickstart' });
    expect(deficit({ figures: 'kickstart', kickstartDeficitPct: 45 })).toEqual({
      pct: 30,
      basis: 'kickstart',
    });
    // Answer 3 open (no prescriber agreement): Kickstart on time alone gives the Steady deficit.
    const q3Open = { ...open, kickstartAvailable: false, carbCeilingBelow50Allowed: false };
    expect(deficit({ figures: 'kickstart', gates: q3Open })).toEqual({ pct: 15, basis: 'steady' });
    expect(deficit({ figures: 'kickstart', dietMode: 'balanced' })).toEqual({
      pct: 15,
      basis: 'steady',
    });
  });

  it('RD-02, RD-04, U12: no deficit while readiness closes it, or while a stop-sign pauses Kickstart', () => {
    expect(deficit({ figures: 'kickstart', gates: { ...open, deficitAllowed: false } })).toEqual({
      pct: 0,
      basis: 'none-readiness',
    });
    expect(deficit({ figures: 'kickstart', stopSignPause: true })).toEqual({
      pct: 0,
      basis: 'none-stop-sign',
    });
  });

  it('stored figures are brought into range, and a value that is not a number takes the safe side', () => {
    expect([safeFloorKj(3000), safeFloorKj(25_000), safeFloorKj(Number.NaN)]).toEqual([
      5000, 20_000, 5000,
    ]);
    expect([safeKickstartDeficitPct(-5), safeKickstartDeficitPct(Number.NaN)]).toEqual([0, 0]);
    expect(safeSteadyDeficitPct(Number.NaN)).toBe(15);
    expect([safeKetoCeilingG(10), safeKetoCeilingG(Number.NaN)]).toEqual([20, 30]);
  });

  it('U6, T17: the option lists lie inside their limits, and the Kickstart list ends at 30', () => {
    expect(KICKSTART_DEFICIT_OPTIONS_PCT.at(-1)).toBe(30);
    expect(KICKSTART_DEFICIT_OPTIONS_PCT.every((p) => p >= 0 && p <= 30)).toBe(true);
    expect(STEADY_DEFICIT_OPTIONS_PCT).toEqual([15, 16, 17, 18, 19, 20]);
    expect(SAT_FAT_BUDGET_OPTIONS_PCT).toEqual([5, 6, 7, 8, 9, 10]);
    expect(SAT_FAT_BUDGET_OPTIONS_PCT.at(-1)).toBe(SAT_FAT_BUDGET_PCT.max);
  });
});

describe('the weight the rough guide uses (C24, T4; U4)', () => {
  const today = '2000-06-15';

  it('3 of the last 7 days give the 7-day average; two weigh-ins on one day count as one day', () => {
    const w = weightForEstimate(
      [
        weighIn('2000-06-13', 100),
        weighIn('2000-06-14', 99, '06:00'),
        weighIn('2000-06-14', 101, '20:00'),
        weighIn('2000-06-15', 103),
      ],
      today,
    );
    expect(w).toEqual({
      kg: 101,
      basis: 'seven-day-average',
      date: today,
      at: null,
      timeZone: null,
    });
  });

  it('T4: the onboarding 100 kg plus a 75 kg typed today gives 100 kg, the highest of the week', () => {
    const w = weightForEstimate([weighIn('2000-06-13', 100), weighIn('2000-06-15', 75)], today);
    expect(w).toMatchObject({ kg: 100, basis: 'highest-recent', date: '2000-06-13' });
    expect(weightForEstimate([weighIn('2000-06-13', 100)], today)).toMatchObject({
      kg: 100,
      basis: 'highest-recent',
    });
  });

  it('a tie on the highest takes the later; a weigh-in dated tomorrow is ignored', () => {
    expect(
      weightForEstimate([weighIn('2000-06-12', 90), weighIn('2000-06-14', 90)], today),
    ).toMatchObject({ date: '2000-06-14' });
    expect(
      weightForEstimate([weighIn('2000-06-16', 120), weighIn('2000-06-14', 90)], today),
    ).toMatchObject({ kg: 90 });
  });

  it('with nothing in the last 7 days, the latest older one; stale only after 14 days', () => {
    const tenDays = weightForEstimate(
      [weighIn('2000-06-01', 80), weighIn('2000-06-05', 82)],
      today,
    );
    expect(tenDays).toMatchObject({ kg: 82, basis: 'latest-older', date: '2000-06-05' });
    expect(weightIsStale(tenDays, today)).toBe(false);
    expect(weightIsStale(weightForEstimate([weighIn('2000-06-01', 80)], today), today)).toBe(false);
    expect(weightIsStale(weightForEstimate([weighIn('2000-05-31', 80)], today), today)).toBe(true);
    expect(weightForEstimate([], today)).toBeNull();
  });

  it('a tie on time in the latest older weigh-ins takes the heavier', () => {
    const at = weighIn('2000-06-01', 80);
    expect(weightForEstimate([at, { ...at, kg: 81 }], today)).toMatchObject({ kg: 81 });
  });
});

describe('the rough guide (C24, C25, T2, T3, T8; U5, U6)', () => {
  const male = {
    energyEstimateAvailable: true,
    heightCm: 185,
    birthYear: 1969,
    sex: 'male',
    activity: 'active-job',
    weight: { kg: 100, basis: 'seven-day-average', date: '2000-06-15', at: null, timeZone: null },
    today: '2000-06-15',
  } as const;

  it('WT-07 fixture: 100 kg, 185 cm, born 1969, active job → 3,469 kcal and 14,516 kJ at the minimum age, 30', () => {
    expect(energyEstimateFor(male)).toMatchObject({
      available: true,
      kcal: 3469,
      kj: 14_516,
      label: 'rough guide',
      ageYears: 30,
    });
  });

  it('no sex uses the midpoint; an unknown stored activity uses the default', () => {
    const midpoint = energyEstimateFor({ ...male, sex: null });
    expect(midpoint).toMatchObject({ available: true, sex: 'unspecified' });
    expect(energyEstimateFor({ ...male, activity: 'active_job' })).toMatchObject({
      kj: 14_516,
      activity: 'active-job',
    });
  });

  it.each([
    [{ energyEstimateAvailable: false }, 'not-estimated'],
    [{ birthYear: 2001 }, 'not-estimated'],
    [{ birthYear: 1983 }, 'not-estimated'],
    [{ birthYear: 1899 }, 'age-out-of-range'],
    [{ birthYear: null }, 'missing-birth-year'],
    [{ heightCm: null }, 'missing-height'],
    [{ heightCm: 110 }, 'height-out-of-range'],
    [{ weight: null }, 'missing-weight'],
    [{ weight: { ...male.weight, kg: 25 } }, 'weight-out-of-range'],
    [{ weight: { ...male.weight, kg: 380 } }, 'weight-out-of-range'],
  ] as const)('%j gives no rough guide: %s (never thrown)', (over, reason) => {
    expect(energyEstimateFor({ ...male, ...over })).toEqual({ available: false, reason });
  });

  it('ESTIMATE_LIMITS are the bounds the equation enforces, probed on both sides', () => {
    const base = {
      weightKg: 100,
      heightCm: 185,
      ageYears: 30,
      sex: 'male',
      activity: 'moderate',
    } as const;
    const probes = [
      ['weightKg', ESTIMATE_LIMITS.weightKg],
      ['heightCm', ESTIMATE_LIMITS.heightCm],
      ['ageYears', ESTIMATE_LIMITS.ageYears],
    ] as const;
    for (const [key, [min, max]] of probes) {
      expect(() => restingEnergyKcal({ ...base, [key]: min })).not.toThrow();
      expect(() => restingEnergyKcal({ ...base, [key]: max })).not.toThrow();
      expect(() => restingEnergyKcal({ ...base, [key]: min - 0.01 })).toThrow(RangeError);
      expect(() => restingEnergyKcal({ ...base, [key]: max + 0.01 })).toThrow(RangeError);
    }
  });
});

describe('the floor check for planned days (HS-10, NU-06, C31, C108, T28; U13)', () => {
  it('HS-10: the planner’s own days below the floor are refused, at 4,999 but not at 5,000', () => {
    expect(floorCheck(4000, 5000)).toEqual({ ok: false, reason: 'below-floor', floorKj: 5000 });
    expect(floorCheck(4999, 5000, 'auto-fill').ok).toBe(false);
    expect(floorCheck(5000, 5000, 'auto-fill')).toEqual({
      ok: true,
      belowFloor: false,
      floorKj: 5000,
    });
  });

  it('NU-06: every app-made write kind and any unknown kind is refused; only the owner’s own meal warns', () => {
    for (const kind of ['copy', 'template', 'repeat', 'suggested-swap'] as const) {
      expect(floorCheck(4000, 5000, kind).ok).toBe(false);
    }
    expect(floorCheck(4000, 5000, 'owner-meal')).toEqual({
      ok: true,
      belowFloor: true,
      floorKj: 5000,
    });
    expect(floorCheck(4000, 5000, 'manual' as PlanWriteKind).ok).toBe(false);
  });

  it('C50, C108: a raised floor applies; a stored floor below 5,000 or not a number still refuses 4,000', () => {
    expect(floorCheck(5500, 6000, 'auto-fill')).toMatchObject({ ok: false, floorKj: 6000 });
    expect(floorCheck(4000, 3000, 'auto-fill')).toMatchObject({ ok: false, floorKj: 5000 });
    expect(floorCheck(4000, Number.NaN, 'auto-fill').ok).toBe(false);
    expect(() => floorCheck(Number.NaN, 5000)).toThrow(RangeError);
    expect(() => floorCheck(-1, 5000)).toThrow(RangeError);
  });
});

describe('the figures the meal checks and the planner use (C10, C29, T3; U14, U29)', () => {
  const target = dayEnergyFor(13_000, kickstart30, 5000);
  const noGuide = (reason: 'missing-height' | 'not-estimated', floor = 5000): DayEnergy =>
    noEstimateEnergy(reason, floor);

  it('C10: the meal check uses the day’s target; with no rough guide it gets null, never the floor', () => {
    expect(energyForMealChecks(target)).toBe(9100);
    expect(5200).toBeLessThan(energyForMealChecks(target) ?? 0);
    expect(energyForMealChecks(noGuide('missing-height'))).toBeNull();
  });

  it('T3: the planner aims at the target; with no guide it has no aim, never 5,000 or a raised 6,000', () => {
    expect(plannerEnergyAim(target)).toEqual({ kind: 'aim', kj: 9100 });
    expect(plannerEnergyAim(noGuide('not-estimated'))).toEqual({
      kind: 'none',
      reason: 'not-estimated',
    });
    expect(plannerEnergyAim(noGuide('missing-height', 6000))).toEqual({
      kind: 'none',
      reason: 'needs-guide',
    });
  });
});
