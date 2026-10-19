import { describe, expect, it } from 'vitest';
import { effectiveProteinTargetG } from '../energy/protein';
import { checkGardenCrop, type GardenCropDraft } from '../garden/cropForm';
import {
  checkEatingWindowForm,
  defaultSchedule,
  presetForWindow,
  scheduleChosenBy,
  scheduleStart,
  setupScheduleReset,
} from './schedule';

describe('the default pattern and who chose it (U27; C55, E19, E20)', () => {
  it('23:1 18:00–19:00 for Kickstart, otherwise 22:2 17:00–19:00', () => {
    expect(defaultSchedule(true)).toEqual({
      preset: '23:1',
      window: { start: '18:00', end: '19:00' },
      chosenBy: 'kickstart-default',
    });
    expect(defaultSchedule(false)).toEqual({
      preset: '22:2',
      window: { start: '17:00', end: '19:00' },
      chosenBy: 'default',
    });
  });

  it('moving the times keeps the preset only while the length matches', () => {
    expect(presetForWindow('23:1', { start: '17:30', end: '18:30' })).toBe('23:1');
    expect(presetForWindow('22:2', { start: '17:00', end: '19:30' })).toBe('custom');
    expect(presetForWindow('22:2', { start: '17:00', end: '17:00' })).toBe('custom');
  });

  it("the untouched default stays a default; changed times are the user's; an unchanged stored value is kept", () => {
    const kick = defaultSchedule(true);
    expect(scheduleChosenBy(kick, kick, null)).toBe('kickstart-default');
    expect(
      scheduleChosenBy({ preset: '23:1', window: { start: '17:30', end: '18:30' } }, kick, null),
    ).toBe('user');
    const storedUser = {
      preset: '18:6',
      window: { start: '13:00', end: '19:00' },
      chosenBy: 'user',
    } as const;
    expect(scheduleChosenBy(storedUser, defaultSchedule(false), storedUser)).toBe('user');
    const storedDefault = { ...defaultSchedule(false), preset: '22:2' as const };
    expect(scheduleChosenBy(storedDefault, kick, storedDefault)).toBe('default');
  });

  it('time field errors', () => {
    expect(checkEatingWindowForm('17:00', '19:00')).toEqual({
      ok: true,
      window: { start: '17:00', end: '19:00' },
    });
    expect(checkEatingWindowForm('7pm', '19:00')).toEqual({ ok: false, problem: 'invalid-time' });
    expect(checkEatingWindowForm('', '19:00')).toEqual({ ok: false, problem: 'invalid-time' });
    expect(checkEatingWindowForm('18:00', '18:00')).toEqual({ ok: false, problem: 'same-time' });
    expect(checkEatingWindowForm('18:00', '18:30')).toEqual({ ok: false, problem: 'too-short' });
  });
});

describe('where the schedule starts, and when setup clears it (U33; C07, C55, E49, E50, E52)', () => {
  const none = { fastingPreset: null, eatingWindow: null } as const;

  it('scheduleStart: stored, "none" once confirmed with nothing, nothing chosen with answer 4, else the default', () => {
    const stored = {
      fastingPreset: '18:6',
      eatingWindow: { start: '13:00', end: '19:00' },
    } as const;
    expect(
      scheduleStart({
        stored,
        scheduleConfirmed: true,
        pharmacistReminder: true,
        kickstartChosen: true,
      }),
    ).toEqual({
      choice: '18:6',
      window: { start: '13:00', end: '19:00' },
    });
    expect(
      scheduleStart({
        stored: none,
        scheduleConfirmed: true,
        pharmacistReminder: false,
        kickstartChosen: true,
      }),
    ).toEqual({
      choice: 'none',
      window: null,
    });
    expect(
      scheduleStart({
        stored: none,
        scheduleConfirmed: false,
        pharmacistReminder: true,
        kickstartChosen: true,
      }),
    ).toEqual({
      choice: null,
      window: null,
    });
    expect(
      scheduleStart({
        stored: none,
        scheduleConfirmed: false,
        pharmacistReminder: false,
        kickstartChosen: true,
      }),
    ).toEqual({
      choice: '23:1',
      window: { start: '18:00', end: '19:00' },
    });
  });

  it('setupScheduleReset', () => {
    const during = { onboardingCompleted: false, fastingGated: false, kickstartChosen: true };
    const kick = { fastingPreset: '23:1', presetChosenBy: 'kickstart-default' } as const;
    const plain = { fastingPreset: '22:2', presetChosenBy: 'default' } as const;
    const user = { fastingPreset: '18:6', presetChosenBy: 'user' } as const;
    expect(setupScheduleReset(user, { ...during, fastingGated: true })).toBe(true);
    expect(setupScheduleReset(user, during)).toBe(false);
    expect(setupScheduleReset(kick, { ...during, kickstartChosen: false })).toBe(true);
    expect(setupScheduleReset(plain, during)).toBe(true);
    expect(setupScheduleReset(kick, during)).toBe(false);
    expect(
      setupScheduleReset(kick, { ...during, onboardingCompleted: true, fastingGated: true }),
    ).toBe(false);
    expect(
      setupScheduleReset(
        { fastingPreset: null, presetChosenBy: null },
        { ...during, fastingGated: true },
      ),
    ).toBe(false);
  });
});

describe('the Kickstart protein figure (U28; C65)', () => {
  it('the top of the range in Kickstart, the bottom in Steady', () => {
    expect(effectiveProteinTargetG('kickstart', { min: 120, max: 140 })).toBe(140);
    expect(effectiveProteinTargetG('steady', { min: 120, max: 140 })).toBe(120);
    expect(effectiveProteinTargetG('kickstart', { min: 90, max: 110 })).toBe(110);
    expect(effectiveProteinTargetG('steady', { min: 90, max: 110 })).toBe(90);
    expect(() => effectiveProteinTargetG('steady', { min: 140, max: 120 })).toThrow(RangeError);
  });
});

describe('the add-a-crop form (U29; C57)', () => {
  const draft: GardenCropDraft = {
    name: ' Spinach ',
    amount: '',
    unit: 'g',
    harvestReady: true,
    keepsDays: '',
  };

  it('an empty amount claims no weight, whatever unit is chosen', () => {
    expect(checkGardenCrop(draft)).toEqual({
      ok: true,
      value: {
        name: 'Spinach',
        amount: null,
        unit: null,
        harvestReady: true,
        perishabilityDays: null,
      },
    });
  });

  it('an amount needs a unit; 0 and 100,001 are refused; keeps is whole days 0–365', () => {
    expect(checkGardenCrop({ ...draft, amount: '2', unit: null })).toEqual({
      ok: false,
      problems: { unit: 'required' },
    });
    expect(checkGardenCrop({ ...draft, amount: '0' })).toMatchObject({
      problems: { amount: 'range' },
    });
    expect(checkGardenCrop({ ...draft, amount: '100001' })).toMatchObject({
      problems: { amount: 'range' },
    });
    expect(checkGardenCrop({ ...draft, amount: 'lots' })).toMatchObject({
      problems: { amount: 'not-a-number' },
    });
    expect(checkGardenCrop({ ...draft, keepsDays: '365' }).ok).toBe(true);
    expect(checkGardenCrop({ ...draft, keepsDays: '0' }).ok).toBe(true);
    expect(checkGardenCrop({ ...draft, keepsDays: '366' })).toMatchObject({
      problems: { keepsDays: 'range' },
    });
    expect(checkGardenCrop({ ...draft, keepsDays: '2.5' })).toMatchObject({
      problems: { keepsDays: 'range' },
    });
    expect(checkGardenCrop({ ...draft, name: '  ' })).toMatchObject({
      problems: { name: 'required' },
    });
    expect(checkGardenCrop({ ...draft, name: 'x'.repeat(61) })).toMatchObject({
      problems: { name: 'length' },
    });
  });
});
