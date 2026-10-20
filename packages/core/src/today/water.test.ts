import { describe, expect, it } from 'vitest';
import { electrolyteToggle, waterForDay } from './water';

// Synthetic rows; home zone Pacific/Auckland (NZDT, UTC+13, in March 2000).
const NZ = 'Pacific/Auckland';
const D = '2000-03-15';
const row = (id: string, at: string, ml: number, electrolyte = false, timeZone = NZ) => ({
  id,
  at,
  timeZone,
  ml,
  electrolyte,
});

describe('waterForDay (U3; TD-03, D6)', () => {
  it('places each row on the local date of its own recorded zone', () => {
    const rows = [
      row('a', '2000-03-14T11:30:00.000Z', 250), // 00:30 on 15 March in Auckland
      row('b', '2000-03-15T15:30:00.000Z', 300, false, 'Australia/Perth'), // 23:30 on 15 March in Perth
      row('c', '2000-03-15T11:30:00.000Z', 400), // 00:30 on 16 March in Auckland
    ];
    expect(waterForDay(rows, D, NZ)).toEqual({ totalMl: 550, electrolyte: false, entries: 2 });
  });

  it('an unknown zone falls back to the home zone', () => {
    const rows = [row('a', '2000-03-14T11:30:00.000Z', 250, false, 'Mars/Base')];
    expect(waterForDay(rows, D, NZ).totalMl).toBe(250);
  });

  it('the electrolyte tick alone sets the tick but adds no water and no entry', () => {
    const rows = [
      row('a', '2000-03-14T20:00:00.000Z', 250),
      row('t', '2000-03-14T20:05:00.000Z', 0, true),
    ];
    expect(waterForDay(rows, D, NZ)).toEqual({ totalMl: 250, electrolyte: true, entries: 1 });
  });
});

describe('electrolyteToggle (U3; TD-03, T8)', () => {
  const yesterday = row('y', '2000-03-13T20:00:00.000Z', 0, true);
  const water = row('w', '2000-03-14T20:00:00.000Z', 250, true);
  const tick = row('t', '2000-03-14T20:05:00.000Z', 0, true);

  it('on with no tick creates one; on with one already writes nothing', () => {
    expect(electrolyteToggle([yesterday], D, NZ, true)).toEqual({
      create: true,
      remove: [],
      clear: [],
    });
    expect(electrolyteToggle([tick], D, NZ, true)).toEqual({
      create: false,
      remove: [],
      clear: [],
    });
  });

  it("off removes the day's tick-only rows and clears the tick on its water rows, never another day's", () => {
    expect(electrolyteToggle([yesterday, water, tick], D, NZ, false)).toEqual({
      create: false,
      remove: ['t'],
      clear: ['w'],
    });
  });
});
