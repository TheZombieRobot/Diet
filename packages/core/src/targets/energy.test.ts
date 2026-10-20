import { describe, expect, expectTypeOf, it } from 'vitest';
import type { PhaseGates } from '../weight/phase';
import {
  type DeficitChoice,
  dayEnergyFor,
  effectiveDeficit,
  floorCheck,
  type PlanWriteKind,
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

describe('the day’s energy figure (WT-06, WT-07, HS-25, C50, C108)', () => {
  it('WT-07, HS-25: a 13,000 kJ estimate with the 30% Kickstart deficit plans 9,100 kJ', () => {
    expect(dayEnergyFor(13_000, kickstart30, 5000)).toMatchObject({
      targetKj: 9100,
      clampedToFloor: false,
      estimateBelowFloor: false,
    });
  });

  it('WT-06, HS-25: never below the floor, which a stored value can raise but never lower', () => {
    expect(dayEnergyFor(6500, kickstart30, 5000)).toMatchObject({
      targetKj: 5000,
      clampedToFloor: true,
    });
    expect(dayEnergyFor(4800, { pct: 15, basis: 'steady' }, 5000)).toMatchObject({
      targetKj: 5000,
      estimateBelowFloor: true,
    });
    expect(dayEnergyFor(6500, kickstart30, 6000)).toMatchObject({ targetKj: 6000, floorKj: 6000 });
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

  it('no deficit while readiness closes it, or while a stop-sign pauses Kickstart', () => {
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
});

// Item 21's U13, added with floorCheck by item 18 (X8).
describe('the floor check for planned days (item 21 U13; HS-10, NU-06, C31, C108)', () => {
  it('HS-10: only the owner\u2019s own meal may go below the floor; every app write and any unknown kind is refused', () => {
    const refused = (floorKj: number) => ({ ok: false, reason: 'below-floor', floorKj });
    expect(floorCheck(4000, 5000)).toEqual(refused(5000));
    expect(floorCheck(4999, 5000, 'auto-fill')).toEqual(refused(5000));
    expect(floorCheck(5000, 5000, 'auto-fill')).toEqual({
      ok: true,
      belowFloor: false,
      floorKj: 5000,
    });
    for (const kind of ['copy', 'template', 'repeat', 'suggested-swap'] as const)
      expect(floorCheck(4000, 5000, kind), kind).toEqual(refused(5000));
    expect(floorCheck(4000, 5000, 'owner-meal')).toEqual({
      ok: true,
      belowFloor: true,
      floorKj: 5000,
    });
    expect(floorCheck(4000, 5000, 'manual' as PlanWriteKind)).toEqual(refused(5000));
    expect(floorCheck(5500, 6000, 'auto-fill')).toEqual(refused(6000));
    // Bypasses: a stored floor below 5,000 kJ, or not a number, still refuses 4,000 kJ.
    expect(floorCheck(4000, 3000, 'auto-fill')).toEqual(refused(5000));
    expect(floorCheck(4000, Number.NaN, 'auto-fill')).toEqual(refused(5000));
    expect(() => floorCheck(Number.POSITIVE_INFINITY, 5000)).toThrow(RangeError);
    expect(() => floorCheck(-1, 5000)).toThrow(RangeError);
  });
});
