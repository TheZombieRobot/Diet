import { floorCheckWithUnknowns } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { energyNotKnownMessage } from './floorMessage';

describe('the planner message for unknown energy (item 18 design 3.8)', () => {
  it('K11 HS-10 C108: it names the floor the check used, and is silent for a known shortfall', () => {
    expect(energyNotKnownMessage(floorCheckWithUnknowns(5500, true, 6000, 'auto-fill'))).toBe(
      'The planner did not fill this day: the energy in some of its meals is not known yet, so it cannot check that the day reaches 6,000 kJ.',
    );
    expect(energyNotKnownMessage(floorCheckWithUnknowns(5500, true, 6000, 'owner-meal'))).toBe(
      "The energy in some of this day's meals is not known yet, so the app cannot check that the day reaches 6,000 kJ (about 1,430 kcal).",
    );
    expect(
      energyNotKnownMessage(floorCheckWithUnknowns(4000, false, 5000, 'auto-fill')),
    ).toBeNull();
    expect(energyNotKnownMessage(floorCheckWithUnknowns(6000, true, 5000, 'auto-fill'))).toBeNull();
  });
});
