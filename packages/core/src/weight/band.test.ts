import { describe, expect, it } from 'vitest';
import {
  BAND_FRONT_LOAD_MAX_HOURS,
  BAND_KICKSTART_OFFSET_KG,
  BAND_OFFSET_DAYS,
  BAND_STEADY_KG_PER_WEEK,
  bandAnchor,
  bandEdgesAt,
  carbCeilingActive,
  CHART_BLOCK_DAYS,
  chartBlock,
  type PhaseSegment,
} from './band';

describe('the projection band (WT-10, HS-26, C27)', () => {
  it('its constants are the reviewed values (a change must be deliberate, STOP 17)', () => {
    expect({
      BAND_STEADY_KG_PER_WEEK,
      BAND_KICKSTART_OFFSET_KG,
      BAND_OFFSET_DAYS,
      BAND_FRONT_LOAD_MAX_HOURS,
      CHART_BLOCK_DAYS,
    }).toMatchInlineSnapshot(`
      {
        "BAND_FRONT_LOAD_MAX_HOURS": 24,
        "BAND_KICKSTART_OFFSET_KG": {
          "fast": 1.5,
          "slow": 1,
        },
        "BAND_OFFSET_DAYS": 14,
        "BAND_STEADY_KG_PER_WEEK": {
          "fast": 1,
          "slow": 0.5,
        },
        "CHART_BLOCK_DAYS": 28,
      }
    `);
  });

  it('front-loaded edges give the worked values from a 100.0 kg anchor', () => {
    const worked: [number, number, number][] = [
      [0, 100, 100],
      [7, 99, 98.25],
      [14, 98, 96.5],
      [21, 97.5, 95.5],
      [27, 97.0714285714, 94.6428571429],
    ];
    for (const [t, slow, fast] of worked) {
      const edges = bandEdgesAt(100, 'front-loaded', t, 1);
      expect(edges.slowKg).toBeCloseTo(slow, 9);
      expect(edges.fastKg).toBeCloseTo(fast, 9);
    }
  });

  it('linear edges follow the Steady pace, the fast edge capped at the check-in threshold and at 1 kg a week', () => {
    expect(bandEdgesAt(100, 'linear', 14, 1)).toEqual({ slowKg: 99, fastKg: 98 });
    expect(bandEdgesAt(100, 'linear', 14, 0.75)).toEqual({ slowKg: 99, fastKg: 98.5 });
    expect(bandEdgesAt(100, 'linear', 14, 1.2)).toEqual({ slowKg: 99, fastKg: 98 });
  });

  it('front-loaded: steeper over days 0–14 than 14–28, zero width at the anchor, slow never below fast', () => {
    for (const threshold of [0.75, 0.8, 0.85, 0.9, 0.95, 1]) {
      const at = (t: number) => bandEdgesAt(100, 'front-loaded', t, threshold);
      expect(100 - at(14).slowKg).toBeGreaterThan(at(14).slowKg - at(28).slowKg);
      expect(100 - at(14).fastKg).toBeGreaterThan(at(14).fastKg - at(28).fastKg);
      expect(at(0).slowKg).toBe(at(0).fastKg);
      for (let t = 0; t < 28; t++) expect(at(t).slowKg).toBeGreaterThanOrEqual(at(t).fastKg);
    }
  });

  it('blocks are four weeks from the segment start, front-loaded only in the first block of a front-loaded segment', () => {
    const segments: PhaseSegment[] = [
      { kind: 'kickstart', start: '2000-02-01', periodId: 'p', frontLoaded: true },
      { kind: 'steady', start: '2000-03-14', periodId: null, frontLoaded: false },
    ];
    expect(chartBlock(segments, '2000-02-10')).toEqual({
      blockStart: '2000-02-01',
      blockNumber: 0,
      shape: 'front-loaded',
    });
    expect(chartBlock(segments, '2000-03-01')).toEqual({
      blockStart: '2000-02-29',
      blockNumber: 1,
      shape: 'linear',
    });
    expect(chartBlock(segments, '2000-03-14')).toMatchObject({
      blockStart: '2000-03-14',
      blockNumber: 0,
      shape: 'linear',
    });
    expect(chartBlock(segments, '2000-01-31')).toBeNull();
  });

  it('anchors at the 7-day average, else the latest weigh-in of the last 7 days, else the first of block days 1–2', () => {
    const start = '2000-02-01';
    const week = new Map(['2000-01-26', '2000-01-28', '2000-02-01'].map((d) => [d, 90] as const));
    expect(bandAnchor(week, start)).toEqual({ index: 0, kg: 90 });
    expect(bandAnchor(new Map([['2000-02-01', 100]]), start)).toEqual({ index: 0, kg: 100 });
    expect(bandAnchor(new Map([['2000-02-03', 99]]), start)).toEqual({ index: 2, kg: 99 });
    expect(bandAnchor(new Map([['2000-02-04', 99]]), start)).toBeNull();
  });

  it('a carb ceiling is active in keto with the keto ceiling available, and in moderate low-carb', () => {
    expect(carbCeilingActive('keto', { ketoCeilingAvailable: true })).toBe(true);
    expect(carbCeilingActive('keto', { ketoCeilingAvailable: false })).toBe(false);
    expect(carbCeilingActive('moderate-low-carb', { ketoCeilingAvailable: true })).toBe(true);
    expect(carbCeilingActive('balanced', { ketoCeilingAvailable: true })).toBe(false);
  });
});
