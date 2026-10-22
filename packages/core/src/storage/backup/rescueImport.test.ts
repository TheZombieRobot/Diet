// The safety settings a rescue import writes (health-rules review; orchestrator ruling): never
// less cautious than the phone or the file had.
import { describe, expect, it } from 'vitest';
import { defaultProfile, defaultSettings, defaultTargets } from '../defaults';
import type { ProfileRecord, SettingsRecord, TargetsRecord } from '../records';
import { cautiousSafetyMerge, SAFETY_SETTING_FIELDS, type SafetySide } from './rescueImport';

const AT = '2000-01-01T00:00:00.000Z';
const side = (
  targets: Partial<TargetsRecord> = {},
  settings: Partial<SettingsRecord> = {},
  profile: Partial<ProfileRecord> = {},
): SafetySide => ({
  profile: { ...defaultProfile(AT), ...profile },
  targets: { ...defaultTargets(AT), ...targets },
  settings: { ...defaultSettings(), ...settings },
});

describe('cautiousSafetyMerge (health-rules review)', () => {
  it('keeps the phone’s value where it is the more cautious one, and lists it', () => {
    const file = side();
    const phone = side(
      {
        energyFloorKj: 8000,
        kickstartDeficitPct: 20,
        steadyDeficitPct: 15,
        saturatedFatBudgetPct: 7,
      },
      {
        rapidLossThresholdGPerWeek: 750,
        rapidLossConsecutiveWeeks: 2,
        rapidLossExplanationReadAt: '2000-01-05T00:00:00.000Z',
        alcoholGuidanceSet: 'nz-women',
      },
    );
    const merged = cautiousSafetyMerge(file, phone);
    expect(merged.targets).toMatchObject({
      energyFloorKj: 8000,
      kickstartDeficitPct: 20,
      steadyDeficitPct: 15,
      saturatedFatBudgetPct: 7,
    });
    expect(merged.settings).toMatchObject({
      rapidLossThresholdGPerWeek: 750,
      rapidLossConsecutiveWeeks: 2,
      rapidLossExplanationReadAt: '2000-01-05T00:00:00.000Z',
      alcoholGuidanceSet: 'nz-women',
    });
    expect(merged.kept.map((k) => k.field).sort()).toEqual([
      'alcoholGuidanceSet',
      'energyFloorKj',
      'kickstartDeficitPct',
      'rapidLossConsecutiveWeeks',
      'rapidLossThresholdGPerWeek',
      'saturatedFatBudgetPct',
    ]);
  });

  it('keeps the file’s value where the file is the more cautious one, and lists nothing', () => {
    const file = side(
      { energyFloorKj: 8000, kickstartDeficitPct: 10, saturatedFatBudgetPct: 5 },
      {
        rapidLossThresholdGPerWeek: 750,
        rapidLossConsecutiveWeeks: 2,
        rapidLossExplanationReadAt: '2000-01-03T00:00:00.000Z',
      },
    );
    const phone = side({ steadyDeficitPct: 20 }, { alcoholGuidanceSet: 'nz-men' });
    const merged = cautiousSafetyMerge(file, phone);
    expect(merged.targets).toEqual(file.targets);
    expect(merged.settings).toEqual(file.settings);
    expect(merged.kept).toEqual([]);
  });

  it('the result is never less cautious than either side, for any pair of allowed values', () => {
    const floors = [5000, 6500, 20000];
    const deficits = [0, 15, 30];
    const thresholds = [750, 900, 1000];
    const weeks = [2, 3] as const;
    for (const a of floors) {
      for (const b of deficits) {
        for (const c of thresholds) {
          for (const w of weeks) {
            const file = side(
              { energyFloorKj: a, kickstartDeficitPct: b },
              {
                rapidLossThresholdGPerWeek: c,
                rapidLossConsecutiveWeeks: w,
                rapidLossExplanationReadAt: AT,
              },
            );
            const phone = side(
              { energyFloorKj: 25000 - a, kickstartDeficitPct: 30 - b },
              {
                rapidLossThresholdGPerWeek: 1750 - c,
                rapidLossConsecutiveWeeks: w === 2 ? 3 : 2,
                rapidLossExplanationReadAt: AT,
              },
            );
            const { targets, settings } = cautiousSafetyMerge(file, phone);
            expect(targets.energyFloorKj).toBe(Math.max(a, 25000 - a));
            expect(targets.kickstartDeficitPct).toBe(Math.min(b, 30 - b));
            expect(settings.rapidLossThresholdGPerWeek).toBe(Math.min(c, 1750 - c));
            expect(settings.rapidLossConsecutiveWeeks).toBe(2);
            expect(settings.rapidLossExplanationReadAt).toBe(AT);
          }
        }
      }
    }
  });

  it('names the safety settings of section 10.6 step 8, with the diet mode and alcohol figures', () => {
    expect(SAFETY_SETTING_FIELDS.targets).toContain('energyFloorKj');
    expect(SAFETY_SETTING_FIELDS.settings).toContain('rapidLossThresholdGPerWeek');
    expect(SAFETY_SETTING_FIELDS.settings).toContain('alcoholGuidanceSet');
    expect(SAFETY_SETTING_FIELDS.profile).toEqual(['dietMode']);
  });

  it('a damaged phone value is ignored, never read as 0: the file\u2019s value stays and nothing is listed', () => {
    const file = side(
      { kickstartDeficitPct: 20, steadyDeficitPct: 18 },
      {
        rapidLossThresholdGPerWeek: 800,
        rapidLossConsecutiveWeeks: 2,
        rapidLossExplanationReadAt: AT,
      },
    );
    const phone = side();
    const damaged = {
      targets: { ...phone.targets } as Record<string, unknown>,
      settings: { ...phone.settings } as Record<string, unknown>,
    };
    delete damaged.targets['steadyDeficitPct'];
    Object.assign(damaged.targets, { kickstartDeficitPct: -5, energyFloorKj: 25000 });
    delete damaged.settings['rapidLossThresholdGPerWeek'];
    Object.assign(damaged.settings, { alcoholGuidanceSet: 'nz-woman' });
    const merged = cautiousSafetyMerge(file, {
      ...phone,
      targets: damaged.targets as unknown as TargetsRecord,
      settings: damaged.settings as unknown as SettingsRecord,
    });
    expect(merged.targets).toEqual(file.targets);
    expect(merged.settings).toEqual(file.settings);
    expect(merged.kept).toEqual([]);
  });

  it('the phone\u2019s rapid-loss bounds count only with a valid explanation time that allows them', () => {
    const file = side();
    const phone = side(
      {},
      {
        rapidLossThresholdGPerWeek: 750,
        rapidLossConsecutiveWeeks: 2,
        rapidLossExplanationReadAt: 'not a time',
      },
    );
    const merged = cautiousSafetyMerge(file, phone);
    expect(merged.settings).toEqual(file.settings);
    expect(merged.kept).toEqual([]);
  });

  it('keeps every allergen either side lists (the cautious allergen merge), and lists that when the phone added any', () => {
    const file = side({}, {}, { allergens: ['peanut'] });
    const phone = side({}, {}, { allergens: ['gluten', 'peanut', 'example-unknown' as never] });
    const merged = cautiousSafetyMerge(file, phone);
    expect(merged.profile.allergens).toEqual(['peanut', 'gluten']);
    expect(merged.kept).toEqual([{ table: 'profile', field: 'allergens' }]);
    expect(cautiousSafetyMerge(file, side()).kept).toEqual([]);
  });
});
