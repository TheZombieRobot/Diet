import { describe, expect, it } from 'vitest';
import { effectiveProteinTargetG } from '../energy/protein';
import { checkGardenCrop, type GardenCropDraft, gardenCropDraftEmpty } from '../garden/cropForm';
import {
  checkEatingWindowForm,
  defaultSchedule,
  presetForWindow,
  scheduleChosenBy,
  scheduleDefaultFor,
  scheduleStart,
  setupScheduleReset,
  windowProblemFields,
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

  it('C07 / E49: with answer 4 there is no default, so whatever the owner saves is their own', () => {
    expect(scheduleDefaultFor({ pharmacistReminder: false, kickstartChosen: true })).toEqual(
      defaultSchedule(true),
    );
    expect(scheduleDefaultFor({ pharmacistReminder: true, kickstartChosen: true })).toBeNull();
    const kick = defaultSchedule(true);
    const storedKick = { ...kick, preset: '23:1' as const };
    expect(scheduleChosenBy(kick, null, null)).toBe('user');
    expect(scheduleChosenBy(storedKick, null, storedKick)).toBe('user');
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
    expect(windowProblemFields('', '19:00', 'invalid-time')).toEqual(['start']);
    expect(windowProblemFields('17:00', '7pm', 'invalid-time')).toEqual(['end']);
    expect(windowProblemFields('18:00', '18:00', 'same-time')).toEqual(['start', 'end']);
    expect(windowProblemFields('18:00', '18:30', 'too-short')).toEqual(['start', 'end']);
  });
});

describe('where the schedule starts, and when setup clears it (U33; C07, C55, E49, E50, E52)', () => {
  const none = { fastingPreset: null, eatingWindow: null, presetChosenBy: null } as const;

  it('scheduleStart: stored, "none" once confirmed with nothing, nothing chosen with answer 4, else the default', () => {
    const stored = {
      fastingPreset: '18:6',
      eatingWindow: { start: '13:00', end: '19:00' },
      presetChosenBy: 'user',
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
    // A Kickstart default the app chose before answer 4 turned yes is not offered as chosen.
    const kickstartDefault = {
      fastingPreset: '23:1',
      eatingWindow: { start: '18:00', end: '19:00' },
      presetChosenBy: 'kickstart-default',
    } as const;
    const fromKickstartDefault = (pharmacistReminder: boolean) =>
      scheduleStart({
        stored: kickstartDefault,
        scheduleConfirmed: true,
        pharmacistReminder,
        kickstartChosen: true,
      });
    expect(fromKickstartDefault(true)).toEqual({ choice: null, window: null });
    expect(fromKickstartDefault(false)).toEqual({
      choice: '23:1',
      window: { start: '18:00', end: '19:00' },
    });
  });

  it('setupScheduleReset', () => {
    const during = {
      onboardingCompleted: false,
      fastingGated: false,
      pharmacistReminder: false,
      kickstartChosen: true,
    };
    const kick = { fastingPreset: '23:1', presetChosenBy: 'kickstart-default' } as const;
    const plain = { fastingPreset: '22:2', presetChosenBy: 'default' } as const;
    const user = { fastingPreset: '18:6', presetChosenBy: 'user' } as const;
    expect(setupScheduleReset(user, { ...during, fastingGated: true })).toBe(true);
    expect(setupScheduleReset(user, during)).toBe(false);
    expect(setupScheduleReset(kick, { ...during, kickstartChosen: false })).toBe(true);
    expect(setupScheduleReset(plain, during)).toBe(true);
    expect(setupScheduleReset(kick, during)).toBe(false);
    // Answer 4 turned yes after the step: a default the app chose is asked for again (C07, E49).
    const answer4 = { ...during, pharmacistReminder: true };
    expect(setupScheduleReset(kick, answer4)).toBe(true);
    expect(setupScheduleReset(plain, { ...answer4, kickstartChosen: false })).toBe(true);
    expect(setupScheduleReset(user, answer4)).toBe(false);
    expect(setupScheduleReset(kick, { ...answer4, onboardingCompleted: true })).toBe(false);
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
        // Item 19's fields, null when the setup step leaves them out.
        ingredientId: null,
        name: 'Spinach',
        amount: null,
        unit: null,
        gramsPerUnit: null,
        harvestReady: true,
        harvestedAt: null,
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

  it('a form counts as empty only with nothing typed and no unit chosen (E24)', () => {
    const empty = { name: ' ', amount: '', unit: null, harvestReady: false, keepsDays: '' };
    expect(gardenCropDraftEmpty(empty)).toBe(true);
    for (const typed of [{ name: 'Kale' }, { amount: '2' }, { keepsDays: '3' }, { unit: 'g' }]) {
      expect(gardenCropDraftEmpty({ ...empty, ...typed } as GardenCropDraft)).toBe(false);
    }
  });
});
