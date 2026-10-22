import { describe, expect, it } from 'vitest';
import type { PlanWriteKind } from '../targets/energy';
import { floorCheckWithUnknowns } from './floor';

describe('the planner floor with unknown energy (item 18 design 3.8)', () => {
  it('F17 HS-10 HS-25 NU-06 C108: an incomplete day below the floor is never written by the app', () => {
    for (const kind of ['auto-fill', 'copy', 'template', 'repeat', 'suggested-swap'] as const) {
      expect(floorCheckWithUnknowns(5500, true, 6000, kind), kind).toEqual({
        ok: false,
        reason: 'energy-not-known',
        floorKj: 6000,
      });
    }
    expect(floorCheckWithUnknowns(5500, true, 6000, 'owner-meal')).toEqual({
      ok: true,
      note: 'energy-not-known',
      floorKj: 6000,
    });
    // A stored floor below 5,000 kJ is never used.
    expect(floorCheckWithUnknowns(4000, true, 3000, 'auto-fill')).toMatchObject({ floorKj: 5000 });
    // A lower bound that already meets the floor can only be higher.
    expect(floorCheckWithUnknowns(5000, true, 5000, 'auto-fill')).toEqual({
      ok: true,
      note: null,
      floorKj: 5000,
    });
    expect(floorCheckWithUnknowns(4999.6, false, 5000, 'auto-fill')).toEqual({
      ok: false,
      reason: 'below-floor',
      floorKj: 5000,
    });
    expect(floorCheckWithUnknowns(4999.6, false, 5000, 'owner-meal')).toEqual({
      ok: true,
      note: 'below-floor',
      floorKj: 5000,
    });
    expect(floorCheckWithUnknowns(4000, true, 5000, 'manual' as PlanWriteKind)).toMatchObject({
      ok: false,
    });
    expect(() => floorCheckWithUnknowns(Number.NaN, true, 5000, 'owner-meal')).toThrow(RangeError);
  });
});
