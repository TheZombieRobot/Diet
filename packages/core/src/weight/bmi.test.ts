import { describe, expect, it } from 'vitest';
import { bmiFloorKg, isLowWeight, meetsBmiFloor, toTenths } from './bmi';

describe('the BMI 18.5 floor (U20; HS-01 floor part, C04)', () => {
  it('floors for synthetic heights', () => {
    expect(bmiFloorKg(200)).toBe(74);
    expect(bmiFloorKg(175)).toBe(56.65625);
    expect(bmiFloorKg(160)).toBeCloseTo(47.36, 10);
    expect(() => bmiFloorKg(119.9)).toThrow(RangeError);
    expect(() => bmiFloorKg(230.1)).toThrow(RangeError);
  });

  it('meets the floor at or above it, in whole tenths', () => {
    expect(meetsBmiFloor(74.0, 200)).toBe(true);
    expect(meetsBmiFloor(73.9, 200)).toBe(false);
    expect(meetsBmiFloor(56.7, 175)).toBe(true);
    expect(meetsBmiFloor(56.6, 175)).toBe(false);
    expect(meetsBmiFloor(47.4, 160)).toBe(true);
    expect(meetsBmiFloor(47.3, 160)).toBe(false);
  });

  it('a value already in tenths is exact; anything finer rounds the weight down and the height up', () => {
    expect(toTenths(64.1, 'down')).toBe(641);
    expect(toTenths(64.1, 'up')).toBe(641);
    expect(toTenths(56.651, 'down')).toBe(566);
    expect(toTenths(175.01, 'up')).toBe(1751);
  });

  it('isLowWeight needs both values and a height in range (HS-35)', () => {
    expect(isLowWeight(56.6, 175)).toBe(true);
    expect(isLowWeight(56.7, 175)).toBe(false);
    expect(isLowWeight(73.9, 200)).toBe(true);
    expect(isLowWeight(74.0, 200)).toBe(false);
    expect(isLowWeight(null, 175)).toBe(false);
    expect(isLowWeight(60, null)).toBe(false);
    expect(isLowWeight(30, 250)).toBe(false);
  });
});
