// The safety settings a rescue import writes (health-rules review; orchestrator ruling): never
// less cautious than the phone or the file had.
import { describe, expect, it } from 'vitest';
import { defaultSettings, defaultTargets } from '../defaults';
import type { SettingsRecord, TargetsRecord } from '../records';
import { cautiousSafetyMerge, SAFETY_SETTING_FIELDS } from './rescueImport';

const AT = '2000-01-01T00:00:00.000Z';
const side = (
  targets: Partial<TargetsRecord> = {},
  settings: Partial<SettingsRecord> = {},
): { targets: TargetsRecord; settings: SettingsRecord } => ({
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

  it('names the safety settings of section 10.6 step 8', () => {
    expect(SAFETY_SETTING_FIELDS.targets).toContain('energyFloorKj');
    expect(SAFETY_SETTING_FIELDS.settings).toContain('rapidLossThresholdGPerWeek');
  });
});
