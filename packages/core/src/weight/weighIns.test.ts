import { describe, expect, it } from 'vitest';
import type { WeightRecord } from '../storage/records';
import { addDays } from '../util/time';
import {
  belowBmiFloorNow,
  currentWeightFromDaily,
  gateCurrentWeightKg,
  goalReferenceKgFor,
  latestDailyKg,
  latestWeighIn,
  milestoneReferenceKg,
  weeklyChange,
  weighInsFromRecords,
} from './weighIns';

const TODAY = '2000-02-20';
/** 7 pm on TODAY in Auckland (NZ daylight time is UTC+13). */
const NOW = '2000-02-20T06:00:00.000Z';
/** A daily map with `kg` on each of the `days` dates ending `back` days before TODAY. */
const days = (kg: number, count: number, back = 0) =>
  new Map(Array.from({ length: count }, (_, i) => [addDays(TODAY, -back - i), kg] as const));

const ZONE = 'Pacific/Auckland';
/** One weigh-in a day from a daily map, at 1 pm in Auckland (midnight UTC) on its date. */
const rowsOf = (daily: ReadonlyMap<string, number>) =>
  [...daily].map(([date, kg]) => ({ at: `${date}T00:00:00.000Z`, timeZone: ZONE, kg }));

describe('current weights (W3, W32, HS-35)', () => {
  it('belowBmiFloorNow at 180 cm: a 7-day average of 59.0 is low, 60.0 is not, and no height never is', () => {
    expect(belowBmiFloorNow(rowsOf(days(59, 7)), TODAY, NOW, ZONE, 180)).toBe(true);
    expect(belowBmiFloorNow(rowsOf(days(60, 7)), TODAY, NOW, ZONE, 180)).toBe(false);
    expect(belowBmiFloorNow(rowsOf(days(59, 7)), TODAY, NOW, ZONE, null)).toBe(false);
  });

  it('belowBmiFloorNow reads the gates’ current weight: the lower of the average and the latest weigh-in, however old', () => {
    // Two weigh-ins, no average: the latest decides, three days or fifteen days old.
    expect(belowBmiFloorNow(rowsOf(days(59, 1, 3)), TODAY, NOW, ZONE, 180)).toBe(true);
    expect(belowBmiFloorNow(rowsOf(days(59, 1, 15)), TODAY, NOW, ZONE, 180)).toBe(true);
    const averageAboveLatestBelow = new Map([...days(61, 6, 1), [TODAY, 59.5]]);
    expect(currentWeightFromDaily(averageAboveLatestBelow, TODAY)).toBe(59.5);
    expect(belowBmiFloorNow(rowsOf(averageAboveLatestBelow), TODAY, NOW, ZONE, 180)).toBe(true);
  });

  it('HS-35: a later weigh-in below the floor counts on a day whose mean is above it (the latest weigh-in, not the day’s mean)', () => {
    // 180 cm: the floor is 59.94 kg. Six days at 61.0, then 61.0 at 7 am and 59.0 at 6 pm today
    // (NZ daylight time is UTC+13): the day's mean is 60.0 and the 7-day average about 60.9.
    const row = (at: string, kg: number) => ({ at, timeZone: ZONE, kg });
    const rows = [
      ...Array.from({ length: 6 }, (_, i) =>
        row(`2000-02-${String(13 + i).padStart(2, '0')}T18:00:00.000Z`, 61),
      ),
      row('2000-02-19T18:00:00.000Z', 61),
      row('2000-02-20T05:00:00.000Z', 59),
    ];
    expect(gateCurrentWeightKg(rows, TODAY, NOW, ZONE)).toBe(59);
    expect(belowBmiFloorNow(rows, TODAY, NOW, ZONE, 180)).toBe(true);
    // The other order: the morning's 59.0 still counts (the lowest in the 7 days up to the latest).
    const earlierLow = [
      ...rows.slice(0, 6),
      row('2000-02-19T18:00:00.000Z', 59),
      row('2000-02-20T05:00:00.000Z', 61),
    ];
    expect(gateCurrentWeightKg(earlierLow, TODAY, NOW, ZONE)).toBe(59);
  });

  it('HS-35: once now passes a higher weigh-in timed later by a wrong clock, a lower one made after it still counts', () => {
    // 180 cm (floor 59.94 kg); now is 7 pm on 20 Feb. Six days at 61.0 (1 pm, 14 to 19 Feb).
    const row = (at: string, kg: number) => ({ at, timeZone: ZONE, kg });
    const before = Array.from({ length: 6 }, (_, i) =>
      row(`2000-02-${String(14 + i).padStart(2, '0')}T00:00:00.000Z`, 61),
    );
    // Clock ahead: 61.0 saved at 10 am on 19 Feb while the clock read 11 pm, then 59.0 at 6 pm.
    const ahead = [
      ...before,
      row('2000-02-19T10:00:00.000Z', 61),
      row('2000-02-19T05:00:00.000Z', 59),
    ];
    expect(belowBmiFloorNow(ahead, TODAY, NOW, ZONE, 180)).toBe(true);
    // Clock behind: 61.0 at 7 am today, then 59.0 saved at 6 pm while the clock read yesterday.
    const behind = [
      ...before,
      row('2000-02-19T18:00:00.000Z', 61),
      row('2000-02-19T05:00:00.000Z', 59),
    ];
    expect(belowBmiFloorNow(behind, TODAY, NOW, ZONE, 180)).toBe(true);
    // With no weigh-in since, 59.0 still counts 10 days later; one timed more than 7 days after it
    // (5:01 pm on 26 Feb in Auckland) ends that.
    expect(gateCurrentWeightKg(ahead, '2000-03-01', '2000-03-01T06:00:00.000Z', ZONE)).toBe(59);
    const weekLater = [...ahead, row('2000-02-26T05:01:00.000Z', 61)];
    expect(gateCurrentWeightKg(weekLater, '2000-03-01', '2000-03-01T06:00:00.000Z', ZONE)).toBe(61);
  });

  it('HS-35: a weigh-in timed after now never hides a lower one, and counts only when it is lower itself', () => {
    // 180 cm (floor 59.94 kg); now is 7 pm. Six days at 61.0, then 59.0 at 6 pm today and 61.0
    // timed 11 pm today (saved while the phone's clock ran ahead): the Weight card's Latest is 59.0.
    const row = (id: string, at: string, kg: number, timeZone = ZONE): WeightRecord => ({
      id,
      at,
      timeZone,
      kg,
      source: 'manual',
      note: null,
    });
    const before = Array.from({ length: 6 }, (_, i) =>
      row(`d${i}`, `2000-02-${String(14 + i).padStart(2, '0')}T00:00:00.000Z`, 61),
    );
    const aheadHigher = [
      ...before,
      row('real', '2000-02-20T05:00:00.000Z', 59),
      row('ahead', '2000-02-20T10:00:00.000Z', 61),
    ];
    expect(latestWeighIn(aheadHigher, NOW, ZONE)?.kg).toBe(59);
    expect(gateCurrentWeightKg(aheadHigher, TODAY, NOW, ZONE)).toBe(59);
    expect(belowBmiFloorNow(aheadHigher, TODAY, NOW, ZONE, 180)).toBe(true);
    // From an import: a higher row 29 hours ahead in a zone where it is still today never counts.
    const imported = [
      ...aheadHigher.slice(0, 7),
      row('x', '2000-02-21T11:00:00.000Z', 70, 'Etc/GMT+12'),
    ];
    expect(belowBmiFloorNow(imported, TODAY, NOW, ZONE, 180)).toBe(true);
    // A lower one timed after now, even on a later date (a clock now running behind), does count.
    const aheadLower = [
      ...before,
      row('real', '2000-02-20T05:00:00.000Z', 61),
      row('ahead', '2000-02-21T05:00:00.000Z', 59),
    ];
    expect(gateCurrentWeightKg(aheadLower, TODAY, NOW, ZONE)).toBe(59);
  });

  it('HS-35: after a flight west across the date line, a weigh-in made before now still counts', () => {
    // 59.0 kg at 7 am on 20 Feb in Auckland; it is now 4 pm in Auckland, 5 pm on 19 Feb in Rarotonga.
    const rows = [
      ...rowsOf(days(61, 6, 1)),
      { at: '2000-02-19T18:00:00.000Z', timeZone: ZONE, kg: 59 },
    ];
    const now = '2000-02-20T03:00:00.000Z';
    // The phone's date (19 Feb) is before the weigh-in's own date (20 Feb in Auckland).
    expect(belowBmiFloorNow(rows, '2000-02-19', now, ZONE, 180)).toBe(true);
  });

  it('W3: the milestone reference is the higher, the goal reference the lower, and both need a weigh-in in the last 14 days', () => {
    const falling = new Map([...days(100, 6, 1), [TODAY, 97]]);
    expect(milestoneReferenceKg(falling, TODAY)).toBeCloseTo((600 + 97) / 7, 9);
    expect(goalReferenceKgFor(falling, TODAY)).toBe(97);
    const rising = new Map([...days(100, 6, 1), [TODAY, 103]]);
    expect(milestoneReferenceKg(rising, TODAY)).toBe(103);
    // Fewer than 3 days: the latest weigh-in.
    expect(milestoneReferenceKg(days(90, 2), TODAY)).toBe(90);
    expect(milestoneReferenceKg(days(90, 1, 15), TODAY)).toBeNull();
    expect(goalReferenceKgFor(days(90, 1, 15), TODAY)).toBeNull();
    expect(latestDailyKg(days(90, 1, 14), TODAY, 14)).toBeNull();
    expect(latestDailyKg(days(90, 1, 13), TODAY, 14)).toBe(90);
  });

  it('weigh-ins after now are ignored: the latest weigh-in is the newest up to now (ties: the later id)', () => {
    const row = (id: string, at: string, kg: number): WeightRecord => ({
      id,
      at,
      timeZone: 'Pacific/Auckland',
      kg,
      source: 'manual',
      note: null,
    });
    const rows = [
      row('a', '2000-02-19T18:00:00.000Z', 90),
      row('b', '2000-02-19T18:00:00.000Z', 91),
      row('c', '2000-02-21T18:00:00.000Z', 80),
    ];
    expect(latestWeighIn(rows, '2000-02-20T00:00:00.000Z', 'Pacific/Auckland')).toEqual({
      id: 'b',
      kg: 91,
      at: '2000-02-19T18:00:00.000Z',
      timeZone: 'Pacific/Auckland',
      date: '2000-02-20',
    });
  });

  it('an imported zone this browser does not know falls back instead of throwing (storage spec 3.4, D6)', () => {
    const { weighIns, zoneFallback } = weighInsFromRecords(
      [{ at: '2000-02-19T18:00:00.000Z', timeZone: 'Example/Unknown_Zone', kg: 90 }],
      'Pacific/Auckland',
    );
    expect(zoneFallback).toBe(true);
    expect(weighIns[0]?.timeZone).toBe('Pacific/Auckland');
  });

  it('weekly change: down, up, or about level when it rounds to 0.0; null with too few weigh-ins', () => {
    const series = (perDay: number) =>
      new Map(Array.from({ length: 14 }, (_, i) => [addDays(TODAY, -i), 90 + perDay * i] as const));
    expect(weeklyChange(series(0.1), TODAY)).toEqual({
      direction: 'down',
      kgPerWeek: expect.closeTo(0.7, 9) as number,
    });
    expect(weeklyChange(series(-0.1), TODAY)?.direction).toBe('up');
    expect(weeklyChange(series(0.004), TODAY)?.direction).toBe('level');
    expect(weeklyChange(days(90, 2), TODAY)).toBeNull();
  });
});
