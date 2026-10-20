import { describe, expect, it } from 'vitest';
import type { DietMode, NutrientKey } from '../storage/records';
import type { NetCarbCeiling } from '../targets/carbs';
import {
  type CarbStyleView,
  carbStyleChip,
  carbStyleOf,
  carbStyleRank,
  plannerTieBreak,
  type TieBreakRecipe,
  usesKetoFirstWeek,
} from './carbStyle';
import { cholesterolScore } from './heartSmart';
import { SYNTHETIC_PER_100G } from './testData';

const style = (written: DietMode | null, carbsG: number, complete: boolean): CarbStyleView =>
  carbStyleOf({
    written,
    perServe: { ...SYNTHETIC_PER_100G, carbsG },
    unknownNutrients: complete ? [] : (['carbsG'] satisfies NutrientKey[]),
  });
const pick = (v: CarbStyleView) => [v.style, v.basis];

const CEILINGS: Readonly<Record<string, NetCarbCeiling>> = {
  kickstart: { kind: 'ceiling', grams: 20, basis: 'kickstart' },
  keto: { kind: 'ceiling', grams: 30, basis: 'keto' },
  held: { kind: 'ceiling', grams: 50, basis: 'keto-held-at-50' },
  moderate: { kind: 'ceiling', grams: 100, basis: 'moderate' },
  balanced: { kind: 'none', basis: 'balanced' },
  readiness: { kind: 'none', basis: 'readiness' },
};

describe('carb style (item 20)', () => {
  it('U13 P11: complete figures confirm or raise the written style; incomplete ones only raise it', () => {
    expect(pick(style('keto', 6, true))).toEqual(['keto', 'written']);
    expect(pick(style('keto', 12, true))).toEqual(['moderate-low-carb', 'figures']);
    expect(pick(style('balanced', 6, true))).toEqual(['balanced', 'written']);
    expect(pick(style(null, 40, true))).toEqual(['balanced', 'figures']);
    expect(pick(style('keto', 36, false))).toEqual(['balanced', 'figures']);
    expect(pick(style('keto', 12, false))).toEqual(['moderate-low-carb', 'figures']);
    expect(pick(style('balanced', 12, false))).toEqual(['balanced', 'written']);
    expect(pick(style('keto', 0, false))).toEqual(['keto', 'written']);
    expect(pick(style(null, 5, false))).toEqual([null, 'none']);
  });

  it('U7 HS-39: carbs not worked out never give a lower style, a bare chip, or keto for an owner copy', () => {
    const modes: readonly (DietMode | null)[] = ['keto', 'moderate-low-carb', 'balanced', null];
    const order = (m: DietMode | null) =>
      m === null ? -1 : ['keto', 'moderate-low-carb', 'balanced'].indexOf(m);
    for (const written of modes) {
      for (const carbs of [0, 5, 10, 10.5, 35, 36, 80]) {
        const v = style(written, carbs, false);
        if (written !== null && v.style !== null)
          expect(order(v.style)).toBeGreaterThanOrEqual(order(written));
        if (written === null) expect(v.style).not.toBe('keto');
        expect(carbStyleChip(v).kind).not.toBe('style');
      }
    }
    expect(carbStyleChip(style('keto', 0, false))).toEqual({ kind: 'written', style: 'keto' });
    expect(carbStyleChip(style('keto', 12, false))).toEqual({ kind: 'not-worked-out' });
    expect(carbStyleChip(style('keto', 6, true))).toEqual({ kind: 'style', style: 'keto' });
  });

  it('U13 P12 T31 HS-32 HS-33: only a Kickstart or keto ceiling prefers lower-carb styles', () => {
    for (const name of ['kickstart', 'keto'] as const) {
      const c = CEILINGS[name];
      if (c === undefined) throw new Error(name);
      expect(usesKetoFirstWeek(c)).toBe(true);
      expect([
        carbStyleRank('keto', c),
        carbStyleRank('moderate-low-carb', c),
        carbStyleRank('balanced', c),
        carbStyleRank(null, c),
      ]).toEqual([0, 1, 2, 2]);
    }
    for (const name of ['held', 'moderate', 'balanced', 'readiness'] as const) {
      const c = CEILINGS[name];
      if (c === undefined) throw new Error(name);
      expect(usesKetoFirstWeek(c)).toBe(false);
      for (const s of ['keto', 'moderate-low-carb', 'balanced', null] as const)
        expect(carbStyleRank(s, c)).toBe(0);
    }
    // @ts-expect-error -- a ceiling needs item 21's grams and basis, so none is built from the diet mode.
    const bare: NetCarbCeiling = { kind: 'ceiling' };
    expect(bare.kind).toBe('ceiling');
  });

  it('U13 P10 P12: the tie-break orders by style under keto only, then cholesterol score, then title', () => {
    const r = (title: string, s: DietMode, score: number): TieBreakRecipe => ({
      id: `seed:recipe-${title}`,
      title,
      carbStyle: { style: s },
      cholesterolScore: score,
    });
    const recipes = [
      r('a-balanced', 'balanced', 5),
      r('b-keto', 'keto', 0),
      r('c-unknown', 'keto', cholesterolScore({ kind: 'unknown', capG: 8 }, [])),
      r(
        'd-flagged',
        'keto',
        cholesterolScore({ kind: 'flagged', reasons: ['fatty-cut'], capG: 8 }, []),
      ),
      r('e-smart', 'keto', cholesterolScore({ kind: 'heart-smart', capG: 8 }, [])),
    ];
    const order = (c: NetCarbCeiling | undefined) => {
      if (c === undefined) throw new Error('ceiling');
      return [...recipes].sort(plannerTieBreak(c)).map((x) => x.title);
    };
    expect(order(CEILINGS['keto'])).toEqual([
      'e-smart',
      'b-keto',
      'c-unknown',
      'd-flagged',
      'a-balanced',
    ]);
    for (const name of ['held', 'moderate', 'balanced'] as const)
      expect(order(CEILINGS[name])).toEqual([
        'a-balanced',
        'e-smart',
        'b-keto',
        'c-unknown',
        'd-flagged',
      ]);
  });
});
