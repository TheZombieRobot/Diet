import { describe, expect, it } from 'vitest';
import type { TargetsRecord } from '../storage/records';
import type { Phase } from './phase';
import {
  effectiveFastingPreset,
  kickstartStartPresetChange,
  kickstartStartUses231,
  presetMoveDue,
} from './presets';

type Preset = Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'>;
const kickstartDefault: Preset = {
  fastingPreset: '23:1',
  eatingWindow: { start: '18:00', end: '19:00' },
  presetChosenBy: 'kickstart-default',
};
const untouched: Preset = {
  fastingPreset: '22:2',
  eatingWindow: { start: '17:00', end: '19:00' },
  presetChosenBy: 'default',
};
const user231: Preset = { ...kickstartDefault, presetChosenBy: 'user' };
const user186: Preset = {
  fastingPreset: '18:6',
  eatingWindow: { start: '13:00', end: '19:00' },
  presetChosenBy: 'user',
};
const none: Preset = { fastingPreset: null, eatingWindow: null, presetChosenBy: null };

const open = { fastingGated: false, pharmacistReminder: false };
const steady: Phase = { kind: 'steady', lastKickstartEnd: '2000-02-21' };
const kickstart: Phase = {
  kind: 'kickstart',
  periodId: 'p',
  day: 10,
  week: 2,
  weeks: 3,
  extensionsInPeriod: 0,
  scheduledLastDay: '2000-02-21',
  dayKind: 'exempt',
};

describe('the fasting preset and Kickstart (C55, C07, WT-08)', () => {
  it('an untouched 23:1 Kickstart default reads as 22:2, 17:00–19:00, whenever no Kickstart runs', () => {
    expect(effectiveFastingPreset(kickstartDefault, true, open)).toEqual(kickstartDefault);
    expect(effectiveFastingPreset(kickstartDefault, false, open)).toEqual(untouched);
    for (const stored of [user231, user186, none]) {
      expect(effectiveFastingPreset(stored, false, open)).toEqual(stored);
      expect(effectiveFastingPreset(stored, true, open)).toEqual(stored);
    }
  });

  it('C07: while answer 4 applies, a stored Kickstart default is never used as 23:1, even during Kickstart', () => {
    const answer4 = { pharmacistReminder: true };
    expect(effectiveFastingPreset(kickstartDefault, true, answer4)).toEqual(untouched);
    expect(effectiveFastingPreset(user231, true, answer4)).toEqual(user231);
  });

  it('a Kickstart start moves only an untouched default to the 23:1 Kickstart default', () => {
    expect(kickstartStartPresetChange(untouched, open)).toEqual(kickstartDefault);
    expect(kickstartStartPresetChange(kickstartDefault, open)).toBeNull();
    expect(kickstartStartPresetChange(user186, open)).toBeNull();
    expect(kickstartStartPresetChange(none, open)).toBeNull();
    expect(kickstartStartPresetChange(untouched, { ...open, fastingGated: true })).toBeNull();
  });

  it('C07: a start never moves answer 4’s owner to one meal a day, nor uses their stored 23:1 Kickstart default', () => {
    const answer4 = { fastingGated: false, pharmacistReminder: true };
    expect(kickstartStartPresetChange(untouched, answer4)).toBeNull();
    expect(kickstartStartUses231(untouched, answer4)).toBe(false);
    expect(kickstartStartUses231(untouched, open)).toBe(true);
    expect(kickstartStartUses231(kickstartDefault, answer4)).toBe(false);
    expect(kickstartStartUses231(kickstartDefault, open)).toBe(true);
  });

  const due = (over: Partial<Parameters<typeof presetMoveDue>[0]>) =>
    presetMoveDue({
      targets: kickstartDefault,
      phase: steady,
      fastingGated: false,
      pharmacistReminder: false,
      onboardingCompleted: true,
      ...over,
    });

  it('outside Kickstart the stored 23:1 Kickstart default moves to 22:2, whatever any card says', () => {
    expect(due({})).toEqual(untouched);
    expect(due({ phase: { kind: 'none' } })).toEqual(untouched);
    expect(due({ phase: kickstart })).toBeNull();
    expect(due({ fastingGated: true })).toBeNull();
    expect(due({ onboardingCompleted: false })).toBeNull();
    expect(due({ targets: user231 })).toBeNull();
  });

  it('C07: while answer 4 applies it moves during Kickstart too, so a later "no" never brings 23:1 back unasked', () => {
    expect(due({ phase: kickstart, pharmacistReminder: true })).toEqual(untouched);
    expect(due({ phase: kickstart, pharmacistReminder: true, targets: user231 })).toBeNull();
    expect(due({ phase: kickstart, pharmacistReminder: true, fastingGated: true })).toBeNull();
  });
});
