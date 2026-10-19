import { describe, expect, it } from 'vitest';
import { FASTING_PRESETS } from '../fasting/eatingWindow';
import { maximumAgeFromBirthYear, minimumAgeFromBirthYear } from './age';
import { baseTargets, DEFAULT_PROTEIN_RANGE_G, type BaseTargetsInput } from './baseTargets';
import {
  ACTIVITY_FACTORS,
  DEFAULT_ACTIVITY_LEVEL,
  type EnergyInputs,
  estimatedDailyEnergy,
  restingEnergyKcal,
} from './energyEstimate';

describe('energy estimate: Mifflin-St Jeor × activity factor', () => {
  it('matches a hand calculation (male, 90 kg, 180 cm, 40 y, active job)', () => {
    // 10 × 90 + 6.25 × 180 − 5 × 40 + 5 = 1830 kcal; × 1.725 = 3156.75; × 4.184 = 13207.84 kJ
    const inputs = {
      weightKg: 90,
      heightCm: 180,
      ageYears: 40,
      sex: 'male',
      activity: 'active-job',
    } as const;
    expect(restingEnergyKcal(inputs)).toBe(1830);
    expect(estimatedDailyEnergy(inputs)).toEqual({ kcal: 3157, kj: 13208, label: 'rough guide' });
  });

  it('matches a hand calculation (female, 70 kg, 165 cm, 35 y, moderate)', () => {
    // 700 + 1031.25 − 175 − 161 = 1395.25 kcal; × 1.55 = 2162.64; × 4.184 = 9048.48 kJ
    const inputs = {
      weightKg: 70,
      heightCm: 165,
      ageYears: 35,
      sex: 'female',
      activity: 'moderate',
    } as const;
    expect(restingEnergyKcal(inputs)).toBe(1395.25);
    expect(estimatedDailyEnergy(inputs)).toEqual({ kcal: 2163, kj: 9048, label: 'rough guide' });
  });

  it("'unspecified' sex uses the midpoint of the male and female constants", () => {
    const base = { weightKg: 80, heightCm: 175, ageYears: 45, activity: 'active-job' } as const;
    const male = restingEnergyKcal({ ...base, sex: 'male' });
    const female = restingEnergyKcal({ ...base, sex: 'female' });
    expect(restingEnergyKcal({ ...base, sex: 'unspecified' })).toBe((male + female) / 2);
  });

  it('defaults to a physically active job (factor 1.725), never sedentary', () => {
    expect(DEFAULT_ACTIVITY_LEVEL).toBe('active-job');
    expect(ACTIVITY_FACTORS[DEFAULT_ACTIVITY_LEVEL]).toBe(1.725);
    expect(ACTIVITY_FACTORS).toEqual({
      sedentary: 1.2,
      moderate: 1.55,
      'active-job': 1.725,
      'very-active': 1.9,
    });
  });

  it.each([
    [{ weightKg: 0 }],
    [{ heightCm: 50 }],
    [{ ageYears: 17 }],
    [{ weightKg: Number.POSITIVE_INFINITY }],
  ])('rejects out-of-range input %j (no estimate under 18)', (patch) => {
    const inputs = {
      weightKg: 90,
      heightCm: 180,
      ageYears: 40,
      sex: 'male',
      activity: 'moderate',
      ...patch,
    } as const;
    expect(() => estimatedDailyEnergy(inputs)).toThrow(RangeError);
  });

  it.each([
    [{ sex: 'toString' }],
    [{ sex: 'constructor' }],
    [{ sex: undefined }],
    [{ sex: 'Male' }],
    [{ activity: 'active_job' }],
    [{ activity: 'toString' }],
    [{ activity: undefined }],
  ])('refuses an unknown sex or activity %j instead of returning NaN', (patch) => {
    const inputs = {
      weightKg: 90,
      heightCm: 180,
      ageYears: 40,
      sex: 'male',
      activity: 'moderate',
      ...patch,
    } as unknown as EnergyInputs;
    expect(() => estimatedDailyEnergy(inputs)).toThrow(RangeError);
    if ('sex' in patch) expect(() => restingEnergyKcal(inputs)).toThrow(RangeError);
  });
});

describe('age from the stored birth year (DATA_MODEL.md profile)', () => {
  it('is known only to within a year: youngest before the birthday, oldest after it', () => {
    expect(minimumAgeFromBirthYear(1981, '2026-10-19')).toBe(44);
    expect(maximumAgeFromBirthYear(1981, '2026-10-19')).toBe(45);
    expect(minimumAgeFromBirthYear(1981, '2026-01-01')).toBe(44);
    expect(maximumAgeFromBirthYear(1981, '2026-12-31')).toBe(45);
  });

  it('someone born 18 years ago this year may still be 17, so the minimum is 17 (under-18 rule)', () => {
    expect(minimumAgeFromBirthYear(2008, '2026-10-19')).toBe(17);
    expect(maximumAgeFromBirthYear(2008, '2026-10-19')).toBe(18);
    expect(minimumAgeFromBirthYear(2007, '2026-10-19')).toBe(18);
  });

  it('is never negative for a baby born this year', () => {
    expect(minimumAgeFromBirthYear(2026, '2026-10-19')).toBe(0);
    expect(maximumAgeFromBirthYear(2026, '2026-10-19')).toBe(0);
  });

  it('refuses a future, fractional or implausible birth year, and a malformed date', () => {
    for (const birthYear of [2027, 1980.5, 1899, Number.NaN]) {
      expect(() => minimumAgeFromBirthYear(birthYear, '2026-10-19')).toThrow(RangeError);
      expect(() => maximumAgeFromBirthYear(birthYear, '2026-10-19')).toThrow(RangeError);
    }
    expect(() => minimumAgeFromBirthYear(1981, '19/10/2026')).toThrow(RangeError);
  });
});

describe('protein and energy targets are unchanged by the eating window (HS-22)', () => {
  const profile: BaseTargetsInput = {
    weightKg: 90,
    heightCm: 178,
    ageYears: 45,
    sex: 'male',
    activity: 'active-job',
    proteinRangeG: { ...DEFAULT_PROTEIN_RANGE_G },
  };

  it('every preset, a custom window and no window give identical targets', () => {
    const reference = baseTargets(profile);
    const windows = [
      ...FASTING_PRESETS.map((p) => p.window),
      { start: '06:30', end: '21:45' },
      undefined,
    ];
    for (const eatingWindow of windows) {
      expect(baseTargets({ ...profile, eatingWindow })).toEqual(reference);
    }
  });

  it('defaults protein to 120–140 g and rejects ranges outside 80–200 g', () => {
    expect(baseTargets(profile).proteinRangeG).toEqual({ min: 120, max: 140 });
    expect(() => baseTargets({ ...profile, proteinRangeG: { min: 60, max: 140 } })).toThrow(
      RangeError,
    );
    expect(() => baseTargets({ ...profile, proteinRangeG: { min: 150, max: 140 } })).toThrow(
      RangeError,
    );
    expect(() => baseTargets({ ...profile, proteinRangeG: { min: 120, max: 210 } })).toThrow(
      RangeError,
    );
  });
});
